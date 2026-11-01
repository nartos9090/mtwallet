import { useMemo } from 'react'
import { ChartCard } from '@/components/charts/ChartCard'
import { categoryAxis, compact, tooltipBase, tooltipElement, valueAxis } from '@/components/charts/chartKit'
import { type ChartOption, EChart } from '@/components/charts/EChart'
import type { ChartTokens } from '@/components/charts/tokens'
import { type BucketSize, dateKey, type Span } from '@/core/stats'

/**
 * The statistics charts. Each builds its whole ECharts option in one memo, so
 * a re-render with the same data doesn't replay the chart.
 */

type Money = (amount: number) => string

const dayLabel = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
const percent = (ratio: number) => `${Math.round(ratio * 100)}%`
const lineAxisPointer = (t: ChartTokens) => ({
  type: 'line',
  lineStyle: { color: t.baseline, width: 1, type: 'solid' },
})

/** Ranked horizontal bars, one hue: categories are nominal, so color carries no rank. */
export function CategoryChart({
  slices,
  t,
  money,
}: {
  slices: { name: string; amount: number; count: number }[]
  t: ChartTokens
  money: Money
}) {
  const total = slices.reduce((sum, s) => sum + s.amount, 0)
  const option = useMemo<ChartOption>(
    () => ({
      grid: { left: 4, right: 56, top: 0, bottom: 0, containLabel: true },
      xAxis: { type: 'value', show: false },
      yAxis: {
        ...categoryAxis(
          t,
          slices.map((s) => s.name),
        ),
        inverse: true,
        axisLine: { show: false },
        axisLabel: { color: t.textSecondary, fontSize: 12, width: 112, overflow: 'truncate' },
      },
      series: [
        {
          type: 'bar',
          data: slices.map((s) => s.amount),
          barMaxWidth: 18,
          itemStyle: { color: t.series[0], borderRadius: [0, 4, 4, 0] },
          emphasis: { itemStyle: { opacity: 0.8 } },
          label: {
            show: true,
            position: 'right',
            color: t.textSecondary,
            fontSize: 11,
            formatter: ({ value }: { value: number }) => compact(value),
          },
        },
      ],
      tooltip: {
        ...tooltipBase(t),
        trigger: 'item',
        formatter: ({ dataIndex }: { dataIndex: number }) => {
          const s = slices[dataIndex]
          return tooltipElement(t, s.name, [
            { value: money(s.amount), label: `${percent(s.amount / total)} of spending` },
            { value: String(s.count), label: s.count === 1 ? 'transaction' : 'transactions' },
          ])
        },
      },
    }),
    [slices, t, money, total],
  )

  return (
    <ChartCard
      title="Spending by category"
      subtitle={`${money(total)} in total`}
      table={{
        columns: ['Category', 'Amount', 'Share'],
        rows: slices.map((s) => [s.name, money(s.amount), percent(s.amount / total)]),
      }}
    >
      {slices.length === 0 ? (
        <Empty>No expenses in this period</Empty>
      ) : (
        <EChart option={option} height={slices.length * 32 + 8} label="Spending by category, largest first" />
      )}
    </ChartCard>
  )
}

function bucketLabel(span: Span, size: BucketSize, withYear: boolean) {
  const d = new Date(span.start)
  if (size === 'week') return dayLabel(span.start)
  if (size === 'year') return String(d.getFullYear())
  return d.toLocaleDateString(undefined, withYear ? { month: 'short', year: '2-digit' } : { month: 'short' })
}

