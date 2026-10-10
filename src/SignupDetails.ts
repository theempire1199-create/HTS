import type { ClientContext } from './ClientContext'
import { getClientContext, unknownClientContext } from './ClientContext'

export interface SignupDetailRecord {
  name: string
  contact: string
  email: string
  signedUpAt: number
  context: ClientContext
}

const STORAGE_KEY = 'hts_signup_details_v1'

function readRecords(): SignupDetailRecord[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    const values = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' ? [parsed] : []
    return values.flatMap((entry): SignupDetailRecord[] => {
      if (typeof entry !== 'object' || entry === null || typeof entry.name !== 'string' || typeof entry.contact !== 'string' || typeof entry.email !== 'string' || typeof entry.signedUpAt !== 'number') return []
      const context = typeof entry.context === 'object' && entry.context !== null ? entry.context as ClientContext : unknownClientContext
      return [{ name: entry.name, contact: entry.contact, email: entry.email, signedUpAt: entry.signedUpAt, context }]
    })
  } catch {
    return []
  }
}

function writeRecords(records: SignupDetailRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, 100)))
  } catch {
    // Signup still succeeds when browser storage is restricted.
  }
}

/** Stores the public signup profile only. Passwords and password confirmations are excluded. */
export function recordSignupDetail(details: Omit<SignupDetailRecord, 'signedUpAt' | 'context'>): void {
  const record: SignupDetailRecord = {
    name: details.name.trim(),
    contact: details.contact.trim(),
    email: details.email.trim().toLowerCase(),
    signedUpAt: Date.now(),
    context: getClientContext(),
  }
  writeRecords([record, ...readRecords().filter(existing => existing.email !== record.email)])
}

export function getSignupDetails(): SignupDetailRecord[] {
  return readRecords()
}

export function getSignupDetail(): SignupDetailRecord | null {
  return readRecords()[0] || null
}
