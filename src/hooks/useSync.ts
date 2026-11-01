import { useEffect, useState, useSyncExternalStore } from 'react'
import { getSyncStatus, subscribeSyncStatus } from '@/sync/syncManager'

export function useSyncStatus() {
  return useSyncExternalStore(subscribeSyncStatus, getSyncStatus)
}

/** "2 minutes ago", refreshed every 30 seconds. */
export function useTimeAgo(ms: number | undefined): string | undefined {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  if (ms === undefined) return undefined
  const seconds = Math.round((ms - Math.max(now, ms)) / 1000)
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  if (seconds > -60) return format.format(0, 'second')
  if (seconds > -3600) return format.format(Math.round(seconds / 60), 'minute')
  if (seconds > -86_400) return format.format(Math.round(seconds / 3600), 'hour')
  return format.format(Math.round(seconds / 86_400), 'day')
}
