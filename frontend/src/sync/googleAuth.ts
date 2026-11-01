/**
 * Google sign-in, in two modes:
 *
 * - With the auth service (auth-service/, served at /api/auth): sign in once
 *   per device. The service keeps the refresh token in an encrypted HttpOnly
 *   cookie and hands out fresh access tokens silently.
 * - Browser only, as a fallback when the service is missing (e.g. a static
 *   deployment), not configured, over its daily limit or down: Identity
 *   Services gives an access token for about an hour, then the user taps
 *   "Sign in" again.
 *
 * Either way the app calls Google APIs directly with the access token.
 * Signing in opens a popup, so it must start from a tap.
 */

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const DRIVE_FILE = 'https://www.googleapis.com/auth/drive.file'
const SCOPES = `${DRIVE_FILE} openid email`
const API = '/api/auth'
const TOKEN_KEY = 'google-token'
const SESSION_KEY = 'google-session'
/** Treat the token as expired a minute early, so a sync doesn't fail halfway. */
const EXPIRY_MARGIN_MS = 60_000

/** The auth service can't help right now (daily limit, outage, or not deployed). */
export class ServiceUnavailableError extends Error {
  constructor() {
    super('The sign-in service is busy right now')
  }
}

interface StoredToken {
  accessToken: string
  expiresAt: number
}

interface Session {
  /** Signed in through the auth service: tokens can be refreshed silently. */
  service: boolean
  email?: string
}

interface TokenResult {
  accessToken: string
  expiresIn: number
  email?: string
}

function read<T>(key: string): T | undefined {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? 'null') as T | null) ?? undefined
  } catch {
    return undefined
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === undefined) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Blocked storage: works for this session only.
  }
}

function storeToken(accessToken: string, expiresIn: number) {
  write(TOKEN_KEY, { accessToken, expiresAt: Date.now() + expiresIn * 1000 } satisfies StoredToken)
}

/** A still-valid access token from storage, if any. */
export function cachedToken(): string | undefined {
  const stored = read<StoredToken>(TOKEN_KEY)
  if (stored && stored.expiresAt - EXPIRY_MARGIN_MS > Date.now()) return stored.accessToken
}

/** Drops the access token (e.g. after Google rejected it). The service session stays. */
export function forgetToken() {
  write(TOKEN_KEY, undefined)
}

export const hasServiceSession = () => read<Session>(SESSION_KEY)?.service === true

/** undefined until probed. */
let serviceAvailable: boolean | undefined

/**
 * Calls the auth service. Returns its JSON for success and for its own
 * refusals (signed out, missing scope); throws ServiceUnavailableError for
 * anything else: 429 from the platform's daily limit, 5xx, an HTML error page,
 * no service at all, or a network failure while online.
 */
async function callService<T>(path: string, body?: object): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  let response: Response
  try {
    response = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (e) {
    if (!navigator.onLine) throw new Error("You're offline")
    serviceAvailable = false
    throw Object.assign(new ServiceUnavailableError(), { cause: e })
  }
  const json = await readJson<T & { error?: string }>(response)
  if (response.ok && json) {
    serviceAvailable = true
    return { ok: true, data: json }
  }
  if (json?.error && [400, 401, 403, 409].includes(response.status)) return { ok: false, error: json.error }
  serviceAvailable = false
  throw new ServiceUnavailableError()
}

/**
 * The JSON body, or undefined for anything else (e.g. a platform's HTML error
 * page, or index.html from a static host without the service). The body is
 * always consumed: an unread one keeps the request open in Chrome.
 */
async function readJson<T>(response: Response): Promise<T | undefined> {
  if (!response.headers.get('Content-Type')?.includes('application/json')) {
    await response.body?.cancel()
    return undefined
  }
  return (await response.json().catch(() => undefined)) as T | undefined
}

/** Checks whether the auth service is deployed and configured. Cached for the session. */
async function probeService(): Promise<boolean> {
  if (serviceAvailable !== undefined) return serviceAvailable
  try {
    const response = await fetch(`${API}/health`)
    serviceAvailable = response.ok && (await readJson<{ ok?: boolean }>(response))?.ok === true
  } catch {
    serviceAvailable = false
  }
  return serviceAvailable
}

let scriptLoad: Promise<void> | undefined

/** Loads the Google script. Call early: awaiting it inside a tap handler can make browsers block the popup. */
export function loadGoogle(): Promise<void> {
  scriptLoad ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      scriptLoad = undefined
      reject(new Error("Couldn't reach Google. Check your connection."))
    }
    document.head.append(script)
  })
  return scriptLoad
}

/** Everything signIn needs before the tap: Google's script and which sign-in mode to use. */
export function prepareSignIn(): Promise<unknown> {
  return Promise.all([loadGoogle().catch(() => {}), probeService()])
}

/**
 * Without a tap: a cached token, or a fresh one from the auth service.
 * Returns undefined when the user has to sign in. Throws
 * ServiceUnavailableError when there is a session but the service can't
 * refresh it right now.
 */
