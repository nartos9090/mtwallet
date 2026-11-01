import {
  type Cell,
  ENTITY_TABS,
  HEADERS,
  idColumn,
  type RemoteSnapshot,
  type SheetStore,
  type SheetWrite,
  type TabName,
} from '@/core/sync/sheet'

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets'
const DRIVE = 'https://www.googleapis.com/drive/v3/files'
/** Marks the spreadsheet as ours, so another device finds it (drive.file only sees files this app created). */
const APP_PROPERTIES = { walletApp: '1' }
const META_TAB = 'Meta'

export class GoogleApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function api<T>(token: string, url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new GoogleApiError(body?.error?.message ?? `Google API error ${response.status}`, response.status)
  }
  return (await response.json()) as T
}

const batchUpdate = (token: string, spreadsheetId: string, requests: object[]) =>
  api(token, `${SHEETS}/${spreadsheetId}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests }) })

export async function findWalletSpreadsheet(token: string): Promise<string | undefined> {
  const q = "appProperties has { key='walletApp' and value='1' } and trashed = false"
  const params = new URLSearchParams({ q, fields: 'files(id)', orderBy: 'modifiedTime desc', pageSize: '1' })
  const result = await api<{ files: { id: string }[] }>(token, `${DRIVE}?${params}`)
  return result.files[0]?.id
}

export const spreadsheetUrl = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/edit`

/** Requests that set up a tab: header row, frozen; ID and Updated hidden and edit-warned. */
function tabSetup(tab: TabName, sheetId: number): object[] {
  const width = HEADERS[tab].length
  const systemColumns = { sheetId, startIndex: idColumn(tab), endIndex: width }
  return [
    {
      updateCells: {
        start: { sheetId, rowIndex: 0, columnIndex: 0 },
        rows: [
          {
            values: HEADERS[tab].map((h) => ({
              userEnteredValue: { stringValue: h },
              userEnteredFormat: { textFormat: { bold: true } },
            })),
          },
        ],
        fields: 'userEnteredValue,userEnteredFormat.textFormat.bold',
      },
    },
    {
      updateDimensionProperties: {
        range: { ...systemColumns, dimension: 'COLUMNS' },
        properties: { hiddenByUser: true },
        fields: 'hiddenByUser',
      },
    },
    {
      addProtectedRange: {
        protectedRange: {
          range: { sheetId, startColumnIndex: systemColumns.startIndex, endColumnIndex: width },
          description: 'Used by the Wallet app to match rows. Leave these as they are.',
          warningOnly: true,
        },
      },
    },
  ]
}

const addTab = (title: string, sheetId: number) => ({
  addSheet: { properties: { sheetId, title, gridProperties: { frozenRowCount: title === META_TAB ? 0 : 1 } } },
})

/** Creates the Wallet spreadsheet with its tabs. Data is written by the first sync. */
export async function createWalletSpreadsheet(token: string, timeZone: string): Promise<string> {
  const { id } = await api<{ id: string }>(token, `${DRIVE}?fields=id`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Wallet',
      mimeType: 'application/vnd.google-apps.spreadsheet',
      appProperties: APP_PROPERTIES,
    }),
  })
  // A new spreadsheet has one tab with sheetId 0: it becomes Transactions.
  const sheetIds: Record<TabName, number> = { Transactions: 0, Accounts: 1, Categories: 2 }
  await batchUpdate(token, id, [
    { updateSpreadsheetProperties: { properties: { timeZone }, fields: 'timeZone' } },
    {
      updateSheetProperties: {
        properties: { sheetId: 0, title: 'Transactions', gridProperties: { frozenRowCount: 1 } },
        fields: 'title,gridProperties.frozenRowCount',
      },
    },
    addTab('Accounts', sheetIds.Accounts),
    addTab('Categories', sheetIds.Categories),
    addTab(META_TAB, 3),
    ...ENTITY_TABS.flatMap((tab) => tabSetup(tab, sheetIds[tab])),
  ])
  return id
}

interface SheetInfo {
  sheetId: number
  rowCount: number
}

/** Number formats for Transactions cells; whole amounts without decimals. */
function numberFormat(tab: TabName, column: number, value: Cell) {
  if (tab !== 'Transactions') return undefined
  if (column === 0) return { type: 'DATE_TIME', pattern: 'yyyy-mm-dd hh:mm' }
  if (column === 2 && typeof value === 'number') {
    return { type: 'NUMBER', pattern: Number.isInteger(value) ? '#,##0' : '#,##0.00' }
  }
}

function cellData(value: Cell, format?: object) {
  const userEnteredFormat = format ? { numberFormat: format } : undefined
  if (value === '') return { userEnteredFormat }
  const userEnteredValue =
    typeof value === 'number' ? { numberValue: value } : typeof value === 'boolean' ? { boolValue: value } : { stringValue: value }
  return { userEnteredValue, userEnteredFormat }
}

