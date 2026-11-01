import { Check } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { EntityIcon } from '@/components/EntityIcon'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { COLORS, ICONS } from '@/lib/icons'
import { cn } from '@/lib/utils'

export interface EntityValues {
  name: string
  color: string
  icon?: string
}

/** Create/edit dialog for accounts and categories. */
export function EntityDialog({
  open,
  onOpenChange,
  title,
  initial,
  onSave,
  onDelete,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  initial?: EntityValues
  onSave: (values: EntityValues) => Promise<unknown>
  onDelete?: () => Promise<unknown>
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {/* Remount per open so the form starts from `initial` each time. */}
        {open && (
          <EntityForm
            initial={initial}
            onSave={onSave}
            onDelete={onDelete}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function EntityForm({
  initial,
  onSave,
  onDelete,
  onDone,
}: {
  initial?: EntityValues
  onSave: (values: EntityValues) => Promise<unknown>
  onDelete?: () => Promise<unknown>
  onDone: () => void
}) {
  const [values, setValues] = useState<EntityValues>(initial ?? { name: '', color: COLORS[6] })
  const set = (patch: Partial<EntityValues>) => setValues((v) => ({ ...v, ...patch }))

  async function run(action: () => Promise<unknown>) {
    try {
      await action()
      onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        void run(() => onSave(values))
      }}
    >
      <div className="flex items-center gap-3">
        <EntityIcon name={values.name} color={values.color} icon={values.icon} className="size-11" />
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="entity-name">Name</Label>
          <Input id="entity-name" value={values.name} onChange={(e) => set({ name: e.target.value })} autoFocus />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Color</Label>
        <div className="flex flex-wrap gap-2">
          {COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={color}
              className="flex size-7 items-center justify-center rounded-full"
              style={{ background: color }}
              onClick={() => set({ color })}
            >
              {values.color === color && <Check className="size-4 text-black/70" />}
            </button>
          ))}
          <input
            type="color"
            aria-label="Custom color"
            className="size-7 cursor-pointer rounded-full border bg-transparent"
            value={values.color}
            onChange={(e) => set({ color: e.target.value })}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Icon</Label>
        <div className="grid max-h-36 grid-cols-8 gap-1 overflow-y-auto">
          <button
            type="button"
            className={cn('flex h-9 items-center justify-center rounded-md text-sm', !values.icon && 'bg-muted')}
            onClick={() => set({ icon: undefined })}
          >
            Aa
          </button>
          {Object.entries(ICONS).map(([name, Icon]) => (
            <button
              key={name}
              type="button"
              aria-label={name}
              className={cn('flex h-9 items-center justify-center rounded-md', values.icon === name && 'bg-muted')}
              onClick={() => set({ icon: name })}
            >
              <Icon className="size-5" />
            </button>
          ))}
        </div>
      </div>

      <DialogFooter className="flex-row gap-2">
        {onDelete && (
          <Button type="button" variant="destructive" className="mr-auto" onClick={() => void run(onDelete)}>
            Delete
          </Button>
        )}
        <Button type="submit">Save</Button>
      </DialogFooter>
    </form>
  )
}
