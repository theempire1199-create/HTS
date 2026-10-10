import type { AuthDBData, SignupDetails, User } from './index'
import { isValidContact, isValidEmail, normalize, normalizeContact } from './index'
import { reportStorageUnavailable } from './Notify'
import {
  AUTH_DB_KEY,
  AUTH_SCHEMA_KEY,
  AUTH_SCHEMA_VERSION,
  CURRENT_USER_KEY,
  LEGACY_AUTH_DB_KEY,
  LEGACY_CURRENT_USER_KEY,
  LOGIN_DETAILS_KEY,
  SIGNUP_DETAILS_KEY,
} from './utils/constants'

const STORAGE_KEY = AUTH_DB_KEY
const CURRENT_USER_STORAGE_KEY = CURRENT_USER_KEY
const SCHEMA_KEY = AUTH_SCHEMA_KEY
const SCHEMA_VERSION = AUTH_SCHEMA_VERSION
const LEGACY_STORAGE_KEY = LEGACY_AUTH_DB_KEY
const LEGACY_CURRENT_USER_STORAGE_KEY = LEGACY_CURRENT_USER_KEY
const OTP_TTL = 5 * 60 * 1000
const PBKDF2_ITERATIONS = 210_000

type PendingOTP = { code: string; expiresAt: number; purpose: 'recovery' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isStoredUser(value: unknown): value is User {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string' && typeof value.email === 'string' && typeof value.contact === 'string' && typeof value.passwordSalt === 'string' && typeof value.passwordHash === 'string' && typeof value.createdAt === 'number' && typeof value.lastLoginAt === 'number' && typeof value.loginCount === 'number'
}

function encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

function decode(value: string): Uint8Array {
  return Uint8Array.from(atob(value), char => char.charCodeAt(0))
}

export class AuthDB {
  private static instance: AuthDB
  private data: AuthDBData
  private otps = new Map<string, PendingOTP>()

  private constructor() {
    AuthDB.safeRemove(LEGACY_STORAGE_KEY)
    AuthDB.safeRemove(LEGACY_CURRENT_USER_STORAGE_KEY)
    if (AuthDB.safeGet(SCHEMA_KEY) !== SCHEMA_VERSION) {
      AuthDB.safeRemove(STORAGE_KEY)
      AuthDB.safeRemove(CURRENT_USER_STORAGE_KEY)
      AuthDB.safeRemove(LOGIN_DETAILS_KEY)
      AuthDB.safeRemove(SIGNUP_DETAILS_KEY)
      AuthDB.safeSet(SCHEMA_KEY, SCHEMA_VERSION)
    }
    this.data = this.loadFromStorage()
  }

  static getInstance(): AuthDB {
    if (!AuthDB.instance) AuthDB.instance = new AuthDB()
    return AuthDB.instance
  }

  private static safeGet(key: string): string | null {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  }

  private static safeSet(key: string, value: string): void {
    try {
      localStorage.setItem(key, value)
    } catch {
      // Quota exceeded or private mode: surface a friendly warning instead of failing silently.
      reportStorageUnavailable()
    }
  }

  private static safeRemove(key: string): void {
    try {
      localStorage.removeItem(key)
    } catch {
      // Storage may be unavailable in a private or restricted browsing context.
    }
  }

  private loadFromStorage(): AuthDBData {
    try {
      const parsed: unknown = JSON.parse(AuthDB.safeGet(STORAGE_KEY) || '{}')
      if (!isRecord(parsed)) return { users: {}, logins: [] }
      const rawUsers = isRecord(parsed.users) ? parsed.users : {}
      const users = Object.fromEntries(Object.entries(rawUsers).filter(([, user]) => isStoredUser(user))) as Record<string, User>
      const logins = Array.isArray(parsed.logins) ? parsed.logins.filter((entry): entry is AuthDBData['logins'][number] => isRecord(entry) && typeof entry.userId === 'string' && typeof entry.timestamp === 'number') : []
      return { users, logins }
    } catch {
      return { users: {}, logins: [] }
    }
  }

  private persist(): void {
    AuthDB.safeSet(STORAGE_KEY, JSON.stringify(this.data))
  }

  private findUserRecord(identifier: string): User | null {
    const key = normalize(identifier)
    if (this.data.users[key]) return this.data.users[key]
    const contactKey = normalizeContact(identifier).toLowerCase()
    return Object.values(this.data.users).find(user => normalizeContact(user.contact).toLowerCase() === contactKey) || null
  }

  findUser(identifier: string): Omit<User, 'passwordSalt' | 'passwordHash'> | null {
    const user = this.findUserRecord(identifier)
    if (!user) return null
    const { passwordSalt: _salt, passwordHash: _hash, ...publicUser } = user
    return publicUser
  }

  hasAccount(identifier: string): boolean {
    return this.findUserRecord(identifier) !== null
  }

  /** Admin-safe account list with password salts and hashes stripped. */
  listUsers(): Array<Omit<User, 'passwordSalt' | 'passwordHash'>> {
    return Object.values(this.data.users).map(({ passwordSalt: _salt, passwordHash: _hash, ...user }) => user)
  }

  listLoginEvents(): AuthDBData['logins'] {
    return [...this.data.logins].sort((a, b) => b.timestamp - a.timestamp)
  }

  private async hashPassword(password: string, salt: Uint8Array): Promise<Uint8Array> {
    if (!globalThis.crypto?.subtle) throw new Error('Secure password storage requires HTTPS or localhost.')
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt.slice().buffer as ArrayBuffer, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' }, key, 256)
    return new Uint8Array(bits)
  }

  private async verifyPassword(password: string, user: User): Promise<boolean> {
    const actual = await this.hashPassword(password, decode(user.passwordSalt))
    const expected = decode(user.passwordHash)
    if (actual.length !== expected.length) return false
    let difference = 0
    for (let i = 0; i < actual.length; i++) difference |= actual[i] ^ expected[i]
    return difference === 0
  }

  startOTP(identifier: string, purpose: PendingOTP['purpose']): string {
    const key = normalize(identifier)
    const bytes = crypto.getRandomValues(new Uint32Array(1))
    const code = String(bytes[0] % 1_000_000).padStart(6, '0')
    this.otps.set(key, { code, purpose, expiresAt: Date.now() + OTP_TTL })
    return code
  }

  verifyOTP(identifier: string, code: string, purpose: PendingOTP['purpose']): boolean {
    const key = normalize(identifier)
    const otp = this.otps.get(key)
    if (!otp || otp.purpose !== purpose || otp.expiresAt < Date.now() || otp.code !== code.trim()) {
      if (otp && otp.expiresAt < Date.now()) this.otps.delete(key)
      return false
    }
    this.otps.delete(key)
    return true
  }

  async createUser(details: SignupDetails): Promise<void> {
    const name = details.name.trim()
    const contact = details.contact.trim()
    const email = details.email.trim()
    if (name.length < 3) throw new Error('Enter full name.')
    if (!isValidContact(contact)) throw new Error('Enter a valid contact number (7-15 digits, e.g. 9876543210 or +919876543210).')
    if (!isValidEmail(email)) throw new Error('Enter a valid email ID (e.g. name@example.com).')
    if (details.password.length < 6) throw new Error('Secret must be at least 6 characters.')
    const emailKey = normalize(details.email)
    const contactKey = normalize(details.contact)
    if (this.hasAccount(emailKey) || this.hasAccount(contactKey)) throw new Error('An account with this email or contact number already exists.')

    const salt = crypto.getRandomValues(new Uint8Array(16))
    const passwordHash = await this.hashPassword(details.password, salt)
    const user: User = {
      id: emailKey,
      name,
      email: emailKey,
      contact,
      passwordSalt: encode(salt),
      passwordHash: encode(passwordHash),
      createdAt: Date.now(),
      lastLoginAt: 0,
      loginCount: 0,
    }
    this.data.users[emailKey] = user
    this.persist()
  }

  async login(identifier: string, password: string): Promise<Omit<User, 'passwordSalt' | 'passwordHash'>> {
    const user = this.findUserRecord(identifier)
    if (!user || !(await this.verifyPassword(password, user))) throw new Error('Email, contact number, or password is incorrect.')
    user.lastLoginAt = Date.now()
    user.loginCount += 1
    this.data.logins.push({ userId: user.id, timestamp: Date.now() })
    this.data.logins = this.data.logins.slice(-100)
    this.persist()
    AuthDB.safeSet(CURRENT_USER_STORAGE_KEY, user.id)
    const current = this.findUser(user.id)
    if (!current) throw new Error('Login succeeded but session could not be restored.')
    return current
  }

  async resetPassword(identifier: string, password: string): Promise<void> {
    if (password.length < 6) throw new Error('Secret must be at least 6 characters.')
    const user = this.findUserRecord(identifier)
    if (!user) throw new Error('No account was found for that email or contact number.')
    const salt = crypto.getRandomValues(new Uint8Array(16))
    user.passwordSalt = encode(salt)
    user.passwordHash = encode(await this.hashPassword(password, salt))
    this.persist()
  }

  getCurrentUser(): Omit<User, 'passwordSalt' | 'passwordHash'> | null {
    const id = AuthDB.safeGet(CURRENT_USER_STORAGE_KEY)
    return id ? this.findUser(id) : null
  }

  logout(): void {
    AuthDB.safeRemove(CURRENT_USER_STORAGE_KEY)
  }

  clearAll(): void {
    this.data = { users: {}, logins: [] }
    this.otps.clear()
    this.persist()
    this.logout()
  }
}

export const authDB = AuthDB.getInstance()
