import { describe, expect, it } from 'vitest'
import type { Transaction } from '@/core/model'
import {
  balanceAt,
  balancePoints,
  buckets,
  cumulativeExpense,
  dailyExpense,
  expenseByCategory,
  inScope,
  resolveRange,
  shiftMonths,
  totals,
} from '@/core/stats'

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime()
let n = 0
const tx = (patch: Partial<Transaction>): Transaction => ({
  id: `t${n++}`,
  type: 'EXPENSE',
  accountId: 'cash',
  amount: 100,
  date: at(2026, 11, 1),
  tagIds: [],
  source: 'app',
  status: 'confirmed',
  updatedAt: 0,
  deleted: false,
  ...patch,
})

describe('ranges', () => {
  const now = at(2026, 11, 15, 18)

  it('shifts months, clamping the day', () => {
    expect(new Date(shiftMonths(at(2026, 3, 31), -1)).getDate()).toBe(28)
    expect(shiftMonths(at(2026, 11, 15), -12)).toBe(at(2025, 11, 15))
  })

  it('compares this month to date with the same days last month', () => {
    const r = resolveRange('this-month', now)
    expect(r).toMatchObject({ start: at(2026, 11, 1, 0), end: now, bucket: 'week', singleMonth: true })
    expect(r.previous).toEqual({ start: at(2026, 10, 1, 0), end: at(2026, 10, 15, 18) })
  })

  it('covers whole months for the longer presets', () => {
    expect(resolveRange('last-month', now)).toMatchObject({ start: at(2026, 10, 1, 0), end: at(2026, 11, 1, 0) })
    const six = resolveRange('6m', now)
    expect(six).toMatchObject({ start: at(2026, 6, 1, 0), bucket: 'month', singleMonth: false })
    expect(six.previous?.start).toBe(at(2025, 12, 1, 0))
    expect(resolveRange('all', now, at(2021, 10, 20))).toMatchObject({ bucket: 'year', previous: undefined })
  })

  it('splits into buckets clipped to the span', () => {
    const r = resolveRange('this-month', now)
    const weeks = buckets(r, 'week', 1) // Mondays; 1 Nov 2026 is a Sunday
    expect(weeks[0]).toEqual({ start: at(2026, 11, 1, 0), end: at(2026, 11, 2, 0) })
    expect(weeks.at(-1)).toEqual({ start: at(2026, 11, 9, 0), end: now })
    expect(buckets(resolveRange('6m', now), 'month')).toHaveLength(6)
  })
})

describe('aggregates', () => {
  const span = { start: at(2026, 11, 1, 0), end: at(2026, 12, 1, 0) }
  const transactions = [
    tx({ type: 'INCOME', amount: 1000, accountId: 'bank' }),
    tx({ amount: 300, categoryId: 'food', date: at(2026, 11, 2) }),
    tx({ amount: 200, categoryId: 'food', date: at(2026, 11, 3) }),
    tx({ amount: 50, date: at(2026, 11, 3) }),
    tx({ type: 'TRANSFER', amount: 400, accountId: 'bank', toAccountId: 'cash' }),
    tx({ amount: 999, date: at(2026, 10, 31) }), // outside
    tx({ amount: 999, status: 'pending' }),
    tx({ amount: 999, deleted: true }),
  ]
  const live = inScope(transactions)

  it('totals ignore transfers, pending and deleted', () => {
    expect(totals(live, span)).toEqual({ income: 1000, expense: 550, net: 450, savingsRate: 0.45 })
    expect(totals(inScope(transactions, 'bank'), span)).toMatchObject({ income: 1000, expense: 0 })
  })

  it('ranks categories and folds the tail', () => {
    expect(expenseByCategory(live, span)).toEqual([
      { key: 'food', amount: 500, count: 2 },
      { key: null, amount: 50, count: 1 },
    ])
    expect(expenseByCategory(live, span, 1)).toEqual([{ key: 'other', amount: 550, count: 3 }])
  })

  it('accumulates spending per day', () => {
    expect(cumulativeExpense(live, { start: span.start, end: at(2026, 11, 4, 0) })).toEqual([0, 300, 550])
    expect(dailyExpense(live, span).get('2026-11-03')).toBe(250)
  })

  it('tracks balances overall and per account', () => {
    const points = [at(2026, 11, 1, 0), at(2026, 11, 2, 0), at(2026, 11, 4, 0)]
    expect(balanceAt(live, points)).toEqual([-999, 1, -549])
    expect(balanceAt(live, points, 'cash')).toEqual([-999, -599, -1149])
    expect(balanceAt(live, points, 'bank')).toEqual([0, 600, 600])
    const daily = balancePoints({ start: span.start, end: at(2026, 11, 3, 15) })
    expect(daily).toEqual([at(2026, 11, 2, 0), at(2026, 11, 3, 0), at(2026, 11, 3, 15)])
  })
})
