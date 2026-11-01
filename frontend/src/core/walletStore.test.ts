import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { WalletDb } from '@/core/db'
import { newId } from '@/core/id'
import { deleteTransaction, saveAccount, saveTransaction, startFresh } from '@/core/repo'
import { createWalletStore, type WalletSnapshot, type WalletStore } from '@/core/walletStore'

let store: WalletStore
afterEach(() => store?.stop())

/** Resolves with the first snapshot (after `action`) that passes `check`. */
function next(check: (s: WalletSnapshot) => boolean, action?: () => Promise<unknown>) {
  return new Promise<WalletSnapshot>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('no matching snapshot')), 2000)
    const unsubscribe = store.subscribe(() => {
      const snapshot = store.getSnapshot()!
      if (check(snapshot)) {
        clearTimeout(timeout)
        unsubscribe()
        resolve(snapshot)
      }
    })
    void action?.()
  })
}

describe('wallet store', () => {
  it('loads everything, then follows changes, keeping untouched parts', async () => {
    const db = new WalletDb(`test-${newId()}`)
    await startFresh(db, 'IDR')
    store = createWalletStore(db)
    expect(store.getSnapshot()).toBeUndefined()
    await store.ready

    const first = store.getSnapshot()!
    expect(first.settings).toEqual({ currency: 'IDR' })
    expect(first.accounts.map((a) => a.name)).toEqual(['Cash'])
    expect(first.transactions).toEqual([])
    const cash = first.accounts[0].id

    const tx = { type: 'INCOME' as const, accountId: cash, amount: 5000, date: 2, tagIds: [] }
    const added = await next((s) => s.transactions.length === 1, () => saveTransaction(db, tx))
    expect(added.balances.get(cash)).toBe(5000)
    // Accounts didn't change: same array and lookups, so views reading them don't re-render.
    expect(added.accounts).toBe(first.accounts)
    expect(added.lookups).toBe(first.lookups)

    const withBank = await next((s) => s.accounts.length === 2, () => saveAccount(db, { name: 'Bank', color: '#000000' }))
    expect(withBank.transactions).toBe(added.transactions)
    expect(withBank.lookups.accounts.get(withBank.accounts[1].id)?.name).toBe('Bank')

    const id = added.transactions[0].id
    const deleted = await next((s) => s.transactions.length === 0, () => deleteTransaction(db, id))
    expect(deleted.balances.get(cash)).toBeUndefined()
  })

  it('does not publish a new snapshot when only sync bookkeeping changes', async () => {
    const db = new WalletDb(`test-${newId()}`)
    await startFresh(db, 'IDR')
    store = createWalletStore(db)
    await store.ready
    let published = 0
    store.subscribe(() => published++)
    await db.setSyncState({ spreadsheetId: 's', base: { Accounts: {}, Categories: {}, Transactions: {} } })
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(published).toBe(0)
  })
})
