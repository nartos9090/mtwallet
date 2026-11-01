/** Google's OAuth token endpoint: code exchange, refresh, revoke. */

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

export interface GoogleConfig {
  clientId: string
  clientSecret: string
  fetch: typeof fetch
}

export interface TokenResponse {
  access_token: string
  expires_in: number
  scope: string
  refresh_token?: string
  id_token?: string
}

export class GoogleError extends Error {
  /** OAuth error code, e.g. "invalid_grant" for a revoked or expired refresh token. */
  readonly code: string
  readonly status: number

  constructor(code: string, status: number, message?: string) {
    super(message ?? code)
    this.code = code
    this.status = status
  }
}

async function tokenRequest(config: GoogleConfig, params: Record<string, string>): Promise<TokenResponse> {
  const response = await config.fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...params }),
  })
  const body = (await response.json().catch(() => ({}))) as Partial<TokenResponse> & {
    error?: string
    error_description?: string
  }
  if (!response.ok || !body.access_token) {
    throw new GoogleError(body.error ?? 'google_error', response.status, body.error_description)
  }
  return body as TokenResponse
}

/** Exchanges a code from the Identity Services popup ("postmessage" is its redirect URI). */
export const exchangeCode = (config: GoogleConfig, code: string) =>
  tokenRequest(config, { code, grant_type: 'authorization_code', redirect_uri: 'postmessage' })

export const refreshAccessToken = (config: GoogleConfig, refreshToken: string) =>
  tokenRequest(config, { refresh_token: refreshToken, grant_type: 'refresh_token' })

export async function revoke(config: GoogleConfig, token: string): Promise<void> {
  await config.fetch(REVOKE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }),
  })
}

/** The email claim of an ID token. It comes straight from Google over TLS, so it isn't re-verified. */
export function emailFromIdToken(idToken: string | undefined): string | undefined {
  try {
    const payload = idToken?.split('.')[1]
    if (!payload) return undefined
    return (JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { email?: string }).email
  } catch {
    return undefined
  }
}