/** Dropdowns for hand edits; not strict, so the app can still report bad values. */
function transactionValidation(sheetId: number): object[] {
  const column = (index: number) => ({ sheetId, startRowIndex: 1, startColumnIndex: index, endColumnIndex: index + 1 })
  const rule = (condition: object) => ({ condition, strict: false, showCustomUi: true })
  const oneOfRange = (range: string) => rule({ type: 'ONE_OF_RANGE', values: [{ userEnteredValue: `=${range}` }] })
  return [
    { setDataValidation: { range: column(1), rule: rule({ type: 'ONE_OF_LIST', values: ['Expense', 'Income', 'Transfer'].map((v) => ({ userEnteredValue: v })) }) } },
    { setDataValidation: { range: column(3), rule: oneOfRange('Accounts!A2:A') } },
    { setDataValidation: { range: column(4), rule: oneOfRange('Accounts!A2:A') } },
    { setDataValidation: { range: column(5), rule: oneOfRange('Categories!A2:A') } },
  ]
}

/** The Wallet spreadsheet in the user's Drive. */
export class GoogleSheetStore implements SheetStore {
  private readonly token: string
  private readonly spreadsheetId: string
  private sheets = new Map<string, SheetInfo>()

  constructor(token: string, spreadsheetId: string) {
    this.token = token
    this.spreadsheetId = spreadsheetId
  }

  async read(): Promise<RemoteSnapshot> {
    await this.loadSheets()
    const params = new URLSearchParams({ valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER' })
    for (const tab of ENTITY_TABS) params.append('ranges', `${tab}!A2:${columnLetter(HEADERS[tab].length)}`)
    params.append('ranges', `${META_TAB}!A1:B`)
    const { valueRanges } = await api<{ valueRanges: { values?: Cell[][] }[] }>(
      this.token,
      `${SHEETS}/${this.spreadsheetId}/values:batchGet?${params}`,
    )
    const tabs = Object.fromEntries(ENTITY_TABS.map((tab, i) => [tab, valueRanges[i].values ?? []])) as RemoteSnapshot['tabs']
    const meta = Object.fromEntries((valueRanges[ENTITY_TABS.length].values ?? []).map(([key, value]) => [String(key), value]))
    return { tabs, meta }
  }

  async write(changes: SheetWrite): Promise<void> {
    const requests: object[] = []
    for (const tab of ENTITY_TABS) {
      const rows = changes.tabs[tab]
      if (!rows) continue
      const { sheetId, rowCount } = this.sheets.get(tab)!
      const needed = rows.length + 1
      if (rowCount < needed) {
        requests.push({
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { rowCount: needed + 100 } },
            fields: 'gridProperties.rowCount',
          },
        })
      }
      // Rows not covered by `rows` are cleared, so this replaces the whole tab below the header.
      requests.push({
        updateCells: {
          range: { sheetId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: HEADERS[tab].length },
          rows: rows.map((row) => ({
            values: HEADERS[tab].map((_, i) => cellData(row[i] ?? '', numberFormat(tab, i, row[i] ?? ''))),
          })),
          fields: 'userEnteredValue,userEnteredFormat.numberFormat',
        },
      })
      if (tab === 'Transactions') requests.push(...transactionValidation(sheetId))
    }
    if (changes.meta) {
      requests.push({
        updateCells: {
          range: { sheetId: this.sheets.get(META_TAB)!.sheetId, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: 2 },
          rows: Object.entries(changes.meta).map(([key, value]) => ({ values: [cellData(key), cellData(value)] })),
          fields: 'userEnteredValue',
        },
      })
    }
    if (requests.length > 0) await batchUpdate(this.token, this.spreadsheetId, requests)
  }

  /** Reads tab ids and sizes, recreating any tab the user deleted. */
  private async loadSheets() {
    type Properties = { sheetId: number; title: string; gridProperties: { rowCount: number } }
    const { sheets } = await api<{ sheets: { properties: Properties }[] }>(
      this.token,
      `${SHEETS}/${this.spreadsheetId}?fields=sheets.properties(sheetId,title,gridProperties.rowCount)`,
    )
    this.sheets = new Map(sheets.map(({ properties: p }) => [p.title, { sheetId: p.sheetId, rowCount: p.gridProperties.rowCount }]))

    const missing = [...ENTITY_TABS, META_TAB].filter((title) => !this.sheets.has(title))
    if (missing.length === 0) return
    let nextId = Math.max(...[...this.sheets.values()].map((s) => s.sheetId)) + 1
    const requests: object[] = []
    for (const title of missing) {
      const sheetId = nextId++
      requests.push(addTab(title, sheetId))
      if (title !== META_TAB) requests.push(...tabSetup(title as TabName, sheetId))
      this.sheets.set(title, { sheetId, rowCount: 1000 })
    }
    await batchUpdate(this.token, this.spreadsheetId, requests)
  }
}

/** 1 -> A, 13 -> M. Our tabs stay well under 26 columns. */
const columnLetter = (n: number) => String.fromCharCode(64 + n)