export async function getAccessToken(): Promise<string | undefined> {
  const cached = cachedToken()
  if (cached) return cached
  if (!hasServiceSession()) return undefined
  const result = await callService<TokenResult>('/token')
  if (!result.ok) {
    // Revoked or expired: a new sign-in is needed.
    write(SESSION_KEY, { ...read<Session>(SESSION_KEY), service: false })
    return undefined
  }
  storeToken(result.data.accessToken, result.data.expiresIn)
  return result.data.accessToken
}

const SERVICE_ERRORS: Record<string, string> = {
  missing_scope: 'Wallet needs permission to create and edit its own sheet in your Drive. Sign in again and allow it.',
  no_refresh_token: 'Google did not allow staying signed in. Sign in again.',
}

/** Opens Google's sign-in popup (call from a tap). Stays signed in when the auth service is available. */
export async function signIn(loginHint?: string): Promise<{ token: string; email?: string }> {
  if (!CLIENT_ID) throw new Error('VITE_GOOGLE_CLIENT_ID is not set')
  await loadGoogle()

  if (serviceAvailable) {
    const code = await requestCode(loginHint)
    let result
    try {
      result = await callService<TokenResult>('/exchange', { code })
    } catch (e) {
      if (e instanceof ServiceUnavailableError) {
        // The popup can't reopen without a new tap; the next tap uses browser sign-in.
        throw new Error('The sign-in service is busy right now. Tap Sign in again to sign in.')
      }
      throw e
    }
    if (!result.ok) throw new Error(SERVICE_ERRORS[result.error] ?? `Sign-in failed (${result.error})`)
    storeToken(result.data.accessToken, result.data.expiresIn)
    write(SESSION_KEY, { service: true, email: result.data.email } satisfies Session)
    return { token: result.data.accessToken, email: result.data.email }
  }

  return { token: await requestBrowserToken(loginHint) }
}

/** Signs out of the service session (revoking its refresh token) and the browser token. */
export async function signOut() {
  const token = cachedToken()
  forgetToken()
  if (hasServiceSession()) await callService('/signout').catch(() => {})
  write(SESSION_KEY, undefined)
  if (token && typeof google !== 'undefined') google.accounts.oauth2.revoke(token)
}

export async function fetchEmail(token: string): Promise<string | undefined> {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  })
  return response.ok ? ((await response.json()) as { email?: string }).email : undefined
}

// --- Identity Services popups. Each sign-in has one pending request at a time.

let pending: { resolve: (value: string) => void; reject: (error: Error) => void } | undefined

function settle(result: { value: string } | { error: Error }) {
  const p = pending
  pending = undefined
  if ('value' in result) p?.resolve(result.value)
  else p?.reject(result.error)
}

function popupError(error: google.accounts.oauth2.ClientConfigError) {
  return new Error(
    error.type === 'popup_closed'
      ? 'Sign-in was cancelled'
      : error.type === 'popup_failed_to_open'
        ? 'The sign-in popup was blocked. Allow pop-ups for this site and try again.'
        : error.message,
  )
}

const MISSING_DRIVE =
  'Wallet needs permission to create and edit its own sheet in your Drive. Sign in again and allow it.'

function waitForPopup(open: () => void): Promise<string> {
  // A previous attempt the user abandoned never calls back: drop it.
  settle({ error: new Error('Sign-in was restarted') })
  return new Promise((resolve, reject) => {
    pending = { resolve, reject }
    open()
  })
}

/** Popup for an authorization code, exchanged by the auth service (always with consent, offline access). */
function requestCode(loginHint?: string): Promise<string> {
  const client = google.accounts.oauth2.initCodeClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    ux_mode: 'popup',
    login_hint: loginHint,
    callback: (response) => {
      if (response.error) return settle({ error: new Error(response.error_description ?? response.error) })
      if (!response.scope.split(' ').includes(DRIVE_FILE)) return settle({ error: new Error(MISSING_DRIVE) })
      settle({ value: response.code })
    },
    error_callback: (error) => settle({ error: popupError(error) }),
  })
  return waitForPopup(() => client.requestCode())
}

let tokenClient: google.accounts.oauth2.TokenClient | undefined

/** Popup for an hour-long access token, without the auth service. */
function requestBrowserToken(loginHint?: string): Promise<string> {
  tokenClient ??= google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: (response) => {
      if (response.error) return settle({ error: new Error(response.error_description ?? response.error) })
      if (!google.accounts.oauth2.hasGrantedAllScopes(response, DRIVE_FILE)) {
        return settle({ error: new Error(MISSING_DRIVE) })
      }
      storeToken(response.access_token, response.expires_in)
      settle({ value: response.access_token })
    },
    error_callback: (error) => settle({ error: popupError(error) }),
  })
  return waitForPopup(() => tokenClient!.requestAccessToken({ prompt: '', login_hint: loginHint }))
}
