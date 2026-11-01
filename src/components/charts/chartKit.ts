import type { ChartTokens } from '@/components/charts/tokens'

/** Shared chart chrome: recessive hairline axes, text-token labels, the tooltip. */

const compactFormat = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 })
/** Axis ticks and direct labels: 1.2M, 350K. */
export const compact = (n: number) => compactFormat.format(n)

export function valueAxis(t: ChartTokens, options: { show?: boolean } = {}) {
  return {
    type: 'value' as const,
    show: options.show ?? true,
    axisLabel: { color: t.muted, fontSize: 11, formatter: compact },
    splitLine: { lineStyle: { color: t.grid, width: 1, type: 'solid' as const } },
    axisLine: { show: false },
    axisTick: { show: false },
  }
}

export function categoryAxis(t: ChartTokens, data: string[]) {
  return {
    type: 'category' as const,
    data,
    axisLabel: { color: t.muted, fontSize: 11, hideOverlap: true },
    axisLine: { lineStyle: { color: t.baseline, width: 1 } },
    axisTick: { show: false },
  }
}

export interface TooltipRow {
  label: string
  value: string
  /** Series color; drawn as a short line key beside the row. */
  color?: string
}

/**
 * Tooltip content as DOM: names come from user data, so they go in via
 * textContent, never as HTML. The value leads; the series name follows.
 */
export function tooltipElement(t: ChartTokens, title: string, rows: TooltipRow[]): HTMLElement {
  const root = document.createElement('div')
  root.style.cssText = `font: 12px system-ui, sans-serif; color: ${t.textSecondary}; min-width: 120px`
  const heading = document.createElement('div')
  heading.textContent = title
  heading.style.cssText = `color: ${t.muted}; margin-bottom: 4px`
  root.append(heading)
  for (const row of rows) {
    const line = document.createElement('div')
    line.style.cssText = 'display: flex; align-items: center; gap: 6px; line-height: 1.6'
    if (row.color) {
      const key = document.createElement('span')
      key.style.cssText = `width: 10px; height: 2px; border-radius: 1px; background: ${row.color}; flex: none`
      line.append(key)
    }
    const value = document.createElement('strong')
    value.textContent = row.value
    value.style.cssText = `color: ${t.textPrimary}; font-weight: 600; font-variant-numeric: tabular-nums`
    const label = document.createElement('span')
    label.textContent = row.label
    line.append(value, label)
    root.append(line)
  }
  return root
}

export function tooltipBase(t: ChartTokens) {
  return {
    confine: true,
    backgroundColor: t.surface,
    borderColor: t.grid,
    borderWidth: 1,
    padding: [8, 10],
    extraCssText: 'box-shadow: 0 4px 16px rgba(0,0,0,0.12); border-radius: 8px;',
    triggerOn: 'mousemove|click' as const,
  }
}
