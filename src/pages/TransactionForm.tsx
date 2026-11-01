import { useLiveQuery } from 'dexie-react-hooks'
import { Trash2 } from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { CategoryField } from '@/components/CategoryField'
import { Chip } from '@/components/Chip'
import { DateTimeField } from '@/components/DateTimeField'
import { PageHeader } from '@/components/PageHeader'
import { TagsField } from '@/components/TagsField'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { db } from '@/core/db'
import type { Id, Transaction, TransactionType } from '@/core/model'
import { amountToInput, formatAmountInput, parseAmountInput } from '@/core/money'
import {
  deleteTransaction,
  ensureCategory,
  ensureTag,
  saveTransaction,
  type TransactionInput,
  validateTransaction,
} from '@/core/repo'
import { useAccounts, useCategories, useSettings, useTags, useTransactions } from '@/hooks/useWallet'
import { COLORS } from '@/lib/icons'

const TYPES: { value: TransactionType; label: string }[] = [
  { value: 'EXPENSE', label: 'Expense' },
  { value: 'INCOME', label: 'Income' },
  { value: 'TRANSFER', label: 'Transfer' },
]

/** Loads the transaction (when editing) and sensible defaults, then shows the editor. */
export function TransactionForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const transactions = useTransactions()
  // Names are loaded with the transaction so the form never starts from half-loaded lookups.
  const existing = useLiveQuery(async () => {
    const transaction = id ? await db.transactions.get(id) : undefined
    if (!transaction) return null
    const [category, tags] = await Promise.all([
      transaction.categoryId ? db.categories.get(transaction.categoryId) : undefined,
      db.tags.bulkGet(transaction.tagIds),
    ])
    return {
      transaction,
      categoryName: category && !category.deleted ? category.name : '',
      tagNames: tags.flatMap((t) => (t && !t.deleted ? [t.name] : [])),
    }
  }, [id])

  if (!transactions || existing === undefined) return null
  if (id && (!existing || existing.transaction.deleted)) {
    return (
      <>
        <PageHeader title="Transaction" back />
        <p className="p-4 text-muted-foreground">This transaction no longer exists.</p>
      </>
    )
  }

  const type = (params.get('type') as TransactionType | null) ?? 'EXPENSE'
  const initial: TransactionInput = existing?.transaction ?? {
    type,
    // Most people log from the same account most of the time.
    accountId: transactions[0]?.accountId ?? '',
    amount: NaN,
    date: NaN,
    tagIds: [],
  }
  return (
    <TransactionEditor
      key={id ?? 'new'}
      id={id}
      initial={initial}
      initialCategoryName={existing?.categoryName ?? ''}
      initialTagNames={existing?.tagNames ?? []}
      transactions={transactions}
    />
  )
}