/** Income vs expense per week/month/year: two series, grouped columns. */
export function CashflowChart({
  spans,
  values,
  size,
  t,
  money,
}: {
  spans: Span[]
  values: { income: number; expense: number; net: number }[]
  size: BucketSize
  t: ChartTokens
  money: Money
}) {
  const { option, titles } = useMemo(() => {
    const multiYear =
      spans.length > 0 && new Date(spans[0].start).getFullYear() !== new Date(spans.at(-1)!.start).getFullYear()
    const labels = spans.map((s) => bucketLabel(s, size, multiYear))
    const titles = spans.map((s) =>
      size === 'week' ? `${dayLabel(s.start)} – ${dayLabel(s.end - 1)}` : bucketLabel(s, size, true),
    )
    const option: ChartOption = {
      grid: { left: 4, right: 4, top: 8, bottom: 0, containLabel: true },
      xAxis: categoryAxis(t, labels),
      yAxis: valueAxis(t),
      series: (['income', 'expense'] as const).map((key, i) => ({
        name: key === 'income' ? 'Income' : 'Expense',
        type: 'bar',
        data: values.map((v) => v[key]),
        barMaxWidth: 16,
        barGap: '15%',
        itemStyle: { color: t.series[i], borderRadius: [4, 4, 0, 0] },
        emphasis: { itemStyle: { opacity: 0.8 } },
      })),
      tooltip: {
        ...tooltipBase(t),
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: t.grid, opacity: 0.35 } },
        formatter: (params: { dataIndex: number }[]) => {
          const v = values[params[0].dataIndex]
          return tooltipElement(t, titles[params[0].dataIndex], [
            { value: money(v.income), label: 'Income', color: t.series[0] },
            { value: money(v.expense), label: 'Expense', color: t.series[1] },
            { value: money(v.net), label: v.net >= 0 ? 'Saved' : 'Overspent' },
          ])
        },
      },
    }
    return { option, titles }
  }, [spans, values, size, t, money])

  return (
    <ChartCard
      title="Cash flow"
      subtitle={`Income and expense per ${size}`}
      legend={[
        { label: 'Income', color: t.series[0], mark: 'bar' },
        { label: 'Expense', color: t.series[1], mark: 'bar' },
      ]}
      table={{
        columns: [size[0].toUpperCase() + size.slice(1), 'Income', 'Expense', 'Net'],
        rows: values.map((v, i) => [titles[i], money(v.income), money(v.expense), money(v.net)]),
      }}
    >
      <EChart option={option} height={220} label="Income and expense over time" />
    </ChartCard>
  )
}

/**
 * Running spending this period vs the previous one. Emphasis form: the
 * current period in the accent, the previous as gray context.
 */
export function PaceChart({
  start,
  current,
  previous,
  t,
  money,
}: {
  start: number
  current: number[]
  previous: number[]
  t: ChartTokens
  money: Money
}) {
  const { option, labels } = useMemo(() => {
    const first = new Date(start)
    const labels = Array.from({ length: Math.max(current.length, previous.length) }, (_, i) =>
      dayLabel(new Date(first.getFullYear(), first.getMonth(), first.getDate() + i).getTime()),
    )
    const option: ChartOption = {
      grid: { left: 4, right: 52, top: 12, bottom: 0, containLabel: true },
      xAxis: { ...categoryAxis(t, labels), boundaryGap: false },
      yAxis: valueAxis(t),
      series: [
        {
          name: 'Previous period',
          type: 'line',
          data: previous,
          showSymbol: false,
          lineStyle: { color: t.context, width: 2 },
          itemStyle: { color: t.context },
        },
        {
          name: 'This period',
          type: 'line',
          data: current,
          showSymbol: false,
          lineStyle: { color: t.series[0], width: 2, cap: 'round', join: 'round' },
          itemStyle: { color: t.series[0] },
          endLabel: {
            show: true,
            color: t.textPrimary,
            fontSize: 11,
            formatter: ({ value }: { value: number }) => compact(value),
          },
        },
      ],
      tooltip: {
        ...tooltipBase(t),
        trigger: 'axis',
        axisPointer: lineAxisPointer(t),
        formatter: (params: { dataIndex: number }[]) => {
          const i = params[0].dataIndex
          const rows = []
          if (i < current.length) rows.push({ value: money(current[i]), label: 'This period', color: t.series[0] })
          if (i < previous.length) rows.push({ value: money(previous[i]), label: 'Previous period', color: t.context })
          return tooltipElement(t, `Day ${i + 1} · ${labels[i]}`, rows)
        },
      },
    }
    return { option, labels }
  }, [start, current, previous, t, money])

  const now = current.at(-1) ?? 0
  const before = previous[current.length - 1] ?? previous.at(-1) ?? 0
  const subtitle =
    before > 0 && now !== before
      ? `${money(now)} so far: ${percent(Math.abs(now / before - 1))} ${now > before ? 'more' : 'less'} than at this point last period`
      : `${money(now)} so far`

  return (
    <ChartCard
      title="Spending pace"
      subtitle={subtitle}
      legend={[
        { label: 'This period', color: t.series[0], mark: 'line' },
        { label: 'Previous period', color: t.context, mark: 'line' },
      ]}
      table={{
        columns: ['Day', 'This period', 'Previous'],
        rows: labels.map((label, i) => [
          `${i + 1} · ${label}`,
          i < current.length ? money(current[i]) : '–',
          i < previous.length ? money(previous[i]) : '–',
        ]),
      }}
    >
      <EChart option={option} height={200} label="Cumulative spending, this period against the previous one" />
    </ChartCard>
  )
}

