import { liveQuery } from 'dexie'
import { db } from '@/core/db'
import {
  createWalletSpreadsheet,
  findWalletSpreadsheet,
  GoogleApiError,
  GoogleSheetStore,
} from '@/core/sync/googleSheets'
import { emptyBase } from '@/core/sync/sheet'
import { runSync } from '@/core/sync/sync'
import {
  cachedToken,
  fetchEmail,
  forgetToken,
  getAccessToken,
  hasServiceSession,
  prepareSignIn,
  ServiceUnavailableError,
  signIn,
  signOut,
} from '@/sync/googleAuth'

export interface SyncStatus {
  /** off: not connected. needs-auth: connected, but the Google token expired. */
  phase: 'off' | 'idle' | 'syncing' | 'needs-auth' | 'error'
  email?: string
  spreadsheetId?: string
  lastSyncedAt?: number
  error?: string
  /** Rows in the sheet that couldn't be read. */
  warnings: string[]
  /** Why a sign-in is needed, when it isn't simply the first one. */
  notice?: string
}

const SERVICE_BUSY =
  "Staying signed in isn't available right now (the service may have hit its daily limit). Sign in to sync for the next hour; it comes back on its own, usually by tomorrow."


let status: SyncStatus = { phase: 'off', warnings: [] }
const listeners = new Set<() => void>()

function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch }
  listeners.forEach((listener) => listener())
}

export const getSyncStatus = () => status
export function subscribeSyncStatus(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

let running: Promise<void> | undefined
let runAgain = false
let retriedAuth = false

/** Syncs now. `interactive` (from a tap) may open Google's sign-in popup when the token expired. */
export async function syncNow({ interactive = false } = {}): Promise<void> {
  if (running) {
    runAgain = true
    return running
  }
  const state = await db.getSyncState()
  if (!state) return setStatus({ phase: 'off', email: undefined, spreadsheetId: undefined })

  let token = cachedToken()
  if (!token && !(interactive && status.phase === 'needs-auth')) {
    // Silently, from the auth service session if there is one.
    try {
      token = await getAccessToken()
    } catch (e) {
      if (e instanceof ServiceUnavailableError) return setStatus({ phase: 'needs-auth', notice: SERVICE_BUSY })
      return setStatus({ phase: 'error', error: message(e) })
    }
  }
  if (!token) {
    if (!interactive) return setStatus({ phase: 'needs-auth' })
    // From a tap: open the popup right away, or browsers block it.
    try {
      token = (await signIn(state.email)).token
    } catch (e) {
      return setStatus({ phase: 'needs-auth', error: message(e) })
    }
  }
  const signedInToken = token

  setStatus({ phase: 'syncing', error: undefined, notice: undefined })
  running = (async () => {
    try {
      const result = await runSync(db, new GoogleSheetStore(signedInToken, state.spreadsheetId))
      setStatus({ phase: 'idle', lastSyncedAt: Date.now(), warnings: result.warnings })
      retriedAuth = false
    } catch (e) {
      if (e instanceof GoogleApiError && e.status === 401) {
        // Google rejected the token: with a service session, refresh and retry once.
        forgetToken()
        setStatus({ phase: 'needs-auth' })
        if (hasServiceSession() && !retriedAuth) {
          retriedAuth = true
          runAgain = true
        }
      } else if (e instanceof GoogleApiError && e.status === 404) {
        setStatus({ phase: 'error', error: 'Your Wallet sheet is gone. Disconnect and connect again to create a new one.' })
      } else {
        setStatus({ phase: 'error', error: message(e) })
      }
    } finally {
      running = undefined
      if (runAgain) {
        runAgain = false
        void syncNow()
      }
    }
  })()
  return running
}

/** Signs in, then uses the account's Wallet sheet or creates one. Call from a tap. */
export async function connect(): Promise<void> {
  const { token, email = await fetchEmail(token) } = await signIn()
  const spreadsheetId =
    (await findWalletSpreadsheet(token)) ??
    (await createWalletSpreadsheet(token, Intl.DateTimeFormat().resolvedOptions().timeZone))
  await db.setSyncState({ spreadsheetId, email, base: emptyBase() })
  setStatus({ email, spreadsheetId, warnings: [] })
  await syncNow()
}

/** Onboarding on a new device: signs in and pulls the existing sheet. Call from a tap. */
export async function restore(): Promise<'restored' | 'not-found'> {
  const { token, email = await fetchEmail(token) } = await signIn()
  const spreadsheetId = await findWalletSpreadsheet(token)
  if (!spreadsheetId) return 'not-found'
  await db.setSyncState({ spreadsheetId, email, base: emptyBase() })
  setStatus({ email, spreadsheetId, warnings: [] })
  await syncNow()
  if (status.phase === 'error') {
    await db.setSyncState(undefined)
    throw new Error(status.error)
  }
  return 'restored'
}

/** Stops syncing on this device. The sheet stays in Drive. */
export async function disconnect(): Promise<void> {
  await signOut()
  await db.setSyncState(undefined)
  setStatus({
    phase: 'off',
    email: undefined,
    spreadsheetId: undefined,
    lastSyncedAt: undefined,
    error: undefined,
    notice: undefined,
    warnings: [],
  })
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

const CHANGE_DELAY_MS = 2_000
const INTERVAL_MS = 5 * 60_000
let started = false
let timer: ReturnType<typeof setTimeout> | undefined

function schedule(delay = CHANGE_DELAY_MS) {
  clearTimeout(timer)
  timer = setTimeout(() => void syncNow(), delay)
}

/** Starts background sync: after local changes, every few minutes, and when the app comes back. */
export function startAutoSync() {
  if (started) return
  started = true

  void db.getSyncState().then((state) => {
    if (!state) return
    setStatus({
      // With a service session the first sync refreshes silently.
      phase: cachedToken() || hasServiceSession() ? 'idle' : 'needs-auth',
      email: state.email,
      spreadsheetId: state.spreadsheetId,
      lastSyncedAt: state.lastSyncedAt,
    })
    // Ready before the user taps "Sign in", so the popup isn't blocked.
    void prepareSignIn()
  })

  // Every local edit bumps an updatedAt, so watching the newest ones catches all changes.
  liveQuery(() =>
    Promise.all([db.accounts, db.categories, db.transactions].map((table) => table.orderBy('updatedAt').last())),
  ).subscribe(() => schedule())

  setInterval(() => schedule(0), INTERVAL_MS)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') schedule(0)
  })
  window.addEventListener('online', () => schedule(0))
}
