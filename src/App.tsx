import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { accountBalances } from '@/core/balances'
import { db } from '@/core/db'
import { importIvyBackup } from '@/core/ivy/importIvyBackup'

function App() {
  const fileInput = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<string>()

  const data = useLiveQuery(async () => {
    const [settings, accounts, transactions] = await Promise.all([
      db.getSettings(),
      db.accounts.orderBy('id').filter((a) => !a.deleted).toArray(),
      db.transactions.toArray(),
    ])
    accounts.sort((a, b) => a.orderNum - b.orderNum)
    return { settings, accounts, transactions, balances: accountBalances(transactions) }
  })

  async function onFile(file: File) {
    try {
      const result = importIvyBackup(new Uint8Array(await file.arrayBuffer()))
      await db.replaceWithIvyImport(result)
      setMessage([`Imported ${result.transactions.length} transactions.`, ...result.warnings].join('\n'))
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    }
  }

  const money = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: data?.settings?.currency ?? 'IDR',
    maximumFractionDigits: 0,
  })

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-4">
      <h1 className="text-2xl font-semibold">Wallet</h1>

      <input
        ref={fileInput}
        type="file"
        accept=".json,.zip,application/json,application/zip"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void onFile(file)
          e.target.value = ''
        }}
      />
      <Button onClick={() => fileInput.current?.click()}>Import Ivy Wallet backup</Button>
      {message && <p className="text-sm whitespace-pre-line text-muted-foreground">{message}</p>}

      {data && data.accounts.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-medium">Accounts · {data.transactions.length} transactions</h2>
          {data.accounts.map((a) => (
            <div key={a.id} className="flex items-center gap-3 rounded-lg border p-3">
              <span className="size-3 rounded-full" style={{ background: a.color }} />
              <span className="flex-1">{a.name}</span>
              <span className="tabular-nums">{money.format(data.balances.get(a.id) ?? 0)}</span>
            </div>
          ))}
        </section>
      )}
    </main>
  )
}

export default App