function TransactionEditor({
  id,
  initial,
  initialCategoryName,
  initialTagNames,
  transactions,
}: {
  id?: Id
  initial: TransactionInput
  initialCategoryName: string
  initialTagNames: string[]
  transactions: Transaction[]
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const currency = useSettings()?.currency
  const accounts = useAccounts()
  const categories = useCategories()
  const tags = useTags()

  const [type, setType] = useState(initial.type)
  const [amount, setAmount] = useState(Number.isNaN(initial.amount) ? '' : amountToInput(initial.amount))
  const [chosenAccountId, setAccountId] = useState(initial.accountId)
  // With no history yet, default to the first account once accounts have loaded.
  const accountId = chosenAccountId || accounts[0]?.id || ''
  const [toAccountId, setToAccountId] = useState(initial.toAccountId)
  const [title, setTitle] = useState(initial.title ?? '')
  const [categoryName, setCategoryName] = useState(initialCategoryName)
  const [tagNames, setTagNames] = useState(initialTagNames)
  // A new transaction defaults to now.
  const [date, setDate] = useState(() => (Number.isNaN(initial.date) ? Date.now() : initial.date))
  const [description, setDescription] = useState(initial.description ?? '')

  // Most used categories for this type first.
  const sortedCategories = useMemo(() => {
    const usage = new Map<Id, number>()
    for (const t of transactions) {
      if (t.type === type && t.categoryId) usage.set(t.categoryId, (usage.get(t.categoryId) ?? 0) + 1)
    }
    return [...categories].sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0))
  }, [transactions, categories, type])

  const sortedTagNames = useMemo(() => {
    const usage = new Map<Id, number>()
    for (const t of transactions) for (const tagId of t.tagIds) usage.set(tagId, (usage.get(tagId) ?? 0) + 1)
    return [...tags].sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0)).map((t) => t.name)
  }, [transactions, tags])

  // Earlier titles for this type, newest first, with the category they had.
  const knownTitles = useMemo(() => {
    const seen = new Map<string, { title: string; categoryId?: Id }>()
    for (const t of transactions) {
      if (t.type !== type || !t.title) continue
      const key = t.title.toLowerCase()
      if (!seen.has(key)) seen.set(key, { title: t.title, categoryId: t.categoryId })
    }
    return seen
  }, [transactions, type])

  function onTitleChange(value: string) {
    setTitle(value)
    // Picking a known title fills in its usual category.
    const known = knownTitles.get(value.trim().toLowerCase())
    const category = known?.categoryId && categories.find((c) => c.id === known.categoryId)
    if (category && !categoryName.trim()) setCategoryName(category.name)
  }

  function goBack() {
    // Opened directly (e.g. from a shortcut): there is no history to go back to.
    if (location.key === 'default') navigate('/', { replace: true })
    else navigate(-1)
  }

  async function onSave() {
    const input: TransactionInput = {
      type,
      amount: parseAmountInput(amount),
      accountId,
      toAccountId,
      title,
      description,
      date,
      tagIds: [],
    }
    const error = validateTransaction(input)
    if (error) return toast.error(error)
    try {
      // One DB transaction, so a failed save doesn't leave a new category or tag behind.
      await db.transaction('rw', [db.categories, db.tags, db.transactions], async () => {
        if (categoryName.trim()) {
          input.categoryId = await ensureCategory(db, categoryName, COLORS[categories.length % COLORS.length])
        }
        for (const name of tagNames) input.tagIds.push(await ensureTag(db, name))
        await saveTransaction(db, input, id)
      })
      toast.success(id ? 'Transaction updated' : 'Transaction added')
      goBack()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  async function onDelete() {
    await deleteTransaction(db, id!)
    toast.success('Transaction deleted')
    goBack()
  }

  const accountChips = (selected: Id | undefined, onSelect: (id: Id) => void, exclude?: Id) => (
    <div className="flex flex-wrap gap-2">
      {accounts
        .filter((a) => a.id !== exclude)
        .map((a) => (
          <Chip key={a.id} selected={selected === a.id} color={a.color} onClick={() => onSelect(a.id)}>
            {a.name}
          </Chip>
        ))}
    </div>
  )

  return (
    <div className="flex min-h-dvh flex-col">
      <PageHeader
        title={id ? 'Edit transaction' : 'New transaction'}
        back
        actions={
          id && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Delete">
                  <Trash2 />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this transaction?</AlertDialogTitle>
                  <AlertDialogDescription>Balances and statistics will no longer include it.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={() => void onDelete()}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )
        }
      />

      <form
        className="flex flex-1 flex-col gap-5 px-4 pb-28"
        onSubmit={(e) => {
          e.preventDefault()
          void onSave()
        }}
      >
        <ToggleGroup
          type="single"
          variant="outline"
          className="w-full"
          spacing={0}
          value={type}
          onValueChange={(value) => value && setType(value as TransactionType)}
        >
          {TYPES.map((t) => (
            <ToggleGroupItem key={t.value} value={t.value} className="flex-1">
              {t.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <div className="flex items-baseline gap-2 border-b pb-2">
          <span className="text-muted-foreground">{currency}</span>
          <input
            aria-label="Amount"
            inputMode="decimal"
            placeholder="0"
            autoFocus={!id}
            className="w-full bg-transparent text-4xl font-semibold tabular-nums outline-none"
            value={amount}
            onChange={(e) => setAmount(formatAmountInput(e.target.value))}
          />
        </div>

        <Field label={type === 'TRANSFER' ? 'From' : 'Account'}>{accountChips(accountId, setAccountId)}</Field>
        {type === 'TRANSFER' && <Field label="To">{accountChips(toAccountId, setToAccountId, accountId)}</Field>}

        <Field label="Title" htmlFor="tx-title">
          <Input
            id="tx-title"
            list="tx-titles"
            autoComplete="off"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
          />
          <datalist id="tx-titles">
            {[...knownTitles.values()].slice(0, 300).map((t) => (
              <option key={t.title} value={t.title} />
            ))}
          </datalist>
        </Field>

        <Field label={type === 'TRANSFER' ? 'Category (optional)' : 'Category'} htmlFor="tx-category">
          <CategoryField id="tx-category" value={categoryName} onChange={setCategoryName} categories={sortedCategories} />
        </Field>

        <Field label="Tags" htmlFor="tx-tags">
          <TagsField id="tx-tags" value={tagNames} onChange={setTagNames} suggestions={sortedTagNames} />
        </Field>

        <Field label="Date">
          <DateTimeField value={date} onChange={setDate} />
        </Field>

        <Field label="Description" htmlFor="tx-description">
          <Textarea id="tx-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>

        <div className="fixed inset-x-0 bottom-0 border-t bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button type="submit" size="lg" className="mx-auto flex w-full max-w-md">
            {id ? 'Save' : 'Add'}
          </Button>
        </div>
      </form>
    </div>
  )
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor} className="text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}
