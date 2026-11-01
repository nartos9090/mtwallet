import type { WalletDb } from '@/core/db'
import { newId } from '@/core/id'
import type { Account, Category, Id, Tag, Transaction } from '@/core/model'

/**
 * All writes go through here so every change gets an `updatedAt` and deletes
 * become tombstones, which the Sheets sync relies on.
 */

export type TransactionInput = Pick<
  Transaction,
  'type' | 'accountId' | 'toAccountId' | 'amount' | 'categoryId' | 'title' | 'description' | 'date' | 'tagIds'
>

export type AccountInput = Pick<Account, 'name' | 'color' | 'icon'>
export type CategoryInput = Pick<Category, 'name' | 'color' | 'icon'>

/** Returns a message for the user, or undefined when the input is valid. */
export function validateTransaction(input: TransactionInput): string | undefined {
  if (!(input.amount > 0)) return 'Enter an amount above zero'
  if (!input.accountId) return 'Choose an account'
  if (input.type === 'TRANSFER') {
    if (!input.toAccountId) return 'Choose the account to transfer to'
    if (input.toAccountId === input.accountId) return 'Choose two different accounts'
  }
  if (!Number.isFinite(input.date)) return 'Choose a date'
}

export async function saveTransaction(db: WalletDb, input: TransactionInput, id?: Id): Promise<Id> {
  const error = validateTransaction(input)
  if (error) throw new Error(error)

  const existing = id ? await db.transactions.get(id) : undefined
  const transaction: Transaction = {
    ...input,
    id: existing?.id ?? newId(),
    toAccountId: input.type === 'TRANSFER' ? input.toAccountId : undefined,
    title: input.title?.trim() || undefined,
    description: input.description?.trim() || undefined,
    // Saving from the app confirms an entry the agent proposed.
    source: existing?.source ?? 'app',
    status: 'confirmed',
    updatedAt: Date.now(),
    deleted: false,
  }
  await db.transactions.put(transaction)
  return transaction.id
}

export async function deleteTransaction(db: WalletDb, id: Id): Promise<void> {
  await db.transactions.update(id, { deleted: true, updatedAt: Date.now() })
}

async function nextOrderNum(table: WalletDb['accounts'] | WalletDb['categories']): Promise<number> {
  const all = await table.toArray()
  return all.reduce((max, item) => Math.max(max, item.orderNum), -1) + 1
}

export async function saveAccount(db: WalletDb, input: AccountInput, id?: Id): Promise<Id> {
  if (!input.name.trim()) throw new Error('Enter a name')
  const existing = id ? await db.accounts.get(id) : undefined
  const account: Account = {
    ...input,
    name: input.name.trim(),
    id: existing?.id ?? newId(),
    orderNum: existing?.orderNum ?? (await nextOrderNum(db.accounts)),
    updatedAt: Date.now(),
    deleted: false,
  }
  await db.accounts.put(account)
  return account.id
}

/** Accounts with transactions can't be deleted: that would silently change balances. */
export async function deleteAccount(db: WalletDb, id: Id): Promise<void> {
  const used = await db.transactions
    .filter((t) => !t.deleted && (t.accountId === id || t.toAccountId === id))
    .count()
  if (used > 0) throw new Error(`This account has ${used} transactions. Delete or move them first.`)
  await db.accounts.update(id, { deleted: true, updatedAt: Date.now() })
}

export async function saveCategory(db: WalletDb, input: CategoryInput, id?: Id): Promise<Id> {
  if (!input.name.trim()) throw new Error('Enter a name')
  const existing = id ? await db.categories.get(id) : undefined
  const category: Category = {
    ...input,
    name: input.name.trim(),
    id: existing?.id ?? newId(),
    orderNum: existing?.orderNum ?? (await nextOrderNum(db.categories)),
    updatedAt: Date.now(),
    deleted: false,
  }
  await db.categories.put(category)
  return category.id
}

/** Returns the category with this name, creating it (with `color`) if needed. */
export async function ensureCategory(db: WalletDb, name: string, color: string): Promise<Id> {
  const trimmed = name.trim()
  const existing = await db.categories
    .filter((c) => !c.deleted && c.name.toLowerCase() === trimmed.toLowerCase())
    .first()
  return existing?.id ?? saveCategory(db, { name: trimmed, color })
}

/** Transactions keep pointing at the tombstone and show as uncategorized. */
export async function deleteCategory(db: WalletDb, id: Id): Promise<void> {
  await db.categories.update(id, { deleted: true, updatedAt: Date.now() })
}

/** Returns the tag with this name, creating it if needed. */
export async function ensureTag(db: WalletDb, name: string): Promise<Id> {
  const trimmed = name.trim()
  const existing = await db.tags.filter((t) => !t.deleted && t.name.toLowerCase() === trimmed.toLowerCase()).first()
  if (existing) return existing.id
  const tag: Tag = { id: newId(), name: trimmed, updatedAt: Date.now(), deleted: false }
  await db.tags.add(tag)
  return tag.id
}

const DEFAULT_CATEGORIES: CategoryInput[] = [
  { name: 'Food & Drinks', color: '#14cc9e', icon: 'fooddrink' },
  { name: 'Groceries', color: '#4caf50', icon: 'groceries' },
  { name: 'Transport', color: '#2196f3', icon: 'transport' },
  { name: 'Bills & Fees', color: '#ff4060', icon: 'bills' },
  { name: 'Shopping', color: '#ab47bc', icon: 'shopping' },
  { name: 'Health', color: '#ef5350', icon: 'health' },
  { name: 'Entertainment', color: '#ffa726', icon: 'game' },
  { name: 'Salary', color: '#26a69a', icon: 'salary' },
  { name: 'Gift', color: '#ec407a', icon: 'gift' },
  { name: 'Other', color: '#78909c' },
]

/** Onboarding without an Ivy backup: settings, a Cash account and starter categories. */
export async function startFresh(db: WalletDb, currency: string): Promise<void> {
  await db.transaction('rw', [db.accounts, db.categories, db.meta], async () => {
    await db.meta.put({ key: 'settings', value: { currency } })
    await saveAccount(db, { name: 'Cash', color: '#ccddff', icon: 'cash' })
    for (const category of DEFAULT_CATEGORIES) await saveCategory(db, category)
  })
}
