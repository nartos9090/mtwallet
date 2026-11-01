import type {
  Account,
  Category,
  Id,
  Transaction,
  TransactionSource,
  TransactionStatus,
  TransactionType,
} from '@/core/model'
import type { Cell, SheetRow } from '@/core/sync/sheet'

/** Converts entities to sheet rows and back. `fromRow` throws a user-facing message for bad rows. */
export interface Codec<T> {
  toRow(entity: T): SheetRow
  fromRow(row: SheetRow, id: Id): T
}

// Spreadsheet dates are days since 1899-12-30, in the sheet's wall-clock time.
const SERIAL_EPOCH_DAYS = 25569
const DAY_MS = 86_400_000

/** Epoch ms -> spreadsheet serial date, in the device's local time. */
export function toSerial(ms: number): number {
  const d = new Date(ms)
  const wall = Date.UTC(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
    d.getMilliseconds(),
  )
  return wall / DAY_MS + SERIAL_EPOCH_DAYS
}

/** Spreadsheet serial date -> epoch ms, reading it as local time. */
export function fromSerial(serial: number): number {
  const wall = new Date(Math.round((serial - SERIAL_EPOCH_DAYS) * DAY_MS))
  return new Date(
    wall.getUTCFullYear(),
    wall.getUTCMonth(),
    wall.getUTCDate(),
    wall.getUTCHours(),
    wall.getUTCMinutes(),
    wall.getUTCSeconds(),
    wall.getUTCMilliseconds(),
  ).getTime()
}

const text = (cell: Cell | undefined) => (cell === undefined ? '' : String(cell).trim())
const optionalText = (cell: Cell | undefined) => text(cell) || undefined

function number(cell: Cell | undefined, what: string): number {
  const value = typeof cell === 'number' ? cell : Number(text(cell))
  if (text(cell) === '' || !Number.isFinite(value)) throw new Error(`${what} is not a number`)
  return value
}

/** Updated column; rows typed in by hand have none, so they count as changed now. */
const updatedAt = (cell: Cell | undefined, now: number) => (typeof cell === 'number' ? cell : now)

const HEX_COLOR = /^#[0-9a-f]{6}$/i
export const DEFAULT_COLOR = '#78909c'

/** Accounts and categories share a shape: Name, Color, Icon, Order, ID, Updated. */
export function namedCodec<T extends Account | Category>(now: number): Codec<T> {
  return {
    toRow: (e) => [e.name, e.color, e.icon ?? '', e.orderNum, e.id, e.updatedAt],
    fromRow(row, id) {
      const name = text(row[0])
      if (!name) throw new Error('Name is empty')
      return {
        id,
        name,
        color: HEX_COLOR.test(text(row[1])) ? text(row[1]).toLowerCase() : DEFAULT_COLOR,
        icon: optionalText(row[2]),
        orderNum: typeof row[3] === 'number' ? row[3] : 0,
        updatedAt: updatedAt(row[5], now),
        deleted: false,
      } as T
    },
  }
}

const TYPE_LABELS: Record<TransactionType, string> = { EXPENSE: 'Expense', INCOME: 'Income', TRANSFER: 'Transfer' }
const SOURCES: TransactionSource[] = ['app', 'sheet', 'ivy-import', 'agent']

/** Name lookups for transaction rows, which show names instead of ids. */
export interface TransactionContext {
  accountName(id: Id): string | undefined
  categoryName(id: Id): string | undefined
  tagName(id: Id): string | undefined
  resolveAccount(name: string): Id | undefined
  resolveCategory(name: string): Id | undefined
  /** Returns ids for tag names, creating tags that don't exist yet. */
  resolveTags(names: string[]): Id[]
  now: number
}

export function transactionCodec(ctx: TransactionContext): Codec<Transaction> {
  return {
    toRow: (t) => [
      toSerial(t.date),
      TYPE_LABELS[t.type],
      t.amount,
      ctx.accountName(t.accountId) ?? '',
      t.toAccountId ? (ctx.accountName(t.toAccountId) ?? '') : '',
      t.categoryId ? (ctx.categoryName(t.categoryId) ?? '') : '',
      t.title ?? '',
      t.description ?? '',
      t.tagIds.flatMap((id) => ctx.tagName(id) ?? []).join(', '),
      t.status,
      t.source,
      t.id,
      t.updatedAt,
    ],
    fromRow(row, id) {
      const dateCell = row[0]
      const date = typeof dateCell === 'number' ? fromSerial(dateCell) : new Date(text(dateCell)).getTime()
      if (!Number.isFinite(date)) throw new Error('Date is not a date')

      const typeText = text(row[1]).toUpperCase()
      const type = (Object.keys(TYPE_LABELS) as TransactionType[]).find((t) => t === typeText)
      if (!type) throw new Error(`Type must be ${Object.values(TYPE_LABELS).join(', ')}`)

      const amount = Math.abs(number(row[2], 'Amount'))
      if (amount === 0) throw new Error('Amount is zero')

      const account = (column: number, label: string) => {
        const name = text(row[column])
        const accountId = ctx.resolveAccount(name)
        if (!accountId) throw new Error(name ? `${label} “${name}” doesn't exist` : `${label} is empty`)
        return accountId
      }
      const categoryName = text(row[5])
      const status = text(row[9]).toLowerCase() as TransactionStatus
      const source = text(row[10]) as TransactionSource

      return {
        id,
        type,
        amount,
        accountId: account(3, 'Account'),
        toAccountId: type === 'TRANSFER' ? account(4, 'To account') : undefined,
        categoryId: categoryName ? ctx.resolveCategory(categoryName) : undefined,
        title: optionalText(row[6]),
        description: optionalText(row[7]),
        date,
        tagIds: ctx.resolveTags(
          text(row[8])
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        ),
        status: status === 'pending' ? 'pending' : 'confirmed',
        source: SOURCES.includes(source) ? source : 'sheet',
        updatedAt: updatedAt(row[12], ctx.now),
        deleted: false,
      }
    },
  }
}
