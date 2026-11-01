import type { Id, Transaction } from '@/core/model'

/** Numbers behind the statistics screen. Ranges are [start, end) in epoch ms. */

export type RangePreset = 'this-month' | 'last-month' | '3m' | '6m' | '12m' | 'this-year' | 'all'
export type BucketSize = 'week' | 'month' | 'year'

export interface Span {
  start: number
  end: number
}

export interface Range extends Span {
  /** The same stretch of time one period earlier, for comparisons. */
  previous?: Span
  bucket: BucketSize
  /** True for this month / last month: day-level charts make sense. */
  singleMonth: boolean
}

const DAY_MS = 86_400_000

/** Moves a timestamp by whole months, clamping the day (31 Mar - 1 month = 28/29 Feb). */
export function shiftMonths(ms: number, months: number): number {
  const d = new Date(ms)
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1, d.getHours(), d.getMinutes(), d.getSeconds())
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(d.getDate(), lastDay))
  return target.getTime() + d.getMilliseconds()
}

const monthStart = (year: number, month: number) => new Date(year, month, 1).getTime()

/**
 * Resolves a preset at `now`. Ranges that include today end now, and their
 * `previous` ends at the same point one period back (month-to-date vs the
 * same days last month).
 */
export function resolveRange(preset: RangePreset, now: number, earliest?: number): Range {
  const d = new Date(now)
  const [y, m] = [d.getFullYear(), d.getMonth()]
  const back = (span: Span, months: number) => ({ start: shiftMonths(span.start, -months), end: shiftMonths(span.end, -months) })
  const withBucket = (span: Span, previous: Span | undefined, singleMonth = false): Range => {
    const months = (span.end - span.start) / (30 * DAY_MS)
    return { ...span, previous, singleMonth, bucket: singleMonth ? 'week' : months > 24 ? 'year' : 'month' }
  }

  switch (preset) {
    case 'this-month': {
      const span = { start: monthStart(y, m), end: now }
      return withBucket(span, back(span, 1), true)
    }
    case 'last-month': {
      const span = { start: monthStart(y, m - 1), end: monthStart(y, m) }
      return withBucket(span, { start: monthStart(y, m - 2), end: monthStart(y, m - 1) }, true)
    }
    case '3m':
    case '6m':
    case '12m': {
      const n = Number.parseInt(preset)
      const span = { start: monthStart(y, m - n + 1), end: now }
      return withBucket(span, back(span, n))
    }
    case 'this-year': {
      const span = { start: monthStart(y, 0), end: now }
      return withBucket(span, back(span, 12))
    }
    case 'all':
      return withBucket({ start: Math.min(earliest ?? now, now), end: now }, undefined)
  }
}

/** Confirmed, live transactions touching `accountId` (all accounts when undefined). */
export function inScope(transactions: Transaction[], accountId?: Id): Transaction[] {
  return transactions.filter(
    (t) =>
      !t.deleted && t.status === 'confirmed' && (!accountId || t.accountId === accountId || t.toAccountId === accountId),
  )
}

const within = (t: Transaction, span: Span) => t.date >= span.start && t.date < span.end

/** Income and expense; transfers move money between accounts and count as neither. */
export function totals(transactions: Transaction[], span: Span) {
  let income = 0
  let expense = 0
  for (const t of transactions) {
    if (!within(t, span)) continue
    if (t.type === 'INCOME') income += t.amount
    else if (t.type === 'EXPENSE') expense += t.amount
  }
  return { income, expense, net: income - expense, savingsRate: income > 0 ? (income - expense) / income : undefined }
}

export interface CategorySlice {
  /** A category id, null for uncategorized, 'other' for the folded tail. */
  key: Id | null | 'other'
  amount: number
  count: number
}

/** Expenses per category, largest first; past `max` bars the tail folds into "other". */
export function expenseByCategory(transactions: Transaction[], span: Span, max = 8): CategorySlice[] {
  const byKey = new Map<Id | null, CategorySlice>()
  for (const t of transactions) {
    if (t.type !== 'EXPENSE' || !within(t, span)) continue
    const key = t.categoryId ?? null
    const slice = byKey.get(key) ?? { key, amount: 0, count: 0 }
    slice.amount += t.amount
    slice.count++
    byKey.set(key, slice)
  }
  const sorted = [...byKey.values()].sort((a, b) => b.amount - a.amount)
  if (sorted.length <= max) return sorted
  const tail = sorted.slice(max - 1)
  return [
    ...sorted.slice(0, max - 1),
    { key: 'other', amount: tail.reduce((s, c) => s + c.amount, 0), count: tail.reduce((s, c) => s + c.count, 0) },
  ]
}