/** Balance over time: a single line with a light wash. */
export function NetWorthChart({
  points,
  balances,
  title,
  t,
  money,
}: {
  points: number[]
  balances: number[]
  title: string
  t: ChartTokens
  money: Money
}) {
  const { option, rows } = useMemo(() => {
    const long = points.length > 0 && points.at(-1)! - points[0] > 92 * 86_400_000
    const format = (ms: number) =>
      new Date(ms).toLocaleDateString(undefined, long ? { month: 'short', year: '2-digit' } : { day: 'numeric', month: 'short' })
    // Points are end-of-day boundaries; plot them on the day they close.
    const data = points.map((p, i) => [p - 1, balances[i]] as const)
    const option: ChartOption = {
      grid: { left: 4, right: 56, top: 12, bottom: 0, containLabel: true },
      xAxis: {
        type: 'time',
        axisLabel: { color: t.muted, fontSize: 11, hideOverlap: true, formatter: (v: number) => format(v) },
        axisLine: { lineStyle: { color: t.baseline, width: 1 } },
        axisTick: { show: false },
        splitLine: { show: false },
      },
      yAxis: { ...valueAxis(t), scale: true },
      series: [
        {
          type: 'line',
          data,
          showSymbol: false,
          lineStyle: { color: t.series[0], width: 2, cap: 'round', join: 'round' },
          itemStyle: { color: t.series[0] },
          areaStyle: { color: t.series[0], opacity: 0.1 },
          endLabel: {
            show: true,
            color: t.textPrimary,
            fontSize: 11,
            formatter: ({ value }: { value: number[] }) => compact(value[1]),
          },
        },
      ],
      tooltip: {
        ...tooltipBase(t),
        trigger: 'axis',
        axisPointer: lineAxisPointer(t),
        formatter: (params: { dataIndex: number }[]) => {
          const [date, value] = data[params[0].dataIndex]
          return tooltipElement(t, new Date(date).toLocaleDateString(undefined, { dateStyle: 'medium' }), [
            { value: money(value), label: 'Balance' },
          ])
        },
      },
    }
    const rows = data.map(([date, value]) => [format(date), money(value)]).reverse()
    return { option, rows }
  }, [points, balances, t, money])

  const change = (balances.at(-1) ?? 0) - (balances[0] ?? 0)
  return (
    <ChartCard
      title={title}
      subtitle={`${money(balances.at(-1) ?? 0)} now, ${change >= 0 ? 'up' : 'down'} ${money(Math.abs(change))} in this period`}
      table={{ columns: ['Date', 'Balance'], rows }}
    >
      <EChart option={option} height={200} label={`${title} over time`} />
    </ChartCard>
  )
}

