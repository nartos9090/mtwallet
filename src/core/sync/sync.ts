import type { InsertType, Table } from 'dexie'
import type { WalletDb } from '@/core/db'
import { newId as defaultNewId } from '@/core/id'
import type { Account, Category, Id, Syncable, Tag, Transaction } from '@/core/model'
import { DEFAULT_COLOR, namedCodec, transactionCodec } from '@/core/sync/codecs'
import { addToTab, mergeTab, type TabMergeResult } from '@/core/sync/merge'
import {
  type Cell,
  HEADERS,
  idColumn,
  type RemoteSnapshot,
  rowKey,
  type SheetStore,
  type SheetWrite,
  type SyncBase,
  type TabName,
  updatedColumn,
} from '@/core/sync/sheet'

/** Persisted per device while connected to a sheet. */
export interface SyncState {
  spreadsheetId: string
  email?: string
  base: SyncBase
  lastSyncedAt?: number
}

export interface SyncResult {
  pulled: number
  pushed: number
  warnings: string[]
}

const SCHEMA_VERSION = 1

interface LocalSnapshot {
  accounts: Account[]
  categories: Category[]
  tags: Tag[]
  transactions: Transaction[]
}

interface MergeOutput {
  accounts: TabMergeResult<Account>
  categories: TabMergeResult<Category>
  transactions: TabMergeResult<Transaction>
  newTags: Tag[]
}

const byOrder = (a: Account | Category, b: Account | Category) => a.orderNum - b.orderNum || a.name.localeCompare(b.name)
const newestFirst = (a: Transaction, b: Transaction) => b.date - a.date || a.id.localeCompare(b.id)

/** Merges every tab. Pure: the caller applies the result. */
export function mergeAll(
  local: LocalSnapshot,
  remote: RemoteSnapshot,
  base: SyncBase,
  now: number,
  newId: () => string,
): MergeOutput {
  const common = (tab: TabName) => ({
    width: HEADERS[tab].length,
    idColumn: idColumn(tab),
    updatedColumn: updatedColumn(tab),
    remote: remote.tabs[tab],
    base: base[tab],
    newId,
    now,
    label: tab,
  })
  const accounts = mergeTab({ ...common('Accounts'), codec: namedCodec<Account>(now), local: local.accounts, sort: byOrder })
  const categories = mergeTab({
    ...common('Categories'),
    codec: namedCodec<Category>(now),
    local: local.categories,
    sort: byOrder,
  })

  const accountNames = nameResolver(accounts, base.Accounts, HEADERS.Accounts.length)
  const categoryNames = nameResolver(categories, base.Categories, HEADERS.Categories.length)

  // New or edited rows may name accounts or categories that don't exist yet: create them.
  remote.tabs.Transactions.forEach((row) => {
    const id = String(row[idColumn('Transactions')] ?? '').trim()
    if (id && base.Transactions[id] === rowKey(row, HEADERS.Transactions.length)) return
    const isTransfer = String(row[1] ?? '').trim().toUpperCase() === 'TRANSFER'
    for (const name of [row[3], isTransfer ? row[4] : '']) accountNames.ensure(String(name ?? '').trim())
    categoryNames.ensure(String(row[5] ?? '').trim())
  })

  const tagsById = new Map(local.tags.filter((t) => !t.deleted).map((t) => [t.id, t]))
  const tagsByName = new Map([...tagsById.values()].map((t) => [t.name.toLowerCase(), t.id]))
  const newTags: Tag[] = []

  const transactions = mergeTab({
    ...common('Transactions'),
    codec: transactionCodec({
      accountName: (id) => accounts.final.get(id)?.name,
      categoryName: (id) => categories.final.get(id)?.name,
      tagName: (id) => tagsById.get(id)?.name,
      resolveAccount: (name) => accountNames.resolve(name),
      resolveCategory: (name) => categoryNames.resolve(name),
      resolveTags: (names) =>
        names.map((name) => {
          const existing = tagsByName.get(name.toLowerCase())
          if (existing) return existing
          const tag: Tag = { id: newId(), name, updatedAt: now, deleted: false }
          newTags.push(tag)
          tagsById.set(tag.id, tag)
          tagsByName.set(name.toLowerCase(), tag.id)
          return tag.id
        }),
      now,
    }),
    local: local.transactions,
    sort: newestFirst,
  })
  return { accounts, categories, transactions, newTags }

  /**
   * Finds accounts/categories by name: current names first, then names they had
   * at the last sync (so a rename in the sheet keeps its transactions linked).
   */
  function nameResolver<T extends Account | Category>(
    tab: TabMergeResult<T>,
    tabBase: Record<Id, string>,
    width: number,
  ) {
    const current = new Map<string, Id>()
    const previous = new Map<string, Id>()
    for (const e of tab.final.values()) if (!current.has(e.name.toLowerCase())) current.set(e.name.toLowerCase(), e.id)
    for (const [id, key] of Object.entries(tabBase)) {
      const name = String((JSON.parse(key) as Cell[])[0]).toLowerCase()
      if (tab.final.has(id) && !previous.has(name)) previous.set(name, id)
    }
    const resolve = (name: string) => current.get(name.toLowerCase()) ?? previous.get(name.toLowerCase())
    return {
      resolve,
      ensure(name: string) {
        if (!name || resolve(name)) return
        const orderNum = Math.max(-1, ...[...tab.final.values()].map((e) => e.orderNum)) + 1
        const entity = { id: newId(), name, color: DEFAULT_COLOR, orderNum, updatedAt: now, deleted: false } as T
        addToTab(tab, entity, namedCodec<T>(now).toRow(entity), width)
        current.set(name.toLowerCase(), entity.id)
      },
    }
  }
}

