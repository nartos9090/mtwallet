import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ICONS } from '@/lib/icons'

/** Round badge for an account or category: its icon, or its first letter. */
export function EntityIcon({
  name,
  color,
  icon,
  fallback,
  className,
}: {
  name?: string
  color?: string
  icon?: string
  /** Icon to show when the entity has none, e.g. for transfers. */
  fallback?: LucideIcon
  className?: string
}) {
  const Icon = (icon && ICONS[icon]) || fallback
  return (
    <span
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-black/80',
        className,
      )}
      style={{ background: color ?? 'var(--muted)' }}
    >
      {Icon ? <Icon className="size-[55%]" /> : (name?.trim()[0]?.toUpperCase() ?? '?')}
    </span>
  )
}
