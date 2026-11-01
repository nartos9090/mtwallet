import { Hono } from 'hono'
import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { seal, unseal } from './crypto.ts'
import {
  DRIVE_FILE_SCOPE,
  emailFromIdToken,
  exchangeCode,
  type GoogleConfig,
  GoogleError,
  refreshAccessToken,
  revoke,
} from './google.ts'

/**
 * Keeps the Wallet app signed in to Google. The browser only gets short-lived
 * access tokens; the refresh token lives in an encrypted, HttpOnly cookie that
 * page scripts can't read. Nothing is stored server-side, and no user data
 * passes through here: the app talks to Google Sheets directly.
 *
 *   GET  /api/auth/health    { ok }: is the service configured? (the app falls back to browser sign-in if not)
 *   POST /api/auth/exchange  { code } from the sign-in popup -> access token, sets the session cookie
 *   POST /api/auth/token     session cookie -> fresh access token
 *   POST /api/auth/signout   revokes the refresh token, clears the cookie
 */

export interface AuthEnv {
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  /** Random string, at least 32 characters. Changing it signs everyone out. */
  SESSION_SECRET?: string
  /** Comma-separated origins allowed to call the service. Defaults to the service's own origin. */
  ALLOWED_ORIGINS?: string
}

interface Session {
  /** Google refresh token. */
  rt: string
  email?: string
}

export const BASE_PATH = '/api/auth'
const COOKIE = 'wallet_session'
/** Refreshed on every use, so an active device stays signed in. */
const SESSION_MAX_AGE = 180 * 24 * 60 * 60

export function createApp(env: AuthEnv, deps: { fetch?: typeof fetch } = {}) {
  const configured = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && (env.SESSION_SECRET?.length ?? 0) >= 32)
  const google: GoogleConfig = {
    clientId: env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: env.GOOGLE_CLIENT_SECRET ?? '',
    fetch: deps.fetch ?? ((...args) => fetch(...args)),
  }
  const secret = env.SESSION_SECRET ?? ''
  const allowedOrigins = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)

  const app = new Hono().basePath(BASE_PATH)

  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store')
    if (c.req.method !== 'GET') {
      // The cookie is SameSite=Strict already; also refuse other sites explicitly.
      const origin = c.req.header('Origin')
      const ownOrigin = new URL(c.req.url).origin
      const allowed = allowedOrigins.length > 0 ? allowedOrigins : [ownOrigin]
      if (origin && !allowed.includes(origin)) return c.json({ error: 'forbidden_origin' }, 403)
      if (!configured) return c.json({ error: 'not_configured' }, 503)
    }
    await next()
  })

  const saveSession = async (c: Context, session: Session) =>
    setCookie(c, COOKIE, await seal(session, secret), {
      path: BASE_PATH,
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      maxAge: SESSION_MAX_AGE,
    })
  const clearSession = (c: Context) => deleteCookie(c, COOKIE, { path: BASE_PATH, secure: true })

  // 200 either way: an unconfigured service is a valid setup (browser-only sign-in), not an error.
  app.get('/health', (c) => c.json(configured ? { ok: true } : { ok: false, error: 'not_configured' }))

  app.post('/exchange', async (c) => {
    const { code } = await c.req.json<{ code?: string }>().catch(() => ({ code: undefined }))
    if (!code) return c.json({ error: 'missing_code' }, 400)
    const tokens = await exchangeCode(google, code)
    if (!tokens.scope.split(' ').includes(DRIVE_FILE_SCOPE)) return c.json({ error: 'missing_scope' }, 403)
    // Google only sends a refresh token when the user saw the consent screen.
    if (!tokens.refresh_token) return c.json({ error: 'no_refresh_token' }, 409)
    const email = emailFromIdToken(tokens.id_token)
    await saveSession(c, { rt: tokens.refresh_token, email })
    return c.json({ accessToken: tokens.access_token, expiresIn: tokens.expires_in, email })
  })

  app.post('/token', async (c) => {
    const cookie = getCookie(c, COOKIE)
    const session = cookie ? await unseal<Session>(cookie, secret) : undefined
    if (!session?.rt) {
      clearSession(c)
      return c.json({ error: 'signed_out' }, 401)
    }
    const tokens = await refreshAccessToken(google, session.rt)
    // Google may hand out a new refresh token; keep whichever is current.
    await saveSession(c, { ...session, rt: tokens.refresh_token ?? session.rt })
    return c.json({ accessToken: tokens.access_token, expiresIn: tokens.expires_in, email: session.email })
  })

  app.post('/signout', async (c) => {
    const cookie = getCookie(c, COOKIE)
    const session = cookie ? await unseal<Session>(cookie, secret) : undefined
    if (session?.rt) await revoke(google, session.rt).catch(() => {})
    clearSession(c)
    return c.json({ ok: true })
  })

  app.onError((error, c) => {
    if (error instanceof GoogleError && error.code === 'invalid_grant') {
      // Revoked, expired, or the user removed access in their Google account.
      clearSession(c)
      return c.json({ error: 'signed_out' }, 401)
    }
    if (error instanceof GoogleError) return c.json({ error: 'google_error', detail: error.code }, 502)
    console.error(error)
    return c.json({ error: 'internal_error' }, 500)
  })

  app.notFound((c) => c.json({ error: 'not_found' }, 404))
  return app
}
