import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Pill button for picking one of several options. Filled with `color` when selected. */
export function Chip({
  selected,
  color,
  icon,
  className,
  children,
  ...props
}: ComponentProps<'button'> & {
  selected: boolean
  color?: string
  icon?: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm',
        selected && (color ? 'border-transparent text-black' : 'border-transparent bg-primary text-primary-foreground'),
        className,
      )}
      style={selected && color ? { background: color } : undefined}
      {...props}
    >
      {icon}
      {children}
    </button>
  )
}
