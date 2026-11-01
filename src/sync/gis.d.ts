/** The parts of Google Identity Services (accounts.google.com/gsi/client) this app uses. */
declare namespace google.accounts.oauth2 {
  interface TokenResponse {
    access_token: string
    expires_in: number
    scope: string
    error?: string
    error_description?: string
  }

  interface ClientConfigError {
    type: 'popup_failed_to_open' | 'popup_closed' | 'unknown'
    message: string
  }

  interface TokenClient {
    requestAccessToken(overrides?: { prompt?: string; login_hint?: string }): void
  }

  function initTokenClient(config: {
    client_id: string
    scope: string
    callback: (response: TokenResponse) => void
    error_callback?: (error: ClientConfigError) => void
  }): TokenClient

  function hasGrantedAllScopes(response: TokenResponse, ...scopes: string[]): boolean

  function revoke(accessToken: string, done?: () => void): void
}
