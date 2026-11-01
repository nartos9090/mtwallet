import Dexie, { type EntityTable } from 'dexie'
import type { IvyImportResult } from '@/core/ivy/importIvyBackup'
import type { Account, Category, IvyExtras, Settings, Tag, Transaction } from '@/core/model'
import type { SyncState } from '@/core/sync/sync'

/** Key-value records that aren't lists of entities. */
export interface MetaRecord {
  key: 'settings' | 'ivyExtras' | 'sync'
  value: Settings | IvyExtras | SyncState
}

export class WalletDb extends Dexie {
  accounts!: EntityTable<Account, 'id'>
  categories!: EntityTable<Category, 'id'>
  tags!: EntityTable<Tag, 'id'>
  transactions!: EntityTable<Transaction, 'id'>
  meta!: EntityTable<MetaRecord, 'key'>

  constructor(name = 'wallet') {
    super(name)
    this.version(1).stores({
      accounts: 'id, updatedAt',
      categories: 'id, updatedAt',
      tags: 'id, updatedAt',
      transactions: 'id, date, accountId, toAccountId, categoryId, *tagIds, status, updatedAt',
      meta: 'key',
    })
  }

  async getSettings(): Promise<Settings | undefined> {
    return (await this.meta.get('settings'))?.value as Settings | undefined
  }

  async getSyncState(): Promise<SyncState | undefined> {
    return (await this.meta.get('sync'))?.value as SyncState | undefined
  }

  /** `undefined` disconnects. */
  async setSyncState(state: SyncState | undefined): Promise<void> {
    if (state) await this.meta.put({ key: 'sync', value: state })
    else await this.meta.delete('sync')
  }

  /** Replaces all local data with an Ivy import, atomically. */
  async replaceWithIvyImport(data: IvyImportResult): Promise<void> {
    await this.transaction('rw', [this.accounts, this.categories, this.tags, this.transactions, this.meta], async () => {
      await Promise.all([this.accounts.clear(), this.categories.clear(), this.tags.clear(), this.transactions.clear()])
      await this.accounts.bulkAdd(data.accounts)
      await this.categories.bulkAdd(data.categories)
      await this.tags.bulkAdd(data.tags)
      await this.transactions.bulkAdd(data.transactions)
      await this.meta.bulkPut([
        { key: 'settings', value: data.settings },
        { key: 'ivyExtras', value: data.extras },
      ])
    })
  }
}

export const db = new WalletDb()
