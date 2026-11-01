import type { Id, Syncable } from '@/core/model'
import type { Codec } from '@/core/sync/codecs'
import { type SheetRow, rowKey } from '@/core/sync/sheet'

export interface TabMergeInput<T extends Syncable> {
  codec: Codec<T>
  width: number
  idColumn: number
  updatedColumn: number
  /** All local entities, tombstones included. */
  local: T[]
  remote: SheetRow[]
  base: Record<Id, string>
  sort: (a: T, b: T) => number
  newId: () => string
  now: number
  /** Prefix for warnings, e.g. "Transactions". */
  label: string
}

export interface TabMergeResult<T extends Syncable> {
  /** Entities to write locally (remote edits, remote deletions as tombstones). */
  upserts: T[]
  /** Live entities after the merge. */
  final: Map<Id, T>
  /** The tab's full content after the merge. */
  rows: SheetRow[]
  /** Whether `rows` differs from what the sheet has now. */
  dirty: boolean
  base: Record<Id, string>
  warnings: string[]
  pulled: number
  pushed: number
}

/**
 * Three-way merge of one tab. For each id, compares the local entity and the
 * sheet row with how the row looked after the last sync (`base`):
 * - only one side changed: that side wins (deletions included);
 * - both changed differently: the newer `updatedAt` wins. A hand edit in the
 *   sheet keeps its old Updated value, so the app's own edit wins over it.
 * Rows typed into the sheet without an id get one. Rows that can't be read are
 * left in the sheet untouched and reported in `warnings`.
 */
export function mergeTab<T extends Syncable>(input: TabMergeInput<T>): TabMergeResult<T> {
  const { codec, width, idColumn, updatedColumn, base, now, label } = input
  const key = (row: SheetRow) => rowKey(row, width)
  const result: TabMergeResult<T> = {
    upserts: [],
    final: new Map(),
    rows: [],
    dirty: false,
    base: {},
    warnings: [],
    pulled: 0,
    pushed: 0,
  }
  const invalidRows: SheetRow[] = []

  const local = new Map(input.local.map((e) => [e.id, e]))
  const remote = new Map<Id, { row: SheetRow; line: number }>()
  const newRows: { row: SheetRow; line: number }[] = []
  input.remote.forEach((row, i) => {
    const line = i + 2 // 1-based, below the header
    if (row.every((cell) => String(cell).trim() === '')) return
    const id = String(row[idColumn] ?? '').trim()
    if (!id) newRows.push({ row, line })
    else if (remote.has(id)) result.warnings.push(`${label} row ${line}: duplicate ID, row ignored`)
    else remote.set(id, { row, line })
  })
  // Duplicates and blank lines disappear when the tab is rewritten.
  if (remote.size + newRows.length !== input.remote.length) result.dirty = true

  /** Parses a sheet row; on failure keeps it as is and reports it. */
  function parse(row: SheetRow, line: number, id: Id): T | undefined {
    try {
      return codec.fromRow(row, id)
    } catch (e) {
      result.warnings.push(`${label} row ${line}: ${e instanceof Error ? e.message : String(e)}`)
      invalidRows.push(row)
      return undefined
    }
  }

  function keep(entity: T) {
    const row = codec.toRow(entity)
    result.final.set(entity.id, entity)
    result.base[entity.id] = key(row)
  }

  function applyRemote(entity: T, localEntity: T | undefined) {
    keep(entity)
    if (!localEntity || localEntity.deleted || key(codec.toRow(localEntity)) !== result.base[entity.id]) {
      result.upserts.push(entity)
      result.pulled++
    }
  }

  const ids = new Set([...local.keys(), ...remote.keys(), ...Object.keys(base)])
  for (const id of ids) {
    const l = local.get(id)
    const r = remote.get(id)
    const localKey = l && !l.deleted ? key(codec.toRow(l)) : null
    const remoteKey = r ? key(r.row) : null
    const baseKey = base[id] ?? null
    const localChanged = localKey !== baseKey
    const remoteChanged = remoteKey !== baseKey

    if (!remoteChanged || localKey === remoteKey) {
      // Unchanged in the sheet (or both sides agree): the local state stands.
      if (l && !l.deleted) keep(l)
      if (localChanged) result.pushed++
      continue
    }

    if (!localChanged || wins(r, l)) {
      // Take the sheet's version.
      if (!r) {
        if (l && !l.deleted) {
          result.upserts.push({ ...l, deleted: true, updatedAt: now })
          result.pulled++
        }
        continue
      }
      const entity = parse(r.row, r.line, id)
      if (entity) applyRemote(entity, l)
      else if (baseKey !== null) result.base[id] = baseKey // keep tracking until the row is fixed
      continue
    }

    // Both changed and the local edit is newer.
    if (l && !l.deleted) keep(l)
    result.pushed++
  }

  function wins(r: { row: SheetRow } | undefined, l: T | undefined) {
    if (!r) return false // a local edit beats a deletion in the sheet
    if (!l || l.deleted) return typeof r.row[updatedColumn] === 'number' && r.row[updatedColumn] > (l?.updatedAt ?? 0)
    return typeof r.row[updatedColumn] === 'number' && r.row[updatedColumn] > l.updatedAt
  }

  for (const { row, line } of newRows) {
    const entity = parse(row, line, input.newId())
    if (entity) applyRemote(entity, undefined)
  }

  const sorted = [...result.final.values()].sort(input.sort)
  result.rows = [...sorted.map((e) => codec.toRow(e)), ...invalidRows]
  if (!result.dirty) {
    result.dirty =
      result.rows.length !== input.remote.length || result.rows.some((row, i) => key(row) !== key(input.remote[i]))
  }
  return result
}

/** Adds an entity created during the merge (e.g. a category named in a hand-typed row). */
export function addToTab<T extends Syncable>(result: TabMergeResult<T>, entity: T, row: SheetRow, width: number) {
  result.upserts.push(entity)
  result.final.set(entity.id, entity)
  result.base[entity.id] = rowKey(row, width)
  result.rows.push(row)
  result.dirty = true
}
