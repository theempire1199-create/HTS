export interface User {
  id: string
  name: string
  email: string
  contact: string
  passwordSalt: string
  passwordHash: string
  createdAt: number
  lastLoginAt: number
  loginCount: number
}

export interface LoginRecord {
  userId: string
  timestamp: number
}

export interface AuthDBData {
  users: Record<string, User>
  logins: LoginRecord[]
}

export type ScreenId = 'v-start' | 'v-login' | 'v-signup' | 'v-reverify' | 'v-work-progress'
export type OTPPurpose = 'recovery'
export type ToastOptions = { message: string; duration?: number; type?: 'success' | 'error' | 'info' | 'warning' }

export interface SignupDetails {
  name: string
  email: string
  contact: string
  password: string
}

/** Removes spaces, dashes, dots, brackets from a phone number for comparison. Keeps leading +. */
export function normalizeContact(value: string): string {
  return value.trim().replace(/[\s\-().]/g, '')
}

/** Lowercase + trim normalization for emails and generic identifiers. */
export function normalize(value: string): string {
  return value.trim().toLowerCase()
}

/** Digits-only core used to compare phone numbers across +91 / 0 / formatting variants. */
function contactCoreDigits(value: string): string {
  const digits = normalizeContact(value).replace(/\D/g, '')
  const withoutLeadingZeros = digits.replace(/^0+/, '')
  if (withoutLeadingZeros.length === 12 && withoutLeadingZeros.startsWith('91')) {
    return withoutLeadingZeros.slice(2)
  }
  return withoutLeadingZeros
}

/**
 * Robust identifier equality for emails and phone numbers.
 * - Emails: case-insensitive exact match.
 * - Contacts: tolerates spaces, dashes, brackets, leading +91 / 91 / 0.
 */
export function identifiersEqual(a: string, b: string): boolean {
  const na = normalize(a)
  const nb = normalize(b)
  if (na === nb) return true
  // Emails must match exactly (case-insensitive); never fuzzy-match them as phone numbers.
  if (na.includes('@') || nb.includes('@')) return false
  const ca = normalizeContact(a).toLowerCase()
  const cb = normalizeContact(b).toLowerCase()
  if (ca === cb) return true
  const coreA = contactCoreDigits(a)
  const coreB = contactCoreDigits(b)
  if (!coreA || !coreB) return false
  return coreA.length >= 7 && coreA === coreB
}

/** Strict email format check: single @, valid local/domain, TLD >= 2 letters. */
export function isValidEmail(email: string): boolean {
  const value = email.trim()
  if (!value || value.length > 254 || value.includes(' ') || value.includes('..')) return false
  if ((value.match(/@/g) || []).length !== 1) return false
  const [local, domain] = value.split('@')
  if (!local || !domain || local.length > 64 || domain.length > 253) return false
  if (local.startsWith('.') || local.endsWith('.')) return false
  if (!/^[A-Za-z0-9._%+-]+$/.test(local)) return false
  if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.') || domain.startsWith('-') || domain.endsWith('-')) return false
  if (!/^[A-Za-z0-9.-]+$/.test(domain)) return false
  const labels = domain.split('.')
  if (labels.some(label => !label || label.startsWith('-') || label.endsWith('-'))) return false
  const tld = labels[labels.length - 1]
  if (!/^[A-Za-z]{2,}$/.test(tld)) return false
  return true
}

/** Valid phone number: 7-15 digits, optional leading +, rejects all-same-digit fakes. */
export function isValidContact(contact: string): boolean {
  const normalized = normalizeContact(contact)
  if (!/^\+?[0-9]{7,15}$/.test(normalized)) return false
  const digits = normalized.startsWith('+') ? normalized.slice(1) : normalized
  if (/^(\d)\1+$/.test(digits)) return false
  if (!normalized.startsWith('+') && digits.length === 10 && !/^[6-9][0-9]{9}$/.test(digits)) return false
  if (normalized.startsWith('+91') && digits.length === 12) {
    if (!/^91[6-9][0-9]{9}$/.test(digits)) return false
  }
  return true
}

/** Identifier is valid if it is either a valid email or a valid contact number. */
export function isValidIdentifier(value: string): boolean {
  return isValidEmail(value) || isValidContact(value)
}
