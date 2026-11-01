import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { CashflowChart, CategoryChart, NetWorthChart, PaceChart, SpendingCalendar } from '@/components/charts/StatsCharts'
import { type ChartTokens, DARK, LIGHT } from '@/components/charts/tokens'
import { PageHeader } from '@/components/PageHeader'
import { TransactionRow } from '@/components/TransactionRow'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  balanceAt,
  balancePoints,
  biggestExpenses,
  buckets,
  cashflow,
  cumulativeExpense,
  dailyExpense,
  expenseByCategory,
  inScope,
  type RangePreset,
  resolveRange,
  totals,
} from '@/core/stats'
import { useIsDark } from '@/hooks/useTheme'
import { useAccounts, useCompactMoney, useLookups, useMoney, useTransactions } from '@/hooks/useWallet'
import { weekStartsOn } from '@/lib/locale'

const PRESETS: { value: RangePreset; label: string }[] = [
  { value: 'this-month', label: 'This month' },
  { value: 'last-month', label: 'Last month' },
  { value: '3m', label: 'Last 3 months' },
  { value: '6m', label: 'Last 6 months' },
  { value: '12m', label: 'Last 12 months' },
  { value: 'this-year', label: 'This year' },
  { value: 'all', label: 'All time' },
]
const ALL_ACCOUNTS = 'all'

export function Stats() {
  const [params, setParams] = useSearchParams()
  const preset = (params.get('range') as RangePreset | null) ?? 'this-month'
  const accountId = params.get('account') ?? undefined
  const setFilter = (key: string, value: string | undefined) =>
    setParams(
      (p) => {
        if (value) p.set(key, value)
        else p.delete(key)
        return p
      },
      { replace: true },
    )

  const [now] = useState(() => Date.now())
  const [firstDay] = useState(weekStartsOn)
  const transactions = useTransactions()
  const accounts = useAccounts()
  const lookups = useLookups()
  const money = useMoney()
  const compactMoney = useCompactMoney()
  const t: ChartTokens = useIsDark() ? DARK : LIGHT

  const scoped = useMemo(() => inScope(transactions ?? [], accountId), [transactions, accountId])
  const range = useMemo(() => {
    const earliest = scoped.reduce((min, tx) => Math.min(min, tx.date), now)
    return resolveRange(preset, now, earliest)
  }, [preset, now, scoped])

  const data = useMemo(() => {
    const spans = buckets(range, range.bucket, firstDay)
    const points = balancePoints(range)
    const categoryName = (key: string | null) =>
      key === 'other' ? 'Other' : (key && lookups.categories.get(key)?.name) || 'Uncategorized'
    return {
      current: totals(scoped, range),
      previous: range.previous && totals(scoped, range.previous),
      categories: expenseByCategory(scoped, range).map((s) => ({ ...s, name: categoryName(s.key) })),
      spans,
      cashflow: cashflow(scoped, spans),
      pace: range.previous && {
        current: cumulativeExpense(scoped, range),
        previous: cumulativeExpense(scoped, range.previous),
      },
      points,
      balances: balanceAt(scoped, points, accountId),
      daily: range.singleMonth ? dailyExpense(scoped, range) : undefined,
      biggest: biggestExpenses(scoped, range),
    }
  }, [scoped, range, firstDay, lookups, accountId])

  if (!transactions) return null
  const { current, previous } = data
  const accountName = accountId && accounts.find((a) => a.id === accountId)?.name

  return (
    <div className="flex flex-col gap-4 pb-4">
      <PageHeader title="Statistics" />

      {/* One filter row; it scopes everything below. */}
      <div className="flex gap-2 px-4">
        <Select value={preset} onValueChange={(v) => setFilter('range', v)}>
          <SelectTrigger className="flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRESETS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={accountId ?? ALL_ACCOUNTS} onValueChange={(v) => setFilter('account', v === ALL_ACCOUNTS ? undefined : v)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_ACCOUNTS}>All accounts</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <section>
        <div className="grid grid-cols-2 gap-3 px-4">
          <StatTile
            label="Income"
            value={compactMoney(current.income)}
            full={money(current.income)}
            delta={percentChange(current.income, previous?.income)}
            upIsGood
            t={t}
          />
          <StatTile
            label="Expense"
            value={compactMoney(current.expense)}
            full={money(current.expense)}
            delta={percentChange(current.expense, previous?.expense)}
            t={t}
          />
          <StatTile
            label={current.net >= 0 ? 'Saved' : 'Overspent'}
            value={compactMoney(Math.abs(current.net))}
            full={money(Math.abs(current.net))}
            // A percentage of a net that can flip sign means little: show the difference in money.
            delta={previous && { value: current.net - previous.net, text: compactMoney(Math.abs(current.net - previous.net)) }}
            upIsGood
            t={t}
          />
          <StatTile
            label="Savings rate"
            value={current.savingsRate === undefined ? '–' : `${Math.round(current.savingsRate * 100)}%`}
            delta={
              current.savingsRate !== undefined && previous?.savingsRate !== undefined
                ? {
                    value: current.savingsRate - previous.savingsRate,
                    text: `${Math.abs(Math.round((current.savingsRate - previous.savingsRate) * 100))} pts`,
                  }
                : undefined
            }
            upIsGood
            t={t}
          />
        </div>
        {range.previous && (
          <p className="mt-2 px-4 text-xs text-muted-foreground">
            Arrows compare with {spanLabel(range.previous)}
          </p>
        )}
      </section>

      <CategoryChart slices={data.categories} t={t} money={money} />
      {data.pace && <PaceChart start={range.start} current={data.pace.current} previous={data.pace.previous} t={t} money={money} />}
      {data.daily && <SpendingCalendar span={range} daily={data.daily} weekStartsOn={firstDay} t={t} money={money} />}
      <CashflowChart spans={data.spans} values={data.cashflow} size={range.bucket} t={t} money={money} />
      <NetWorthChart
        points={data.points}
        balances={data.balances}
        title={accountName ? `${accountName} balance` : 'Net worth'}
        t={t}
        money={money}
      />

      {data.biggest.length > 0 && (
        <section className="mx-4 rounded-xl border py-2">
          <h2 className="px-4 pt-2 pb-1 font-medium">Biggest expenses</h2>
          {data.biggest.map((tx) => (
            <TransactionRow key={tx.id} transaction={tx} lookups={lookups} />
          ))}
        </section>
      )}
    </div>
  )
}

