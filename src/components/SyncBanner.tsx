import { CloudOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSyncStatus } from '@/hooks/useSync'
import { syncNow } from '@/sync/syncManager'

/** Shown on the main screens when syncing needs the user: an expired sign-in or an error. */
export function SyncBanner() {
  const status = useSyncStatus()
  if (status.phase !== 'needs-auth' && status.phase !== 'error') return null

  return (
    <div className="mx-4 mt-3 flex items-center gap-3 rounded-lg border bg-muted/50 p-3 text-sm">
      <CloudOff className="size-4 shrink-0 text-muted-foreground" />
      <p className="flex-1">{status.phase === 'needs-auth' ? 'Sign in to sync with Google Sheets' : "Sync didn't work"}</p>
      <Button size="sm" onClick={() => void syncNow({ interactive: true })}>
        {status.phase === 'needs-auth' ? 'Sign in' : 'Retry'}
      </Button>
    </div>
  )
}
