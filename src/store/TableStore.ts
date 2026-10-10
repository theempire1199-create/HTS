import { ACTIVITY_LOG_KEY, TABLE_COUNT, TABLES_STATE_KEY } from '../utils/constants'

export type TableStatus = 'empty' | 'active' | 'bill'
export type SpiceLevel = 'mild' | 'medium' | 'hot' | null
export type DietPref = 'jain' | 'non-jain' | null

export interface TableItem {
  id: number
  name: string
  qty: number
  price: number
}

export interface TableNote {
  id: number
  kind: 'allergen' | 'complaint'
  text: string
  at: number
}

export interface TableState {
  no: number
  status: TableStatus
  pax: number
  mobile: string
  email: string
  items: TableItem[]
  diet: DietPref
  spice: SpiceLevel
  notes: TableNote[]
  openedAt: number
}

export interface BillRecord {
  id: number
  table: number
  pax: number
  mobile: string
  email: string
  items: TableItem[]
  diet: DietPref
  spice: SpiceLevel
  notes: TableNote[]
  total: number
  openedAt: number
  closedAt: number
}

function emptyTable(no: number): TableState {
  return { no, status: 'empty', pax: 0, mobile: '', email: '', items: [], diet: null, spice: null, notes: [], openedAt: 0 }
}

function loadTables(): TableState[] {
  const fallback = Array.from({ length: TABLE_COUNT }, (_, i) => emptyTable(i + 1))
  try {
    const raw = localStorage.getItem(TABLES_STATE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<TableState>[]
    if (!Array.isArray(parsed)) return fallback
    return fallback.map((base, i) => ({ ...base, ...(parsed[i] ?? {}), no: i + 1 }))
  } catch {
    return fallback
  }
}

function loadActivity(): BillRecord[] {
  try {
    const raw = localStorage.getItem(ACTIVITY_LOG_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as BillRecord[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Single source of truth for tables + bill activity. Screens subscribe. */
export class TableStore {
  private tables: TableState[] = loadTables()
  private activity: BillRecord[] = loadActivity()
  private listeners = new Set<() => void>()
  private seq = Date.now()

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  list(): TableState[] {
    return this.tables
  }

  get(no: number): TableState {
    return this.tables[no - 1] ?? emptyTable(no)
  }

  activityList(): BillRecord[] {
    return [...this.activity].reverse()
  }

  occupy(no: number, info: { pax: number; mobile: string; email: string }): void {
    const table = this.get(no)
    table.status = 'active'
    table.pax = info.pax
    table.mobile = info.mobile
    table.email = info.email
    table.openedAt = Date.now()
    this.emit()
  }

  updateInfo(no: number, info: { pax: number; mobile: string; email: string }): void {
    const table = this.get(no)
    table.pax = info.pax
    table.mobile = info.mobile
    table.email = info.email
    this.emit()
  }

  addItem(no: number, item: { name: string; qty: number; price: number }): void {
    const table = this.get(no)
    this.seq += 1
    table.items.push({ id: this.seq, ...item })
    this.emit()
  }

  removeItem(no: number, id: number): void {
    const table = this.get(no)
    table.items = table.items.filter(item => item.id !== id)
    this.emit()
  }

  setDiet(no: number, diet: DietPref): void {
    this.get(no).diet = diet
    this.emit()
  }

  setSpice(no: number, spice: SpiceLevel): void {
    this.get(no).spice = spice
    this.emit()
  }

  addNote(no: number, kind: TableNote['kind'], text: string): void {
    const table = this.get(no)
    this.seq += 1
    table.notes.push({ id: this.seq, kind, text, at: Date.now() })
    this.emit()
  }

  markBill(no: number): void {
    this.get(no).status = 'bill'
    this.emit()
  }

  backToActive(no: number): void {
    const table = this.get(no)
    if (table.status === 'bill') table.status = 'active'
    this.emit()
  }

  totalOf(table: TableState): number {
    return table.items.reduce((sum, item) => sum + item.qty * item.price, 0)
  }

  /** Final bill → activity log, table khali. Returns the saved record. */
  checkout(no: number): BillRecord | null {
    const table = this.get(no)
    if (table.status === 'empty') return null
    const record: BillRecord = {
      id: Date.now(),
      table: table.no,
      pax: table.pax,
      mobile: table.mobile,
      email: table.email,
      items: [...table.items],
      diet: table.diet,
      spice: table.spice,
      notes: [...table.notes],
      total: this.totalOf(table),
      openedAt: table.openedAt,
      closedAt: Date.now(),
    }
    this.activity.push(record)
    this.tables[no - 1] = emptyTable(no)
    this.emit()
    return record
  }

  private emit(): void {
    try {
      localStorage.setItem(TABLES_STATE_KEY, JSON.stringify(this.tables))
      localStorage.setItem(ACTIVITY_LOG_KEY, JSON.stringify(this.activity.slice(-200)))
    } catch {
      // Best-effort persist; in-memory state still works.
    }
    this.listeners.forEach(listener => listener())
  }
}

export const tableStore = new TableStore()
