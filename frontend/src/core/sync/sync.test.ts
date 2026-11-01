import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { WalletDb } from '@/core/db'
import { newId } from '@/core/id'
import type { Transaction } from '@/core/model'
import { deleteTransaction, ensureTag, saveAccount, saveTransaction, startFresh } from '@/core/repo'
import { fromSerial, toSerial } from '@/core/sync/codecs'
import {
  type Cell,
  emptyBase,
  ENTITY_TABS,
  HEADERS,
  type RemoteSnapshot,
  type SheetRow,
  type SheetStore,
  type SheetWrite,
  type TabName,
} from '@/core/sync/sheet'
import { runSync } from '@/core/sync/sync'

/** In-memory stand-in for the Google Sheet. */
class FakeSheet implements SheetStore {
  tabs: Record<TabName, SheetRow[]> = { Accounts: [], Categories: [], Transactions: [] }
  meta: Record<string, Cell> = {}
  writes = 0

  async read(): Promise<RemoteSnapshot> {
    return structuredClone({ tabs: this.tabs, meta: this.meta })
  }

  async write(changes: SheetWrite) {
    this.writes++
    for (const tab of ENTITY_TABS) if (changes.tabs[tab]) this.tabs[tab] = structuredClone(changes.tabs[tab])
    if (changes.meta) this.meta = { ...changes.meta }
  }

  col(tab: TabName, name: string) {
    return HEADERS[tab].indexOf(name)
  }

  /** The row of the transaction with this title. */
  row(title: string) {
    const row = this.tabs.Transactions.find((r) => r[this.col('Transactions', 'Title')] === title)
    if (!row) throw new Error(`No row titled ${title}`)
    return row
  }
}

async function device() {
  const db = new WalletDb(`test-${newId()}`)
  await db.setSyncState({ spreadsheetId: 'sheet', base: emptyBase() })
  return db
}

const live = async (db: WalletDb) => db.transactions.filter((t) => !t.deleted).toArray()
const byTitle = async (db: WalletDb, title: string) => (await live(db)).find((t) => t.title === title)

let sheet: FakeSheet
let a: WalletDb
let ids: { cash: string; bank: string; food: string }

beforeEach(async () => {
  sheet = new FakeSheet()
  a = await device()
  await startFresh(a, 'IDR')
  const cash = (await a.accounts.toArray())[0].id
  const bank = await saveAccount(a, { name: 'Bank', color: '#2196f3' })
  const food = (await a.categories.toArray()).find((c) => c.name === 'Food & Drinks')!.id
  ids = { cash, bank, food }
  const trip = await ensureTag(a, 'trip')
  const base = { tagIds: [], date: new Date(2026, 9, 31, 12, 30, 15, 123).getTime() }
  await saveTransaction(a, { ...base, type: 'EXPENSE', accountId: cash, amount: 25_000, categoryId: food, title: 'Lunch', tagIds: [trip] })
  await saveTransaction(a, { ...base, type: 'TRANSFER', accountId: bank, toAccountId: cash, amount: 100_000, title: 'Top up' })
  await saveTransaction(a, { ...base, type: 'INCOME', accountId: bank, amount: 3_200_000, title: 'Salary', description: 'October' })
  await runSync(a, sheet)
})

describe('serial dates', () => {
  it('round-trip to the millisecond in local time', () => {
    for (const ms of [new Date(2026, 9, 31, 12, 30, 15, 123).getTime(), 1793517697486, 0]) {
      expect(fromSerial(toSerial(ms))).toBe(ms)
    }
    expect(toSerial(new Date(1899, 11, 31).getTime())).toBe(1)
  })
})

