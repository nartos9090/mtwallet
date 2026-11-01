import { unzipSync } from 'fflate'
import type {
  Account,
  Category,
  IvyExtras,
  Settings,
  Tag,
  Transaction,
  TransactionType,
} from '@/core/model'

/**
 * Converts an Ivy Wallet backup into our model.
 *
 * Quirks of the Ivy format handled here:
 * - The JSON is UTF-16 (big-endian, with BOM), not UTF-8.
 * - The export may be the raw JSON or a .zip containing it.
 * - Colors are Android ARGB ints, often negative (e.g. -15414114).
 * - Transfers can carry a categoryId.
 * - Transactions can point to an account that was deleted; Ivy ignores them.
 * - Transactions with a dueDate but no dateTime are planned, not real.
 * - Tags are not part of the backup format.
 */

export interface IvyImportResult {
  settings: Settings
  accounts: Account[]
  categories: Category[]
  tags: Tag[]
  transactions: Transaction[]
  extras: IvyExtras
  warnings: string[]
}

// Shapes of the Ivy backup, limited to the fields we read.
interface IvyAccount {
  id: string
  name: string
  currency?: string
  color: number
  icon?: string
  orderNum?: number
  isDeleted?: boolean
}

interface IvyCategory {
  id: string
  name: string
  color: number
  icon?: string
  orderNum?: number
  isDeleted?: boolean
}

interface IvyTransaction {
  id: string
  accountId: string
  type: TransactionType
  amount: number
  toAccountId?: string
  toAmount?: number
  title?: string
  description?: string
  dateTime?: number
  dueDate?: number
  categoryId?: string
  isDeleted?: boolean
}

interface IvyBackup {
  accounts?: IvyAccount[]
  categories?: IvyCategory[]
  transactions?: IvyTransaction[]
  plannedPaymentRules?: unknown[]
  settings?: { currency?: string }[]
  sharedPrefs?: Record<string, unknown>
}

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]

export function decodeIvyBytes(bytes: Uint8Array): string {
  if (ZIP_MAGIC.every((b, i) => bytes[i] === b)) {
    const files = unzipSync(bytes)
    const jsonName = Object.keys(files).find((name) => name.toLowerCase().endsWith('.json'))
    if (!jsonName) throw new Error('The zip file does not contain an Ivy backup (.json)')
    return decodeIvyBytes(files[jsonName])
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes)
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes)
  return new TextDecoder('utf-8').decode(bytes)
}

/** Android ARGB int (possibly negative) -> "#rrggbb". */
export function androidColorToHex(color: number): string {
  return '#' + ((color >>> 0) & 0xffffff).toString(16).padStart(6, '0')
}

export function importIvyBackup(bytes: Uint8Array, now = Date.now()): IvyImportResult {
  let backup: IvyBackup
  try {
    backup = JSON.parse(decodeIvyBytes(bytes)) as IvyBackup
  } catch {
    throw new Error('This file is not a valid Ivy Wallet backup')
  }
  if (!Array.isArray(backup.accounts) || !Array.isArray(backup.transactions)) {
    throw new Error('This file is not an Ivy Wallet backup (missing accounts or transactions)')
  }

  const warnings: string[] = []
  const live = <T extends { isDeleted?: boolean }>(items: T[] | undefined) =>
    (items ?? []).filter((item) => !item.isDeleted)

  const ivyAccounts = live(backup.accounts)
  const currency = backup.settings?.[0]?.currency ?? ivyAccounts[0]?.currency ?? 'IDR'
  const foreign = ivyAccounts.filter((a) => a.currency && a.currency !== currency)
  if (foreign.length > 0) {
    warnings.push(
      `Accounts in another currency than ${currency} were imported as ${currency}: ` +
        foreign.map((a) => `${a.name} (${a.currency})`).join(', '),
    )
  }

  const accounts: Account[] = ivyAccounts.map((a, i) => ({
    id: a.id,
    name: a.name,
    color: androidColorToHex(a.color),
    icon: a.icon,
    orderNum: a.orderNum ?? i,
    updatedAt: now,
    deleted: false,
  }))

  const categories: Category[] = live(backup.categories).map((c, i) => ({
    id: c.id,
    name: c.name,
    color: androidColorToHex(c.color),
    icon: c.icon,
    orderNum: c.orderNum ?? i,
    updatedAt: now,
    deleted: false,
  }))

  const accountIds = new Set(accounts.map((a) => a.id))
  const categoryIds = new Set(categories.map((c) => c.id))
  const transactions: Transaction[] = []
  const plannedTransactions: unknown[] = []
  const orphanedTransactions: unknown[] = []
  let droppedCategories = 0

  for (const t of live(backup.transactions)) {
    if (t.dateTime == null) {
      plannedTransactions.push(t)
      continue
    }
    // Ivy leaves transactions touching a deleted account out of every balance,
    // including the surviving side of a transfer. Do the same, but keep them.
    if (!accountIds.has(t.accountId) || (t.type === 'TRANSFER' && !accountIds.has(t.toAccountId ?? ''))) {
      orphanedTransactions.push(t)
      continue
    }

    let categoryId = t.categoryId
    if (categoryId && !categoryIds.has(categoryId)) {
      categoryId = undefined
      droppedCategories++
    }
    transactions.push({
      id: t.id,
      type: t.type,
      accountId: t.accountId,
      toAccountId: t.type === 'TRANSFER' ? t.toAccountId : undefined,
      amount: Math.abs(t.amount),
      categoryId,
      title: t.title?.trim() || undefined,
      description: t.description?.trim() || undefined,
      date: t.dateTime,
      tagIds: [],
      source: 'ivy-import',
      status: 'confirmed',
      updatedAt: now,
      deleted: false,
    })
  }
  if (orphanedTransactions.length > 0) {
    warnings.push(
      `${orphanedTransactions.length} transactions involving an account deleted in Ivy were left out, as Ivy does`,
    )
  }
  if (droppedCategories > 0) {
    warnings.push(`${droppedCategories} transactions referenced a deleted category and were left uncategorized`)
  }

  return {
    settings: { currency },
    accounts,
    categories,
    tags: [],
    transactions,
    extras: {
      plannedPaymentRules: backup.plannedPaymentRules ?? [],
      plannedTransactions,
      orphanedTransactions,
      ivySettings: backup.settings ?? [],
      sharedPrefs: backup.sharedPrefs ?? {},
    },
    warnings,
  }
}
