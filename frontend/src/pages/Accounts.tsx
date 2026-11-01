import { Plus } from 'lucide-react'
import { useState } from 'react'
import { EntityDialog, type EntityValues } from '@/components/EntityDialog'
import { EntityIcon } from '@/components/EntityIcon'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { db } from '@/core/db'
import type { Account } from '@/core/model'
import { adjustBalance, deleteAccount, saveAccount } from '@/core/repo'
import { useAccounts, useBalances, useMoney } from '@/hooks/useWallet'
import { cn } from '@/lib/utils'

export function Accounts() {
  const accounts = useAccounts()
  const balances = useBalances()
  const money = useMoney()
  // `null` = adding a new account.
  const [editing, setEditing] = useState<Account | null>()

  const total = accounts.reduce((sum, a) => sum + (balances.get(a.id) ?? 0), 0)

  async function onSave({ balance, ...values }: EntityValues) {
    await db.transaction('rw', [db.accounts, db.transactions], async () => {
      const id = await saveAccount(db, values, editing?.id)
      if (balance !== undefined) await adjustBalance(db, id, balance)
    })
  }

  return (
    <>
      <PageHeader
        title="Accounts"
        actions={
          <Button variant="ghost" size="icon" aria-label="Add account" onClick={() => setEditing(null)}>
            <Plus />
          </Button>
        }
      />
      <section className="mx-4 rounded-xl border p-4">
        <p className="text-sm text-muted-foreground">Total balance</p>
        <p className="text-2xl font-semibold tabular-nums">{money(total)}</p>
      </section>

      <ul className="mt-3">
        {accounts.map((a) => {
          const balance = balances.get(a.id) ?? 0
          return (
            <li key={a.id}>
              <button
                className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-muted"
                onClick={() => setEditing(a)}
              >
                <EntityIcon name={a.name} color={a.color} icon={a.icon} />
                <span className="flex-1 font-medium">{a.name}</span>
                <span className={cn('tabular-nums', balance < 0 && 'text-destructive')}>{money(balance)}</span>
              </button>
            </li>
          )
        })}
      </ul>

      <EntityDialog
        open={editing !== undefined}
        onOpenChange={(open) => !open && setEditing(undefined)}
        title={editing ? 'Edit account' : 'New account'}
        // A new account starts at 0; entering a balance records it as an adjustment, like Ivy.
        initial={
          editing
            ? { name: editing.name, color: editing.color, icon: editing.icon, balance: balances.get(editing.id) ?? 0 }
            : { name: '', color: '#2196f3', balance: 0 }
        }
        onSave={onSave}
        onDelete={editing ? () => deleteAccount(db, editing.id) : undefined}
      />
    </>
  )
}
