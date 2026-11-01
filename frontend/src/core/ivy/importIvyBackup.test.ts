import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { accountBalances } from '@/core/balances'
import { androidColorToHex, decodeIvyBytes, importIvyBackup } from '@/core/ivy/importIvyBackup'

function utf16be(text: string): Uint8Array {
  const bytes = new Uint8Array(2 + text.length * 2)
  bytes.set([0xfe, 0xff])
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    bytes[2 + i * 2] = code >> 8
    bytes[3 + i * 2] = code & 0xff
  }
  return bytes
}

const sample = {
  accounts: [
    { id: 'a1', name: 'Cash', currency: 'IDR', color: -3351041, icon: 'cash' },
    { id: 'a2', name: 'Bank', currency: 'IDR', color: -4557, orderNum: 2.0 },
    { id: 'a3', name: 'Old', currency: 'IDR', color: 0, isDeleted: true },
  ],
  categories: [{ id: 'c1', name: 'Food & Drinks', color: -15414114, icon: 'fooddrink' }],
  transactions: [
    { id: 't1', accountId: 'a1', type: 'INCOME', amount: 1000, dateTime: 1, categoryId: 'c1', title: ' Salary ' },
    { id: 't2', accountId: 'a1', type: 'EXPENSE', amount: 300, toAmount: 300, dateTime: 2, categoryId: 'gone' },
    { id: 't3', accountId: 'a1', type: 'TRANSFER', amount: 200, toAccountId: 'a2', dateTime: 3, categoryId: 'c1' },
    { id: 't4', accountId: 'a1', type: 'EXPENSE', amount: 50, dueDate: 4 },
    { id: 't5', accountId: 'a1', type: 'EXPENSE', amount: 99, dateTime: 5, isDeleted: true },
    { id: 't6', accountId: 'a2', type: 'TRANSFER', amount: 70, toAccountId: 'a3', dateTime: 6 },
  ],
  plannedPaymentRules: [{ id: 'p1' }],
  settings: [{ currency: 'IDR' }],
  sharedPrefs: { lock_app: 'false' },
}

describe('decodeIvyBytes', () => {
  it('decodes UTF-16 BE with BOM, UTF-8, and zipped backups', () => {
    const text = '{"name":"Rp ✓"}'
    expect(decodeIvyBytes(utf16be(text))).toBe(text)
    expect(decodeIvyBytes(new TextEncoder().encode(text))).toBe(text)
    expect(decodeIvyBytes(zipSync({ 'data.json': utf16be(text) }))).toBe(text)
  })
})

describe('androidColorToHex', () => {
  it('converts negative ARGB ints', () => {
    expect(androidColorToHex(-15414114)).toBe('#14cc9e')
    expect(androidColorToHex(-4557)).toBe('#ffee33')
  })
})

describe('importIvyBackup', () => {
  const result = importIvyBackup(utf16be(JSON.stringify(sample)), 42)

  it('maps accounts and categories, skipping deleted ones', () => {
    expect(result.settings.currency).toBe('IDR')
    expect(result.accounts.map((a) => a.name)).toEqual(['Cash', 'Bank'])
    expect(result.accounts[0]).toMatchObject({ color: '#ccddff', orderNum: 0, updatedAt: 42, deleted: false })
    expect(result.categories[0].color).toBe('#14cc9e')
  })

  it('maps transactions and keeps transfer categories', () => {
    expect(result.transactions.map((t) => t.id)).toEqual(['t1', 't2', 't3'])
    expect(result.transactions[0]).toMatchObject({ title: 'Salary', source: 'ivy-import', status: 'confirmed' })
    expect(result.transactions[1].categoryId).toBeUndefined()
    expect(result.transactions[2]).toMatchObject({ toAccountId: 'a2', categoryId: 'c1' })
  })

  it('leaves out transfers to a deleted account, like Ivy', () => {
    expect(result.extras.orphanedTransactions).toMatchObject([{ id: 't6' }])
  })

  it('keeps planned data and Ivy prefs as extras', () => {
    expect(result.extras.plannedPaymentRules).toHaveLength(1)
    expect(result.extras.plannedTransactions).toHaveLength(1)
    expect(result.extras.sharedPrefs).toEqual({ lock_app: 'false' })
    expect(result.warnings).toHaveLength(2)
  })

  it('computes balances including transfers', () => {
    const balances = accountBalances(result.transactions)
    expect(balances.get('a1')).toBe(1000 - 300 - 200)
    expect(balances.get('a2')).toBe(200)
  })

  it('rejects files that are not Ivy backups', () => {
    expect(() => importIvyBackup(new TextEncoder().encode('{"foo":1}'))).toThrow(/not an Ivy Wallet backup/)
    expect(() => importIvyBackup(new TextEncoder().encode('not json'))).toThrow(/not a valid/)
  })
})

// A real backup holds real financial data, so it lives in the gitignored private/
// folder (or IVY_BACKUP points to it). Skipped when absent.
const privateDir = path.resolve(import.meta.dirname, '../../../private')
const realBackup =
  process.env.IVY_BACKUP ??
  (existsSync(privateDir)
    ? readdirSync(privateDir)
        .filter((f) => /\.(json|zip)$/.test(f))
        .map((f) => path.join(privateDir, f))[0]
    : undefined)

describe.runIf(realBackup)('real Ivy backup', () => {
  it('imports without losing transactions', () => {
    const result = importIvyBackup(readFileSync(realBackup!))
    const raw = JSON.parse(decodeIvyBytes(readFileSync(realBackup!)))
    const { plannedTransactions, orphanedTransactions } = result.extras
    expect(result.transactions.length + plannedTransactions.length + orphanedTransactions.length).toBe(
      raw.transactions.filter((t: { isDeleted?: boolean }) => !t.isDeleted).length,
    )

    // Balances as shown by the Ivy app for this backup.
    const balances = accountBalances(result.transactions)
    expect(Object.fromEntries(result.accounts.map((a) => [a.name, balances.get(a.id) ?? 0]))).toEqual({
      Cash: 71_500,
      MANDIRI: 26_404_051,
      GOPAY: 1_120_888,
      'L3 Cache': 0,
      Jago: 350_754,
    })
  })
})