const spanLabel = (span: { start: number; end: number }) =>
  `${new Date(span.start).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} – ${new Date(
    span.end - 1,
  ).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`

/** Signed change vs the previous period, as a ratio; undefined when there's nothing to compare. */
function percentChange(current: number, previous: number | undefined) {
  if (previous === undefined || previous === 0) return undefined
  const ratio = (current - previous) / Math.abs(previous)
  return { value: ratio, text: `${Math.abs(Math.round(ratio * 100))}%` }
}

function StatTile({
  label,
  value,
  full,
  delta,
  upIsGood = false,
  t,
}: {
  label: string
  value: string
  /** The exact amount, on hover and for screen readers. */
  full?: string
  delta?: { value: number; text: string }
  upIsGood?: boolean
  t: ChartTokens
}) {
  const up = (delta?.value ?? 0) > 0
  const Arrow = up ? ArrowUpRight : ArrowDownRight
  const changed = delta && Math.abs(delta.value) >= 0.005
  return (
    <div className="rounded-xl border p-3">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-semibold" title={full} aria-label={full}>
        {value}
      </p>
      {/* Direction in words and an arrow, not color alone. */}
      <p
        className="mt-0.5 flex items-center gap-0.5 text-xs"
        style={changed ? { color: up === upIsGood ? t.deltaGood : t.deltaBad } : undefined}
      >
        {changed ? (
          <>
            <Arrow className="size-3.5" aria-hidden />
            {up ? 'Up' : 'Down'} {delta.text}
          </>
        ) : (
          <span className="text-muted-foreground">{delta ? 'No change' : 'Nothing to compare'}</span>
        )}
      </p>
    </div>
  )
}
