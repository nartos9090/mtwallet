import { useRef } from 'react'
import { toast } from 'sonner'
import { db } from '@/core/db'
import { importIvyBackup } from '@/core/ivy/importIvyBackup'

/** A hidden file input plus a function to open it. Importing replaces all local data. */
export function useIvyImport() {
  const ref = useRef<HTMLInputElement>(null)

  async function onFile(file: File) {
    try {
      const result = importIvyBackup(new Uint8Array(await file.arrayBuffer()))
      await db.replaceWithIvyImport(result)
      toast.success(`Imported ${result.transactions.length} transactions`, {
        description: result.warnings.join('\n') || undefined,
      })
    } catch (e) {
      toast.error('Import failed', { description: e instanceof Error ? e.message : String(e) })
    }
  }

  const input = (
    <input
      ref={ref}
      type="file"
      accept=".json,.zip,application/json,application/zip"
      hidden
      onChange={(e) => {
        const file = e.target.files?.[0]
        if (file) void onFile(file)
        e.target.value = ''
      }}
    />
  )
  return { input, open: () => ref.current?.click() }
}