/** Consecutive buckets covering the span. Weeks start on `weekStartsOn` (0 = Sunday). */
export function buckets(span: Span, size: BucketSize, weekStartsOn = 1): Span[] {
  const result: Span[] = []
  const first = new Date(span.start)
  let start: Date
  if (size === 'week') {
    start = new Date(first.getFullYear(), first.getMonth(), first.getDate() - ((first.getDay() - weekStartsOn + 7) % 7))
  } else if (size === 'month') {
    start = new Date(first.getFullYear(), first.getMonth(), 1)
  } else {
    start = new Date(first.getFullYear(), 0, 1)
  }
  while (start.getTime() < span.end) {
    const next =
      size === 'week'
        ? new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7)
        : size === 'month'
          ? new Date(start.getFullYear(), start.getMonth() + 1, 1)
          : new Date(start.getFullYear() + 1, 0, 1)
    // Clip the first and last bucket to the span.
    result.push({ start: Math.max(start.getTime(), span.start), end: Math.min(next.getTime(), span.end) })
    start = next
  }
  return result
}

export function cashflow(transactions: Transaction[], spans: Span[]) {
  return spans.map((span) => totals(transactions, span))
}

/** Day index since `start` (local days, DST-safe). */
export function dayIndex(ms: number, start: number): number {
  const a = new Date(start)
  const b = new Date(ms)
  return Math.round(
    (Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / DAY_MS,
  )
}

/** Running total of expenses per day of the span: [day 0, day 0+1, ...]. */
export function cumulativeExpense(transactions: Transaction[], span: Span): number[] {
  const days = Math.max(1, dayIndex(span.end - 1, span.start) + 1)
  const perDay = new Array<number>(days).fill(0)
  for (const t of transactions) {
    if (t.type === 'EXPENSE' && within(t, span)) perDay[dayIndex(t.date, span.start)] += t.amount
  }
  for (let i = 1; i < days; i++) perDay[i] += perDay[i - 1]
  return perDay
}

/** Expense per local day, keyed "YYYY-MM-DD". */
export function dailyExpense(transactions: Transaction[], span: Span): Map<string, number> {
  const result = new Map<string, number>()
  for (const t of transactions) {
    if (t.type !== 'EXPENSE' || !within(t, span)) continue
    const key = dateKey(t.date)
    result.set(key, (result.get(key) ?? 0) + t.amount)
  }
  return result
}

export function dateKey(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** How a transaction changes the balance of `accountId`, or of all accounts together. */
function balanceDelta(t: Transaction, accountId?: Id): number {
  if (t.type === 'INCOME') return t.accountId === accountId || !accountId ? t.amount : 0
  if (t.type === 'EXPENSE') return t.accountId === accountId || !accountId ? -t.amount : 0
  if (!accountId) return 0
  return (t.toAccountId === accountId ? t.amount : 0) - (t.accountId === accountId ? t.amount : 0)
}

/** Balance at each point in time (everything strictly before it). `points` must be ascending. */
export function balanceAt(transactions: Transaction[], points: number[], accountId?: Id): number[] {
  const sorted = [...transactions].sort((a, b) => a.date - b.date)
  const result: number[] = []
  let balance = 0
  let i = 0
  for (const point of points) {
    while (i < sorted.length && sorted[i].date < point) balance += balanceDelta(sorted[i++], accountId)
    result.push(balance)
  }
  return result
}

/** End-of-day (or end-of-month for long spans) points for the net worth line. */
export function balancePoints(span: Span): number[] {
  const points: number[] = []
  const days = dayIndex(span.end - 1, span.start) + 1
  const first = new Date(span.start)
  if (days <= 400) {
    for (let i = 1; i <= days; i++) points.push(new Date(first.getFullYear(), first.getMonth(), first.getDate() + i).getTime())
  } else {
    for (let month = 1; ; month++) {
      const point = new Date(first.getFullYear(), first.getMonth() + month, 1).getTime()
      points.push(Math.min(point, span.end))
      if (point >= span.end) break
    }
  }
  // The last point is "now", not the end of today.
  points[points.length - 1] = Math.min(points[points.length - 1], span.end)
  return points
}

export function biggestExpenses(transactions: Transaction[], span: Span, n = 5): Transaction[] {
  return transactions
    .filter((t) => t.type === 'EXPENSE' && within(t, span))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, n)
}
