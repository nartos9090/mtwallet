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

  interface CodeResponse {
    code: string
    scope: string
    error?: string
    error_description?: string
  }

  interface CodeClient {
    requestCode(): void
  }

  /** Always asks for offline access with consent, so the exchange yields a refresh token. */
  function initCodeClient(config: {
    client_id: string
    scope: string
    ux_mode: 'popup' | 'redirect'
    login_hint?: string
    select_account?: boolean
    callback: (response: CodeResponse) => void
    error_callback?: (error: ClientConfigError) => void
  }): CodeClient

  function hasGrantedAllScopes(response: TokenResponse, ...scopes: string[]): boolean

  function revoke(accessToken: string, done?: () => void): void
}
