import type { ClientContext } from './ClientContext'
import { getClientContext, unknownClientContext } from './ClientContext'

export interface LoginDetailRecord {
  identifier: string
  loggedInAt: number
  context: ClientContext
}

const STORAGE_KEY = 'hts_login_details_v1'
const MAX_RECORDS = 20

function readRecords(): LoginDetailRecord[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((entry): LoginDetailRecord[] => {
      if (typeof entry !== 'object' || entry === null || typeof entry.identifier !== 'string' || typeof entry.loggedInAt !== 'number') return []
      const context = typeof entry.context === 'object' && entry.context !== null ? entry.context as ClientContext : unknownClientContext
      return [{ identifier: entry.identifier, loggedInAt: entry.loggedInAt, context }]
    })
  } catch {
    return []
  }
}

/** Stores successful login metadata only. Passwords are never written here. */
export function recordLoginDetail(identifier: string): void {
  const cleanIdentifier = identifier.trim().toLowerCase()
  if (!cleanIdentifier) return
  const records = readRecords().filter(record => record.identifier !== cleanIdentifier)
  records.unshift({ identifier: cleanIdentifier, loggedInAt: Date.now(), context: getClientContext() })
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, MAX_RECORDS)))
  } catch {
    // Login still succeeds when browser storage is restricted.
  }
}

export function getLoginDetails(): LoginDetailRecord[] {
  return readRecords()
}

export function getLastLoginDetail(): LoginDetailRecord | null {
  return readRecords()[0] || null
}