/** A month as a calendar, each day shaded by what was spent (one-hue sequential ramp). */
export function SpendingCalendar({
  span,
  daily,
  weekStartsOn,
  t,
  money,
}: {
  span: Span
  daily: Map<string, number>
  weekStartsOn: number
  t: ChartTokens
  money: Money
}) {
  const { option, rows, height, max } = useMemo(() => {
    const first = new Date(span.start)
    const month = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}`
    const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
    const days = Array.from({ length: daysInMonth }, (_, i) =>
      dateKey(new Date(first.getFullYear(), first.getMonth(), i + 1).getTime()),
    )
    const max = Math.max(0, ...daily.values())
    // Quantile bins: a few big days would otherwise push every other day into the lightest step.
    const positive = [...daily.values()].filter((v) => v > 0).sort((a, b) => a - b)
    const steps = t.sequential.length
    const upperBounds = Array.from({ length: steps - 1 }, (_, i) => positive[Math.floor(((i + 1) * positive.length) / steps)] ?? Infinity)
    const bin = (amount: number) => {
      const i = upperBounds.findIndex((bound) => amount < bound)
      return i === -1 ? steps - 1 : i
    }
    const weeks = Math.ceil((((first.getDay() - weekStartsOn + 7) % 7) + daysInMonth) / 7)
    // Weekday initials in the phone's language, Sunday first as ECharts expects.
    const weekdays = Array.from({ length: 7 }, (_, i) =>
      new Date(2023, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'narrow' }),
    )
    const option: ChartOption = {
      calendar: {
        orient: 'vertical',
        range: month,
        cellSize: ['auto', 34],
        top: 22,
        left: 2,
        right: 2,
        bottom: 2,
        dayLabel: { firstDay: weekStartsOn, nameMap: weekdays, color: t.muted, fontSize: 11, margin: 6 },
        monthLabel: { show: false },
        yearLabel: { show: false },
        splitLine: { show: false },
        itemStyle: { color: t.grid, borderColor: t.surface, borderWidth: 3 },
      },
      // Heatmaps need a visualMap: map each day's bin (third value) to its color; -1 = nothing spent.
      visualMap: {
        show: false,
        type: 'piecewise',
        dimension: 2,
        pieces: [{ value: -1, color: t.grid }, ...t.sequential.map((color, i) => ({ value: i, color }))],
      },
      series: [
        {
          type: 'heatmap',
          coordinateSystem: 'calendar',
          data: days.map((day) => {
            const amount = daily.get(day) ?? 0
            const step = amount > 0 ? bin(amount) : -1
            return {
              value: [day, amount, step],
              // Day numbers inside a fill: white or near-black by how strong the fill is.
              label: { color: step >= steps / 2 ? t.onStrong : t.textSecondary },
            }
          }),
          label: {
            show: true,
            fontSize: 10,
            formatter: ({ value }: { value: [string, number, number] }) => String(Number(value[0].slice(8))),
          },
          // The surface-colored border is the gap between cells.
          itemStyle: { borderColor: t.surface, borderWidth: 3, borderRadius: 4 },
          emphasis: { itemStyle: { borderColor: t.textPrimary, borderWidth: 1 } },
        },
      ],
      tooltip: {
        ...tooltipBase(t),
        trigger: 'item',
        formatter: ({ value }: { value: [string, number, number] }) =>
          tooltipElement(t, new Date(`${value[0]}T12:00`).toLocaleDateString(undefined, { dateStyle: 'full' }), [
            { value: value[1] > 0 ? money(value[1]) : 'Nothing', label: 'spent' },
          ]),
      },
    }
    const rows = days
      .filter((d) => daily.has(d))
      .map((d) => [dayLabel(new Date(`${d}T12:00`).getTime()), money(daily.get(d)!)])
    return { option, rows, height: weeks * 34 + 26, max }
  }, [span, daily, weekStartsOn, t, money])

  return (
    <ChartCard
      title="Daily spending"
      subtitle={max > 0 ? `Busiest day: ${money(max)}` : 'No spending yet'}
      table={{ columns: ['Day', 'Spent'], rows }}
    >
      <EChart option={option} height={height} label="Spending per day of the month" />
      <div className="mt-2 flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
        Less
        {t.sequential.map((color) => (
          <span key={color} className="size-3 rounded-[3px]" style={{ background: color }} />
        ))}
        More
      </div>
    </ChartCard>
  )
}

function Empty({ children }: { children: string }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{children}</p>
}