describe('sync', () => {
  it('pushes local data with names instead of ids', () => {
    expect(sheet.meta).toEqual({ currency: 'IDR', schema: 1 })
    expect(sheet.tabs.Accounts.map((r) => r[0])).toEqual(['Cash', 'Bank'])
    expect(sheet.tabs.Transactions).toHaveLength(3)
    const lunch = sheet.row('Lunch')
    expect(lunch.slice(1, 9)).toEqual(['Expense', 25_000, 'Cash', '', 'Food & Drinks', 'Lunch', '', 'trip'])
    expect(sheet.row('Top up').slice(3, 6)).toEqual(['Bank', 'Cash', ''])
  })

  it('restores everything on a new device, and then stays quiet', async () => {
    const b = await device()
    await runSync(b, sheet)
    expect(await b.getSettings()).toEqual({ currency: 'IDR' })
    const strip = (t: Transaction) => ({ ...t, tagIds: t.tagIds.length })
    const sortById = (txs: Transaction[]) => txs.map(strip).sort((x, y) => x.id.localeCompare(y.id))
    expect(sortById(await live(b))).toEqual(sortById(await live(a)))
    expect((await b.tags.toArray()).map((t) => t.name)).toEqual(['trip'])

    const writes = sheet.writes
    expect(await runSync(a, sheet)).toMatchObject({ pulled: 0, pushed: 0 })
    expect(await runSync(b, sheet)).toMatchObject({ pulled: 0, pushed: 0 })
    expect(sheet.writes).toBe(writes)
  })

  it('carries edits and deletions between devices', async () => {
    const b = await device()
    await runSync(b, sheet)
    const lunch = (await byTitle(b, 'Lunch'))!
    await saveTransaction(b, { ...lunch, amount: 30_000 }, lunch.id)
    await deleteTransaction(b, (await byTitle(b, 'Top up'))!.id)
    await runSync(b, sheet)
    expect(sheet.tabs.Transactions).toHaveLength(2)

    expect(await runSync(a, sheet)).toMatchObject({ pulled: 2 })
    expect((await byTitle(a, 'Lunch'))?.amount).toBe(30_000)
    expect(await byTitle(a, 'Top up')).toBeUndefined()
  })

  it('applies hand edits made in the sheet', async () => {
    sheet.row('Lunch')[sheet.col('Transactions', 'Amount')] = 27_500
    sheet.tabs.Transactions = sheet.tabs.Transactions.filter((r) => r !== sheet.row('Salary'))
    // A row typed by hand: no id, a category that doesn't exist yet.
    sheet.tabs.Transactions.push([toSerial(Date.now()), 'expense', 15_000, 'cash', '', 'Snacks', 'Chips'])

    const result = await runSync(a, sheet)
    expect(result.warnings).toEqual([])
    expect((await byTitle(a, 'Lunch'))?.amount).toBe(27_500)
    expect(await byTitle(a, 'Salary')).toBeUndefined()

    const chips = (await byTitle(a, 'Chips'))!
    const snacks = (await a.categories.toArray()).find((c) => c.name === 'Snacks')
    expect(chips).toMatchObject({ accountId: ids.cash, categoryId: snacks?.id, source: 'sheet', type: 'EXPENSE' })
    // The new row got its id and the new category got a row.
    expect(sheet.row('Chips')[sheet.col('Transactions', 'ID')]).toBe(chips.id)
    expect(sheet.tabs.Categories.some((r) => r[0] === 'Snacks')).toBe(true)
  })

  it('keeps transactions linked when a category is renamed in the sheet', async () => {
    sheet.tabs.Categories.find((r) => r[0] === 'Food & Drinks')![0] = 'Food'
    await runSync(a, sheet)
    expect((await a.categories.get(ids.food))?.name).toBe('Food')
    expect((await byTitle(a, 'Lunch'))?.categoryId).toBe(ids.food)
    expect(sheet.row('Lunch')[sheet.col('Transactions', 'Category')]).toBe('Food')
    expect((await a.categories.toArray()).filter((c) => c.name === 'Food & Drinks')).toEqual([])
  })

  it('leaves unreadable rows in the sheet and reports them', async () => {
    sheet.row('Lunch')[sheet.col('Transactions', 'Amount')] = 'abc'
    const result = await runSync(a, sheet)
    expect(result.warnings).toEqual([expect.stringMatching(/^Transactions row \d: Amount is not a number$/)])
    expect(sheet.tabs.Transactions).toHaveLength(3)
    expect((await byTitle(a, 'Lunch'))?.amount).toBe(25_000)
  })

  it('lets the newer edit win when both sides changed', async () => {
    const lunch = (await byTitle(a, 'Lunch'))!
    const updated = sheet.col('Transactions', 'Updated')

    // A hand edit keeps the old Updated value, so the app's edit wins.
    sheet.row('Lunch')[sheet.col('Transactions', 'Description')] = 'from sheet'
    await saveTransaction(a, { ...lunch, description: 'from app' }, lunch.id)
    await runSync(a, sheet)
    expect(sheet.row('Lunch')[sheet.col('Transactions', 'Description')]).toBe('from app')

    // Another device's newer edit beats an older local one.
    await a.transactions.update(lunch.id, { description: 'older local', updatedAt: Date.now() })
    sheet.row('Lunch')[sheet.col('Transactions', 'Description')] = 'newer remote'
    sheet.row('Lunch')[updated] = Date.now() + 60_000
    await runSync(a, sheet)
    expect((await byTitle(a, 'Lunch'))?.description).toBe('newer remote')
  })
})
