import { RefreshCw, Sheet } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
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
import { spreadsheetUrl } from '@/core/sync/googleSheets'
import { useSyncStatus, useTimeAgo } from '@/hooks/useSync'
import { cn } from '@/lib/utils'
import { prepareSignIn } from '@/sync/googleAuth'
import { connect, disconnect, syncNow } from '@/sync/syncManager'

/** Google Sheets section of Settings. */
export function SyncSettings() {
  const status = useSyncStatus()
  const syncedAgo = useTimeAgo(status.lastSyncedAt)
  const [connecting, setConnecting] = useState(false)

  // Get ready before the tap (Google's script, which sign-in mode), so the popup isn't blocked.
  useEffect(() => void prepareSignIn(), [])

  async function onConnect() {
    setConnecting(true)
    try {
      await connect()
      toast.success('Connected to Google Sheets')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setConnecting(false)
    }
  }

  if (status.phase === 'off') {
    return (
      <div className="flex flex-col gap-3 py-3">
        <p className="text-sm text-muted-foreground">
          Keep your data in a Google Sheet in your Drive: a backup you can open, edit and analyze, synced across your
          devices.
        </p>
        <Button onClick={() => void onConnect()} disabled={connecting}>
          {connecting ? 'Connecting…' : 'Connect Google account'}
        </Button>
      </div>
    )
  }

  const line =
    status.phase === 'syncing'
      ? 'Syncing…'
      : status.phase === 'needs-auth'
        ? (status.notice ?? 'Signed out from Google. Sign in to keep syncing.')
        : status.phase === 'error'
          ? status.error
          : syncedAgo
            ? `Synced ${syncedAgo}`
            : 'Not synced yet'

  return (
    <div className="flex flex-col gap-3 py-3">
      <div>
        <p>{status.email ?? 'Google account'}</p>
        <p className={cn('text-sm', status.phase === 'error' ? 'text-destructive' : 'text-muted-foreground')}>{line}</p>
        {status.phase === 'needs-auth' && status.error && <p className="text-sm text-destructive">{status.error}</p>}
      </div>

      {status.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <p className="font-medium">Some rows in the sheet couldn't be read. Fix them there:</p>
          <ul className="mt-1 list-disc pl-5">
            {status.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant={status.phase === 'needs-auth' ? 'default' : 'outline'}
          disabled={status.phase === 'syncing'}
          onClick={() => void syncNow({ interactive: true })}
        >
          <RefreshCw className={cn(status.phase === 'syncing' && 'animate-spin')} />
          {status.phase === 'needs-auth' ? 'Sign in' : 'Sync now'}
        </Button>
        {status.spreadsheetId && (
          <Button variant="outline" asChild>
            <a href={spreadsheetUrl(status.spreadsheetId)} target="_blank" rel="noreferrer">
              <Sheet />
              Open sheet
            </a>
          </Button>
        )}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="ml-auto">
              Disconnect
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Disconnect Google Sheets?</AlertDialogTitle>
              <AlertDialogDescription>
                This device stops syncing. Your data stays here and in the sheet, which you can connect again later.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void disconnect()}>Disconnect</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
