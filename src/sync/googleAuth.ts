/**
 * Google sign-in with the Identity Services token flow: a browser-only app
 * gets an access token for about an hour, with no refresh token. Signing in
 * opens a popup, so it must start from a tap; when the token expires the user
 * taps "Sign in" again (quick when they already agreed before).
 */

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const DRIVE_FILE = 'https://www.googleapis.com/auth/drive.file'
const SCOPES = `${DRIVE_FILE} openid email`
const TOKEN_KEY = 'google-token'
/** Treat the token as expired a minute early, so a sync doesn't fail halfway. */
const EXPIRY_MARGIN_MS = 60_000

interface StoredToken {
  accessToken: string
  expiresAt: number
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

export function currentToken(): string | undefined {
  try {
    const stored = JSON.parse(localStorage.getItem(TOKEN_KEY) ?? 'null') as StoredToken | null
    if (stored && stored.expiresAt - EXPIRY_MARGIN_MS > Date.now()) return stored.accessToken
  } catch {
    // Unreadable or blocked storage: sign in again.
  }
}

export function forgetToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Nothing stored.
  }
}

let client: google.accounts.oauth2.TokenClient | undefined
let pending: { resolve: (token: string) => void; reject: (error: Error) => void } | undefined

function settle(result: { token: string } | { error: Error }) {
  const p = pending
  pending = undefined
  if ('token' in result) p?.resolve(result.token)
  else p?.reject(result.error)
}

/** Opens Google's sign-in popup and resolves with an access token. */
export async function signIn(loginHint?: string): Promise<string> {
  if (!CLIENT_ID) throw new Error('VITE_GOOGLE_CLIENT_ID is not set')
  await loadGoogle()
  client ??= google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: (response) => {
      if (response.error) return settle({ error: new Error(response.error_description ?? response.error) })
      if (!google.accounts.oauth2.hasGrantedAllScopes(response, DRIVE_FILE)) {
        return settle({
          error: new Error('Wallet needs permission to create and edit its own sheet in your Drive. Sign in again and allow it.'),
        })
      }
      const token: StoredToken = {
        accessToken: response.access_token,
        expiresAt: Date.now() + response.expires_in * 1000,
      }
      try {
        localStorage.setItem(TOKEN_KEY, JSON.stringify(token))
      } catch {
        // Works for this session only.
      }
      settle({ token: token.accessToken })
    },
    error_callback: (error) =>
      settle({
        error: new Error(
          error.type === 'popup_closed'
            ? 'Sign-in was cancelled'
            : error.type === 'popup_failed_to_open'
              ? 'The sign-in popup was blocked. Allow pop-ups for this site and try again.'
              : error.message,
        ),
      }),
  })
  // A previous attempt the user abandoned never calls back: drop it.
  settle({ error: new Error('Sign-in was restarted') })
  return new Promise((resolve, reject) => {
    pending = { resolve, reject }
    client!.requestAccessToken({ prompt: '', login_hint: loginHint })
  })
}

export function signOut() {
  const token = currentToken()
  forgetToken()
  if (token && typeof google !== 'undefined') google.accounts.oauth2.revoke(token)
}

export async function fetchEmail(token: string): Promise<string | undefined> {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  })
  return response.ok ? ((await response.json()) as { email?: string }).email : undefined
}
