import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { SyncBanner } from '@/components/SyncBanner'
import { TransactionRow } from '@/components/TransactionRow'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Transaction } from '@/core/model'
import { useAccounts, useBalances, useLookups, useMoney, useTransactions } from '@/hooks/useWallet'

const ALL = 'all'

/** "2026-11" for the month containing `date`. */
function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function monthRange(key: string) {
  const [year, month] = key.split('-').map(Number)
  return { start: new Date(year, month - 1, 1), end: new Date(year, month, 1) }
}

export function Home() {
  const [params, setParams] = useSearchParams()
  const [currentMonth] = useState(() => monthKey(new Date()))
  const month = params.get('m') ?? currentMonth
  const [query, setQuery] = useState('')
  const [accountId, setAccountId] = useState(ALL)

  const transactions = useTransactions()
  const accounts = useAccounts()
  const lookups = useLookups()
  const balances = useBalances()
  const money = useMoney()

  const { start, end } = useMemo(() => monthRange(month), [month])
  const shiftMonth = (delta: number) =>
    setParams({ m: monthKey(new Date(start.getFullYear(), start.getMonth() + delta, 1)) }, { replace: true })

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (transactions ?? []).filter((t) => {
      if (t.date < start.getTime() || t.date >= end.getTime()) return false
      if (accountId !== ALL && t.accountId !== accountId && t.toAccountId !== accountId) return false
      if (!q) return true
      const category = t.categoryId ? lookups.categories.get(t.categoryId)?.name : ''
      return [t.title, t.description, category].some((s) => s?.toLowerCase().includes(q))
    })
  }, [transactions, start, end, accountId, query, lookups])

  const totals = useMemo(() => {
    let income = 0
    let expense = 0
    for (const t of visible) {
      if (t.type === 'INCOME') income += t.amount
      if (t.type === 'EXPENSE') expense += t.amount
    }
    return { income, expense }
  }, [visible])

  const days = useMemo(() => {
    const groups = new Map<string, Transaction[]>()
    for (const t of visible) {
      const key = new Date(t.date).toDateString()
      groups.set(key, [...(groups.get(key) ?? []), t])
    }
    return [...groups]
  }, [visible])

  const totalBalance = accounts.reduce((sum, a) => sum + (balances.get(a.id) ?? 0), 0)
  const monthLabel = start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const dayLabel = (key: string) =>
    new Date(key).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <div className="flex flex-col">
      <header className="flex items-center justify-between px-2 pt-3">
        <Button variant="ghost" size="icon" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
          <ChevronLeft />
        </Button>
        <h1 className="text-lg font-semibold">{monthLabel}</h1>
        <Button variant="ghost" size="icon" aria-label="Next month" onClick={() => shiftMonth(1)}>
          <ChevronRight />
        </Button>
      </header>

      <SyncBanner />

      <section className="mx-4 mt-2 rounded-xl border p-4">
        <p className="text-sm text-muted-foreground">Total balance</p>
        <p className="text-2xl font-semibold tabular-nums">{money(totalBalance)}</p>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground">Income</p>
            <p className="font-medium text-emerald-600 tabular-nums dark:text-emerald-400">{money(totals.income)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Expense</p>
            <p className="font-medium tabular-nums">{money(totals.expense)}</p>
          </div>
        </div>
      </section>

      <div className="flex gap-2 px-4 pt-4">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search" className="pl-8" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Select value={accountId} onValueChange={setAccountId}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All accounts</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {transactions && days.length === 0 && (
        <p className="px-4 py-12 text-center text-muted-foreground">No transactions in {monthLabel}</p>
      )}

      {days.map(([day, items]) => (
        <section key={day} className="pt-4">
          <h2 className="px-4 pb-1 text-sm font-medium text-muted-foreground">{dayLabel(day)}</h2>
          {items.map((t) => (
            <TransactionRow key={t.id} transaction={t} lookups={lookups} />
          ))}
        </section>
      ))}
    </div>
  )
}
