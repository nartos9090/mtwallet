import type { Id } from '@/core/model'

/**
 * The spreadsheet as the sync engine sees it. The Google implementation lives
 * in googleSheets.ts; tests use an in-memory one.
 */

export type Cell = string | number | boolean
export type SheetRow = Cell[]

/** Tabs whose rows are entities, in the order they are merged. */
export const ENTITY_TABS = ['Accounts', 'Categories', 'Transactions'] as const
export type TabName = (typeof ENTITY_TABS)[number]

export const HEADERS: Record<TabName, string[]> = {
  Accounts: ['Name', 'Color', 'Icon', 'Order', 'ID', 'Updated'],
  Categories: ['Name', 'Color', 'Icon', 'Order', 'ID', 'Updated'],
  Transactions: [
    'Date',
    'Type',
    'Amount',
    'Account',
    'To account',
    'Category',
    'Title',
    'Description',
    'Tags',
    'Status',
    'Source',
    'ID',
    'Updated',
  ],
}

/** The last two columns of every entity tab are ID and Updated. */
export const idColumn = (tab: TabName) => HEADERS[tab].length - 2
export const updatedColumn = (tab: TabName) => HEADERS[tab].length - 1

export interface RemoteSnapshot {
  /** Data rows below the header, as stored (numbers stay numbers). */
  tabs: Record<TabName, SheetRow[]>
  /** Key/value pairs from the Meta tab. */
  meta: Record<string, Cell>
}

export interface SheetWrite {
  /** Replaces all data rows of these tabs. */
  tabs: Partial<Record<TabName, SheetRow[]>>
  /** Replaces the Meta tab. */
  meta?: Record<string, Cell>
}

export interface SheetStore {
  read(): Promise<RemoteSnapshot>
  write(changes: SheetWrite): Promise<void>
}

/** What each row looked like after the last sync, per tab and id (as a row key). */
export type SyncBase = Record<TabName, Record<Id, string>>

export const emptyBase = (): SyncBase => ({ Accounts: {}, Categories: {}, Transactions: {} })

/** Comparable form of a row: padded to the tab's width, empty cells as ''. */
export function rowKey(row: SheetRow, width: number): string {
  return JSON.stringify(Array.from({ length: width }, (_, i) => row[i] ?? ''))
}