/**
 * One sync round: reads the sheet and local data, merges, applies remote
 * changes locally, writes the sheet if needed, then saves the new baseline.
 */
export async function runSync(
  db: WalletDb,
  store: SheetStore,
  now = Date.now(),
  newId: () => string = defaultNewId,
): Promise<SyncResult> {
  const state = await db.getSyncState()
  if (!state) throw new Error('Not connected to a sheet')

  const [remote, settings, accounts, categories, tags, transactions] = await Promise.all([
    store.read(),
    db.getSettings(),
    db.accounts.toArray(),
    db.categories.toArray(),
    db.tags.toArray(),
    db.transactions.toArray(),
  ])
  const remoteCurrency = typeof remote.meta.currency === 'string' ? remote.meta.currency : undefined
  const currency = settings?.currency ?? remoteCurrency
  if (!currency) throw new Error('The sheet has no currency set in its Meta tab')

  const warnings: string[] = []
  if (settings && remoteCurrency && remoteCurrency !== settings.currency) {
    warnings.push(`The sheet uses ${remoteCurrency} but this device uses ${settings.currency}`)
  }

  const merged = mergeAll({ accounts, categories, tags, transactions }, remote, state.base, now, newId)
  const base: SyncBase = {
    Accounts: merged.accounts.base,
    Categories: merged.categories.base,
    Transactions: merged.transactions.base,
  }

  // Apply remote changes, skipping entities edited locally while we were merging:
  // dropping their baseline makes the next round treat them as conflicts, which the newer edit wins.
  const readAt = new Map<Id, number>([...accounts, ...categories, ...transactions].map((e) => [e.id, e.updatedAt]))
  await db.transaction('rw', [db.accounts, db.categories, db.tags, db.transactions, db.meta], async () => {
    if (!settings) await db.meta.put({ key: 'settings', value: { currency } })
    async function apply<T extends Syncable>(table: Table<T, Id, InsertType<T, 'id'>>, tab: TabName, upserts: T[]) {
      for (const entity of upserts) {
        const current = await table.get(entity.id)
        if (current && current.updatedAt !== readAt.get(entity.id)) {
          delete base[tab][entity.id]
          continue
        }
        await table.put(entity)
      }
    }
    await db.tags.bulkPut(merged.newTags)
    await apply(db.accounts, 'Accounts', merged.accounts.upserts)
    await apply(db.categories, 'Categories', merged.categories.upserts)
    await apply(db.transactions, 'Transactions', merged.transactions.upserts)
  })

  const write: SheetWrite = { tabs: {} }
  if (merged.accounts.dirty) write.tabs.Accounts = merged.accounts.rows
  if (merged.categories.dirty) write.tabs.Categories = merged.categories.rows
  if (merged.transactions.dirty) write.tabs.Transactions = merged.transactions.rows
  if (!remoteCurrency || remote.meta.schema !== SCHEMA_VERSION) {
    write.meta = { currency: remoteCurrency ?? currency, schema: SCHEMA_VERSION }
  }
  if (Object.keys(write.tabs).length > 0 || write.meta) await store.write(write)

  await db.setSyncState({ ...state, base, lastSyncedAt: now })
  const parts = [merged.accounts, merged.categories, merged.transactions]
  return {
    pulled: parts.reduce((n, p) => n + p.pulled, 0),
    pushed: parts.reduce((n, p) => n + p.pushed, 0),
    warnings: [...warnings, ...parts.flatMap((p) => p.warnings)],
  }
}
