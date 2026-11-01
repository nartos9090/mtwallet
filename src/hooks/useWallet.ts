import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useMemo } from 'react'
import { accountBalances } from '@/core/balances'
import { db } from '@/core/db'
import { formatMoney } from '@/core/money'

/** `undefined` while loading, `null` before onboarding. */
export function useSettings() {
  return useLiveQuery(async () => (await db.getSettings()) ?? null)
}

export function useAccounts() {
  return useLiveQuery(
    async () => (await db.accounts.filter((a) => !a.deleted).toArray()).sort((a, b) => a.orderNum - b.orderNum),
    [],
    [],
  )
}

export function useCategories() {
  return useLiveQuery(
    async () => (await db.categories.filter((c) => !c.deleted).toArray()).sort((a, b) => a.orderNum - b.orderNum),
    [],
    [],
  )
}

export function useTags() {
  return useLiveQuery(() => db.tags.filter((t) => !t.deleted).sortBy('name'), [], [])
}

/** All live transactions, newest first. A few thousand rows, so filtering happens in memory. */
export function useTransactions() {
  return useLiveQuery(
    async () => (await db.transactions.orderBy('date').reverse().filter((t) => !t.deleted).toArray()),
    [],
  )
}

export function useBalances() {
  const transactions = useTransactions()
  return useMemo(() => accountBalances(transactions ?? []), [transactions])
}

/** Lookup maps, so rows can show names and colors. */
export function useLookups() {
  const accounts = useAccounts()
  const categories = useCategories()
  const tags = useTags()
  return useMemo(
    () => ({
      accounts: new Map(accounts.map((a) => [a.id, a])),
      categories: new Map(categories.map((c) => [c.id, c])),
      tags: new Map(tags.map((t) => [t.id, t])),
    }),
    [accounts, categories, tags],
  )
}

export function useMoney() {
  const currency = useSettings()?.currency ?? 'IDR'
  return useCallback((amount: number) => formatMoney(amount, currency), [currency])
}
