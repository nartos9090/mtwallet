import type { Id, Transaction } from '@/core/model'

/** Current balance per account, from all confirmed, non-deleted transactions. */
export function accountBalances(transactions: Iterable<Transaction>): Map<Id, number> {
  const balances = new Map<Id, number>()
  const add = (accountId: Id, delta: number) =>
    balances.set(accountId, (balances.get(accountId) ?? 0) + delta)

  for (const t of transactions) {
    if (t.deleted || t.status !== 'confirmed') continue
    switch (t.type) {
      case 'INCOME':
        add(t.accountId, t.amount)
        break
      case 'EXPENSE':
        add(t.accountId, -t.amount)
        break
      case 'TRANSFER':
        add(t.accountId, -t.amount)
        if (t.toAccountId) add(t.toAccountId, t.amount)
        break
    }
  }
  return balances
}
