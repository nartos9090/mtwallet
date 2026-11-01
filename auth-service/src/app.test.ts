import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from './app.ts'
import { seal, unseal } from './crypto.ts'

const env = {
  GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_CLIENT_SECRET: 'client-secret',
  SESSION_SECRET: 'a-test-secret-that-is-at-least-32-chars',
}
const DRIVE = 'https://www.googleapis.com/auth/drive.file'
const idToken = (email: string) => `header.${btoa(JSON.stringify({ email })).replace(/=+$/, '')}.signature`

/** Stand-in for Google's token endpoint. */
let google: ReturnType<typeof vi.fn<typeof fetch>>
const respond = (status: number, body: object) =>
  google.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }))

beforeEach(() => {
  google = vi.fn<typeof fetch>()
})

const app = () => createApp(env, { fetch: google })
const post = (path: string, init: { body?: object; cookie?: string; origin?: string } = {}) =>
  app().request(`http://wallet.test/api/auth${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: init.origin ?? 'http://wallet.test',
      ...(init.cookie ? { Cookie: init.cookie } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
const sessionCookie = (response: Response) => response.headers.get('Set-Cookie')?.split(';')[0]

describe('crypto', () => {
  it('round-trips and rejects tampering or another secret', async () => {
    const sealed = await seal({ rt: 'token' }, env.SESSION_SECRET)
    expect(await unseal(sealed, env.SESSION_SECRET)).toEqual({ rt: 'token' })
    expect(await unseal(sealed, 'another-secret-that-is-also-32-chars-long')).toBeUndefined()
    expect(await unseal(`${sealed.slice(0, -2)}AA`, env.SESSION_SECRET)).toBeUndefined()
    expect(await unseal('garbage', env.SESSION_SECRET)).toBeUndefined()
  })
})

describe('auth service', () => {
  it('reports whether it is configured', async () => {
    expect(await (await app().request('/api/auth/health')).json()).toEqual({ ok: true })
    const unconfigured = createApp({ GOOGLE_CLIENT_ID: 'x' })
    expect(await (await unconfigured.request('/api/auth/health')).json()).toEqual({ ok: false, error: 'not_configured' })
    expect((await unconfigured.request('/api/auth/token', { method: 'POST' })).status).toBe(503)
  })

  it('exchanges a code, then refreshes from the cookie alone', async () => {
    respond(200, {
      access_token: 'access-1',
      expires_in: 3599,
      scope: `openid ${DRIVE} email`,
      refresh_token: 'refresh-1',
      id_token: idToken('me@example.com'),
    })
    const exchanged = await post('/exchange', { body: { code: 'the-code' } })
    expect(await exchanged.json()).toEqual({ accessToken: 'access-1', expiresIn: 3599, email: 'me@example.com' })
    const setCookie = exchanged.headers.get('Set-Cookie')!
    expect(setCookie).toMatch(/HttpOnly/)
    expect(setCookie).toMatch(/Secure/)
    expect(setCookie).toMatch(/SameSite=Strict/)
    expect(setCookie).toMatch(/Path=\/api\/auth/)
    expect(setCookie).not.toContain('refresh-1') // encrypted
    const body = new URLSearchParams(google.mock.calls[0][1]!.body as URLSearchParams)
    expect(Object.fromEntries(body)).toMatchObject({ code: 'the-code', redirect_uri: 'postmessage', client_secret: 'client-secret' })

    respond(200, { access_token: 'access-2', expires_in: 3599, scope: DRIVE })
    const refreshed = await post('/token', { cookie: sessionCookie(exchanged) })
    expect(await refreshed.json()).toEqual({ accessToken: 'access-2', expiresIn: 3599, email: 'me@example.com' })
    expect(Object.fromEntries(new URLSearchParams(google.mock.calls[1][1]!.body as URLSearchParams))).toMatchObject({
      grant_type: 'refresh_token',
      refresh_token: 'refresh-1',
    })
  })

  it('asks for consent again when Google sends no refresh token', async () => {
    respond(200, { access_token: 'a', expires_in: 3599, scope: DRIVE })
    expect((await post('/exchange', { body: { code: 'c' } })).status).toBe(409)
  })

  it('refuses a sign-in without Drive access', async () => {
    respond(200, { access_token: 'a', expires_in: 3599, scope: 'openid email', refresh_token: 'r' })
    const response = await post('/exchange', { body: { code: 'c' } })
    expect(response.status).toBe(403)
    expect(response.headers.get('Set-Cookie')).toBeNull()
  })

  it('signs out when the session is missing, forged or revoked', async () => {
    expect((await post('/token')).status).toBe(401)
    expect((await post('/token', { cookie: 'wallet_session=forged' })).status).toBe(401)

    const cookie = `wallet_session=${await seal({ rt: 'revoked' }, env.SESSION_SECRET)}`
    respond(400, { error: 'invalid_grant' })
    const response = await post('/token', { cookie })
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'signed_out' })
    expect(response.headers.get('Set-Cookie')).toMatch(/Max-Age=0/)
  })

  it('reports other Google failures as 502, not as a sign-out', async () => {
    const cookie = `wallet_session=${await seal({ rt: 'r' }, env.SESSION_SECRET)}`
    respond(500, { error: 'backend_error' })
    expect((await post('/token', { cookie })).status).toBe(502)
  })

  it('refuses requests from other sites', async () => {
    expect((await post('/token', { origin: 'https://evil.example' })).status).toBe(403)
    expect(google).not.toHaveBeenCalled()
  })

  it('revokes the refresh token on sign-out', async () => {
    const cookie = `wallet_session=${await seal({ rt: 'refresh-1' }, env.SESSION_SECRET)}`
    google.mockResolvedValueOnce(new Response('{}'))
    const response = await post('/signout', { cookie })
    expect(response.status).toBe(200)
    expect(google.mock.calls[0][0]).toBe('https://oauth2.googleapis.com/revoke')
    expect(response.headers.get('Set-Cookie')).toMatch(/Max-Age=0/)
  })
})
