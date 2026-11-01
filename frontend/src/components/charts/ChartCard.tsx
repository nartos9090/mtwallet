import { type ReactNode, useState } from 'react'
import { Button } from '@/components/ui/button'

export interface LegendItem {
  label: string
  color: string
  /** Mirrors the mark: a block for bars, a short line for lines. */
  mark: 'bar' | 'line'
}

export interface TableView {
  columns: string[]
  rows: string[][]
}

/**
 * A chart with its title, legend and a table view: every value stays readable
 * without hovering.
 */
export function ChartCard({
  title,
  subtitle,
  legend,
  table,
  children,
}: {
  title: string
  subtitle?: string
  legend?: LegendItem[]
  table?: TableView
  children: ReactNode
}) {
  const [showTable, setShowTable] = useState(false)

  return (
    <figure className="mx-4 rounded-xl border p-4">
      <figcaption className="flex items-start gap-2">
        <div className="flex-1">
          <h2 className="font-medium">{title}</h2>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {table && (
          <Button variant="ghost" size="sm" className="-mt-1 -mr-2" onClick={() => setShowTable((v) => !v)}>
            {showTable ? 'Chart' : 'Table'}
          </Button>
        )}
      </figcaption>

      {legend && legend.length > 1 && !showTable && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {legend.map((item) => (
            <li key={item.label} className="flex items-center gap-1.5">
              <span
                className={item.mark === 'bar' ? 'size-2.5 rounded-[2px]' : 'h-0.5 w-3 rounded-full'}
                style={{ background: item.color }}
              />
              {item.label}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2">
        {showTable && table ? (
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background text-left text-muted-foreground">
                <tr>
                  {table.columns.map((c, i) => (
                    <th key={c} className={i > 0 ? 'py-1.5 text-right font-normal' : 'py-1.5 font-normal'}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, r) => (
                  <tr key={r} className="border-t">
                    {row.map((cell, i) => (
                      <td key={i} className={i > 0 ? 'py-1.5 text-right tabular-nums' : 'py-1.5'}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          children
        )}
      </div>
    </figure>
  )
}
