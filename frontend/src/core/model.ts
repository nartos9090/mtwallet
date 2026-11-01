/**
 * Domain model. Framework-independent: used by the UI, the local DB,
 * the Google Sheets sync, and (later) the server-side agent.
 *
 * Every synced entity carries `id`, `updatedAt` and `deleted` so that
 * changes from the app, manual Sheet edits and the agent can be merged.
 * Deletes are soft (tombstones) so they propagate through sync.
 */

export type Id = string

export interface Syncable {
  id: Id
  /** Epoch ms of the last local change. */
  updatedAt: number
  deleted: boolean
}

export interface Account extends Syncable {
  name: string
  /** CSS hex color, e.g. "#ccdbff". */
  color: string
  icon?: string
  orderNum: number
}

export interface Category extends Syncable {
  name: string
  color: string
  icon?: string
  orderNum: number
}

export interface Tag extends Syncable {
  name: string
  color?: string
}

export type TransactionType = 'INCOME' | 'EXPENSE' | 'TRANSFER'

/** Where a transaction came from. Agents will add their own sources later. */
export type TransactionSource = 'app' | 'sheet' | 'ivy-import' | 'agent'

/** `pending` is for entries proposed by the future agent that await the user's confirmation. */
export type TransactionStatus = 'confirmed' | 'pending'

export interface Transaction extends Syncable {
  type: TransactionType
  /** Source account (the only account for income/expense). */
  accountId: Id
  /** Destination account, only for transfers. */
  toAccountId?: Id
  /** Always positive; `type` decides the direction. */
  amount: number
  /** Optional for transfers. */
  categoryId?: Id
  title?: string
  description?: string
  /** Epoch ms of when the transaction happened. */
  date: number
  tagIds: Id[]
  source: TransactionSource
  status: TransactionStatus
}

export interface Settings {
  /** ISO 4217 code, chosen once at onboarding. All accounts use it. */
  currency: string
}

/**
 * Ivy data we don't model (planned payments, Ivy app preferences).
 * Kept verbatim so nothing from the backup is lost.
 */
export interface IvyExtras {
  plannedPaymentRules: unknown[]
  /** Ivy transactions that were only scheduled (have a due date but never happened). */
  plannedTransactions: unknown[]
  /** Ivy transactions involving an account deleted in Ivy, which Ivy leaves out of balances. */
  orphanedTransactions: unknown[]
  ivySettings: unknown[]
  sharedPrefs: Record<string, unknown>
}
