import { liveQuery } from 'dexie'
import { accountBalances } from '@/core/balances'
import type { WalletDb } from '@/core/db'
import type { Account, Category, Id, Settings, Tag, Transaction } from '@/core/model'

/**
 * All live data in memory, loaded once and kept current by one Dexie live
 * query per table. Pages read it synchronously, so switching pages never
 * shows empty data, and every change (an edit, an import, a sync pulling rows)
 * reaches whatever is on screen. A few thousand transactions take well under
 * a megabyte.
 *
 * Unchanged parts keep their identity between snapshots, so a view that only
 * reads accounts doesn't re-render when a transaction changes.
 */

export interface Lookups {
  accounts: Map<Id, Account>
  categories: Map<Id, Category>
  tags: Map<Id, Tag>
}

export interface WalletSnapshot {
  /** null before onboarding. */
  settings: Settings | null
  /** Live (not deleted), by their order. */
  accounts: Account[]
  categories: Category[]
  /** Live, by name. */
  tags: Tag[]
  /** Live, newest first. */
  transactions: Transaction[]
  balances: Map<Id, number>
  lookups: Lookups
}

type Tables = Pick<WalletSnapshot, 'settings' | 'accounts' | 'categories' | 'tags' | 'transactions'>

const byOrder = (a: Account | Category, b: Account | Category) => a.orderNum - b.orderNum

export function createWalletStore(db: WalletDb) {
  const queries: { [K in keyof Tables]: () => Promise<Tables[K]> } = {
    settings: async () => (await db.getSettings()) ?? null,
    accounts: async () => (await db.accounts.filter((a) => !a.deleted).toArray()).sort(byOrder),
    categories: async () => (await db.categories.filter((c) => !c.deleted).toArray()).sort(byOrder),
    tags: () => db.tags.filter((t) => !t.deleted).sortBy('name'),
    transactions: () =>
      db.transactions
        .orderBy('date')
        .reverse()
        .filter((t) => !t.deleted)
        .toArray(),
  }

  const tables: Partial<Tables> = {}
  let snapshot: WalletSnapshot | undefined
  const listeners = new Set<() => void>()
  let markReady: () => void
  const ready = new Promise<void>((resolve) => (markReady = resolve))

  function update<K extends keyof Tables>(key: K, value: Tables[K]) {
    // Settings share a table with sync bookkeeping that changes on every sync: keep the
    // same object when nothing in it changed, so the app doesn't re-render for nothing.
    if (key === 'settings' && JSON.stringify(value) === JSON.stringify(tables.settings)) return
    tables[key] = value
    if (Object.keys(queries).some((k) => !(k in tables))) return // still loading

    const t = tables as Tables
    const previous = snapshot
    snapshot = {
      ...t,
      balances: previous?.transactions === t.transactions ? previous.balances : accountBalances(t.transactions),
      lookups:
        previous &&
        previous.accounts === t.accounts &&
        previous.categories === t.categories &&
        previous.tags === t.tags
          ? previous.lookups
          : {
              accounts: new Map(t.accounts.map((a) => [a.id, a])),
              categories: new Map(t.categories.map((c) => [c.id, c])),
              tags: new Map(t.tags.map((tag) => [tag.id, tag])),
            },
    }
    if (!previous) markReady()
    listeners.forEach((listener) => listener())
  }

  const watch = <K extends keyof Tables>(key: K) =>
    liveQuery<Tables[K]>(queries[key]).subscribe({
      next: (value) => update(key, value),
      error: (error) => console.error(`Loading ${key} failed`, error),
    })
  const subscriptions = (Object.keys(queries) as (keyof Tables)[]).map(watch)

  return {
    /** undefined until every table has loaded once. */
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    ready,
    stop: () => subscriptions.forEach((s) => s.unsubscribe()),
  }
}

export type WalletStore = ReturnType<typeof createWalletStore>
