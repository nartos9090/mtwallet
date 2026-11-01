import { X } from 'lucide-react'
import { useState } from 'react'
import { Chip } from '@/components/Chip'
import { EntityIcon } from '@/components/EntityIcon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Category } from '@/core/model'

/** Suggestions shown before "more" when nothing is typed. */
const TOP = 12

/**
 * Free-text category with the existing ones as suggestions. A name that
 * matches no category becomes a new one when the transaction is saved.
 */
export function CategoryField({
  id,
  value,
  onChange,
  categories,
}: {
  id?: string
  value: string
  onChange: (name: string) => void
  /** Most relevant first. */
  categories: Category[]
}) {
  const [showAll, setShowAll] = useState(false)
  const query = value.trim().toLowerCase()
  const selected = categories.find((c) => c.name.toLowerCase() === query)

  // While typing a new name, narrow the suggestions; otherwise show the usual list.
  const filtering = query !== '' && !selected
  const matches = filtering ? categories.filter((c) => c.name.toLowerCase().includes(query)) : categories
  const visible = filtering || showAll ? matches : matches.filter((c, i) => i < TOP || c === selected)

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Input
          id={id}
          autoComplete="off"
          placeholder="Type or pick a category"
          className="pr-9"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Clear category"
            className="absolute top-1/2 right-1 -translate-y-1/2"
            onClick={() => onChange('')}
          >
            <X />
          </Button>
        )}
      </div>
      {filtering && (
        <p className="text-sm text-muted-foreground">New category “{value.trim()}” will be created.</p>
      )}
      <div className="flex flex-wrap gap-2">
        {visible.map((c) => (
          <Chip
            key={c.id}
            selected={c === selected}
            color={c.color}
            icon={<EntityIcon name={c.name} color={c.color} icon={c.icon} className="size-5" />}
            onClick={() => onChange(c === selected ? '' : c.name)}
          >
            {c.name}
          </Chip>
        ))}
        {!filtering && matches.length > TOP && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Less' : `+${matches.length - TOP} more`}
          </Button>
        )}
      </div>
    </div>
  )
}
