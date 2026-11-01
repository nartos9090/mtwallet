import { useCallback, useSyncExternalStore } from 'react'
import { db } from '@/core/db'
import { formatMoney, formatMoneyCompact } from '@/core/money'
import { createWalletStore, type Lookups, type WalletSnapshot } from '@/core/walletStore'

/**
 * The app's data, from one shared in-memory store (core/walletStore.ts) that
 * loads at startup and stays live. Each hook re-renders only when its own part
 * changes.
 */
export const walletStore = createWalletStore(db)

const EMPTY: never[] = []
const EMPTY_BALANCES = new Map<string, number>()
const EMPTY_LOOKUPS: Lookups = { accounts: new Map(), categories: new Map(), tags: new Map() }

function useWallet<T>(select: (snapshot: WalletSnapshot) => T): T | undefined {
  return useSyncExternalStore(walletStore.subscribe, () => {
    const snapshot = walletStore.getSnapshot()
    return snapshot && select(snapshot)
  })
}

/** `undefined` while loading, `null` before onboarding. */
export const useSettings = () => useWallet((s) => s.settings)
export const useAccounts = () => useWallet((s) => s.accounts) ?? EMPTY
export const useCategories = () => useWallet((s) => s.categories) ?? EMPTY
export const useTags = () => useWallet((s) => s.tags) ?? EMPTY
/** All live transactions, newest first; `undefined` while loading. */
export const useTransactions = () => useWallet((s) => s.transactions)
export const useBalances = () => useWallet((s) => s.balances) ?? EMPTY_BALANCES
/** Lookup maps, so rows can show names and colors. */
export const useLookups = () => useWallet((s) => s.lookups) ?? EMPTY_LOOKUPS

export function useMoney() {
  const currency = useSettings()?.currency ?? 'IDR'
  return useCallback((amount: number) => formatMoney(amount, currency), [currency])
}

export function useCompactMoney() {
  const currency = useSettings()?.currency ?? 'IDR'
  return useCallback((amount: number) => formatMoneyCompact(amount, currency), [currency])
}
