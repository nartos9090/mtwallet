import { ArrowLeftRight } from 'lucide-react'
import { Link } from 'react-router'
import { EntityIcon } from '@/components/EntityIcon'
import type { Transaction } from '@/core/model'
import { useLookups, useMoney } from '@/hooks/useWallet'
import { cn } from '@/lib/utils'

export function TransactionRow({
  transaction: t,
  lookups,
}: {
  transaction: Transaction
  lookups: ReturnType<typeof useLookups>
}) {
  const money = useMoney()
  const category = t.categoryId ? lookups.categories.get(t.categoryId) : undefined
  const account = lookups.accounts.get(t.accountId)
  const toAccount = t.toAccountId ? lookups.accounts.get(t.toAccountId) : undefined
  const isTransfer = t.type === 'TRANSFER'

  const title = t.title ?? category?.name ?? (isTransfer ? 'Transfer' : 'Uncategorized')
  const subtitle = isTransfer
    ? `${account?.name ?? '?'} → ${toAccount?.name ?? '?'}`
    : [account?.name, t.title ? category?.name : undefined].filter(Boolean).join(' · ')

  return (
    <Link to={`/tx/${t.id}`} className="flex items-center gap-3 px-4 py-2.5 active:bg-muted">
      <EntityIcon
        name={category?.name ?? title}
        color={category?.color}
        icon={category?.icon}
        fallback={isTransfer ? ArrowLeftRight : undefined}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{title}</p>
        <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <span
        className={cn(
          'shrink-0 font-medium tabular-nums',
          t.type === 'INCOME' && 'text-emerald-600 dark:text-emerald-400',
          isTransfer && 'text-muted-foreground',
        )}
      >
        {t.type === 'EXPENSE' ? '−' : t.type === 'INCOME' ? '+' : ''}
        {money(t.amount)}
      </span>
    </Link>
  )
}
