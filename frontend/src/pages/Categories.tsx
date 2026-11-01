import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { EntityDialog } from '@/components/EntityDialog'
import { EntityIcon } from '@/components/EntityIcon'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { db } from '@/core/db'
import type { Category, Id } from '@/core/model'
import { deleteCategory, saveCategory } from '@/core/repo'
import { useCategories, useTransactions } from '@/hooks/useWallet'

export function Categories() {
  const categories = useCategories()
  const transactions = useTransactions()
  // `null` = adding a new category.
  const [editing, setEditing] = useState<Category | null>()

  const usage = useMemo(() => {
    const counts = new Map<Id, number>()
    for (const t of transactions ?? []) {
      if (t.categoryId) counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1)
    }
    return counts
  }, [transactions])

  return (
    <>
      <PageHeader
        title="Categories"
        back
        actions={
          <Button variant="ghost" size="icon" aria-label="Add category" onClick={() => setEditing(null)}>
            <Plus />
          </Button>
        }
      />
      <ul>
        {categories.map((c) => (
          <li key={c.id}>
            <button
              className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-muted"
              onClick={() => setEditing(c)}
            >
              <EntityIcon name={c.name} color={c.color} icon={c.icon} />
              <span className="flex-1 font-medium">{c.name}</span>
              <span className="text-sm text-muted-foreground tabular-nums">{usage.get(c.id) ?? 0}</span>
            </button>
          </li>
        ))}
      </ul>

      <EntityDialog
        open={editing !== undefined}
        onOpenChange={(open) => !open && setEditing(undefined)}
        title={editing ? 'Edit category' : 'New category'}
        initial={editing ?? undefined}
        onSave={(values) => saveCategory(db, values, editing?.id)}
        onDelete={editing ? () => deleteCategory(db, editing.id) : undefined}
      />
    </>
  )
}
