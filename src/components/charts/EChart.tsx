import { BarChart, HeatmapChart, LineChart } from 'echarts/charts'
import { CalendarComponent, GridComponent, TooltipComponent, VisualMapComponent } from 'echarts/components'
import * as echarts from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'
import { useEffect, useRef } from 'react'

echarts.use([
  BarChart,
  LineChart,
  HeatmapChart,
  GridComponent,
  TooltipComponent,
  CalendarComponent,
  VisualMapComponent,
  SVGRenderer,
])

export type ChartOption = echarts.EChartsCoreOption

/** Renders an ECharts option, resizing with its container. The height includes the axis labels. */
export function EChart({ option, height, label }: { option: ChartOption; height: number; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const chart = useRef<echarts.ECharts>(undefined)

  useEffect(() => {
    const instance = echarts.init(ref.current!, undefined, { renderer: 'svg' })
    chart.current = instance
    const observer = new ResizeObserver(() => instance.resize())
    observer.observe(ref.current!)
    return () => {
      observer.disconnect()
      instance.dispose()
    }
  }, [])

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true })
  }, [option])

  return <div ref={ref} role="img" aria-label={label} style={{ height }} />
}
