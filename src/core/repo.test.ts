import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { WalletDb } from '@/core/db'
import { newId } from '@/core/id'
import {
  deleteAccount,
  deleteCategory,
  deleteTransaction,
  ensureCategory,
  ensureTag,
  saveAccount,
  saveTransaction,
  startFresh,
  type TransactionInput,
  validateTransaction,
} from '@/core/repo'

let db: WalletDb
beforeEach(() => {
  db = new WalletDb(`test-${newId()}`)
})

const expense = (accountId: string): TransactionInput => ({
  type: 'EXPENSE',
  accountId,
  amount: 10_000,
  date: Date.now(),
  tagIds: [],
})

describe('validateTransaction', () => {
  it('rejects bad input', () => {
    expect(validateTransaction({ ...expense('a'), amount: 0 })).toMatch(/amount/)
    expect(validateTransaction({ ...expense('a'), amount: NaN })).toMatch(/amount/)
    expect(validateTransaction({ ...expense('a'), type: 'TRANSFER' })).toMatch(/transfer to/)
    expect(validateTransaction({ ...expense('a'), type: 'TRANSFER', toAccountId: 'a' })).toMatch(/different/)
    expect(validateTransaction(expense('a'))).toBeUndefined()
  })
})

describe('repo', () => {
  it('starts fresh with settings, an account and categories', async () => {
    await startFresh(db, 'IDR')
    expect(await db.getSettings()).toEqual({ currency: 'IDR' })
    expect(await db.accounts.count()).toBe(1)
    expect(await db.categories.count()).toBeGreaterThan(5)
  })

  it('creates, edits and soft-deletes transactions', async () => {
    const accountId = await saveAccount(db, { name: ' Bank ', color: '#000000' })
    const id = await saveTransaction(db, { ...expense(accountId), title: '  Lunch ', toAccountId: 'ignored' })
    const created = await db.transactions.get(id)
    expect(created).toMatchObject({ title: 'Lunch', toAccountId: undefined, source: 'app', status: 'confirmed' })

    await db.transactions.update(id, { source: 'agent', status: 'pending' })
    await saveTransaction(db, { ...expense(accountId), amount: 5_000 }, id)
    expect(await db.transactions.get(id)).toMatchObject({ amount: 5_000, source: 'agent', status: 'confirmed' })

    await deleteTransaction(db, id)
    expect(await db.transactions.get(id)).toMatchObject({ deleted: true })
  })

  it('refuses to delete an account that has transactions', async () => {
    const a = await saveAccount(db, { name: 'A', color: '#000000' })
    const b = await saveAccount(db, { name: 'B', color: '#000000' })
    expect((await db.accounts.get(b))?.orderNum).toBe(1)
    await saveTransaction(db, { ...expense(a), type: 'TRANSFER', toAccountId: b })
    await expect(deleteAccount(db, b)).rejects.toThrow(/1 transactions/)
  })

  it('reuses tags case-insensitively', async () => {
    const id = await ensureTag(db, 'Trip')
    expect(await ensureTag(db, ' trip ')).toBe(id)
  })

  it('creates categories by name, reusing existing ones', async () => {
    const id = await ensureCategory(db, ' Coffee ', '#ff0000')
    expect(await db.categories.get(id)).toMatchObject({ name: 'Coffee', color: '#ff0000' })
    expect(await ensureCategory(db, 'coffee', '#00ff00')).toBe(id)
    await deleteCategory(db, id)
    expect(await ensureCategory(db, 'Coffee', '#00ff00')).not.toBe(id)
  })
})
