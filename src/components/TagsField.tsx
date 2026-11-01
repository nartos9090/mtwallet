import { X } from 'lucide-react'
import { useState } from 'react'
import { Chip } from '@/components/Chip'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'

const MAX_SUGGESTIONS = 12

/**
 * Free-text tags with existing ones as suggestions. Enter, a comma or leaving
 * the field adds what was typed; unknown names become new tags on save.
 */
export function TagsField({
  id,
  value,
  onChange,
  suggestions,
}: {
  id?: string
  value: string[]
  onChange: (names: string[]) => void
  /** Existing tag names, most used first. */
  suggestions: string[]
}) {
  const [draft, setDraft] = useState('')
  const has = (name: string) => value.some((n) => n.toLowerCase() === name.toLowerCase())

  function add(raw: string) {
    const name = raw.replace(/,/g, '').trim()
    if (name && !has(name)) onChange([...value, name])
    setDraft('')
  }

  const query = draft.trim().toLowerCase()
  const visible = suggestions
    .filter((name) => !has(name) && name.toLowerCase().includes(query))
    .slice(0, MAX_SUGGESTIONS)

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((name) => (
            <Badge key={name} variant="secondary" className="gap-1">
              {name}
              <button type="button" aria-label={`Remove ${name}`} onClick={() => onChange(value.filter((n) => n !== name))}>
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <Input
        id={id}
        autoComplete="off"
        placeholder="Type a tag and press Enter"
        value={draft}
        onChange={(e) => (e.target.value.endsWith(',') ? add(e.target.value) : setDraft(e.target.value))}
        onBlur={() => add(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            add(draft)
          }
        }}
      />
      {visible.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {visible.map((name) => (
            <Chip key={name} selected={false} onClick={() => add(name)}>
              {name}
            </Chip>
          ))}
        </div>
      )}
    </div>
  )
}
