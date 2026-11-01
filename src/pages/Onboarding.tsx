import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { db } from '@/core/db'
import { startFresh } from '@/core/repo'
import { useIvyImport } from '@/hooks/useIvyImport'
import { loadGoogle } from '@/sync/googleAuth'
import { restore } from '@/sync/syncManager'

export function Onboarding() {
  const [currency, setCurrency] = useState('IDR')
  const ivyImport = useIvyImport()
  const [restoring, setRestoring] = useState(false)

  // Load Google's script before the tap, so the sign-in popup isn't blocked.
  useEffect(() => void loadGoogle().catch(() => {}), [])

  async function onRestore() {
    setRestoring(true)
    try {
      // On success the settings come from the sheet and the app leaves onboarding.
      if ((await restore()) === 'not-found') toast.error('No Wallet sheet found in this Google account')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setRestoring(false)
    }
  }

  const currencies = useMemo(() => {
    const names = new Intl.DisplayNames(undefined, { type: 'currency' })
    return Intl.supportedValuesOf('currency').map((code) => ({ code, name: names.of(code) ?? code }))
  }, [])

  return (
    <div className="flex min-h-dvh flex-col justify-center gap-8 p-6">
      <div>
        <h1 className="text-3xl font-semibold">Wallet</h1>
        <p className="mt-2 text-muted-foreground">Track income, expenses and transfers. Synced to your Google Sheet.</p>
      </div>

      <section className="flex flex-col gap-3 rounded-xl border p-4">
        <h2 className="font-medium">Start fresh</h2>
        <div className="flex flex-col gap-1.5">
          <Label>Currency</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currencies.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.code} · {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">All accounts use this currency. It can't be changed later.</p>
        </div>
        <Button onClick={() => startFresh(db, currency).catch((e) => toast.error(String(e)))}>Start</Button>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border p-4">
        <h2 className="font-medium">Coming from Ivy Wallet?</h2>
        <p className="text-sm text-muted-foreground">
          Import your backup (.json or .zip). Accounts, categories and transactions come along, with the currency set in
          Ivy.
        </p>
        {ivyImport.input}
        <Button variant="outline" onClick={ivyImport.open}>
          Import Ivy Wallet backup
        </Button>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border p-4">
        <h2 className="font-medium">Already using Wallet on another device?</h2>
        <p className="text-sm text-muted-foreground">Sign in with Google to restore your data from your Wallet sheet.</p>
        <Button variant="outline" onClick={() => void onRestore()} disabled={restoring}>
          {restoring ? 'Restoring…' : 'Restore from Google Sheets'}
        </Button>
      </section>
    </div>
  )
}
