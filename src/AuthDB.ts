import { reportStorageUnavailable } from './Notify'

/**
 * Local-only app lock — the SOLE auth mechanism.
 * No accounts, no server, no Firebase. One 6-digit code per device,
 * PBKDF2-hashed (210k iterations, SHA-256) with constant-time verify.
 */
type LockRecord = {
  salt: string
  hash: string
}

const LOCK_KEY = 'hts_app_lock_v1'
const PBKDF2_ITERATIONS = 210_000

function encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

function decode(value: string): Uint8Array {
  return Uint8Array.from(atob(value), char => char.charCodeAt(0))
}

function readLock(): LockRecord | null {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(LOCK_KEY) || 'null')
    if (parsed && typeof parsed === 'object' && typeof (parsed as LockRecord).salt === 'string' && typeof (parsed as LockRecord).hash === 'string') {
      return parsed as LockRecord
    }
  } catch {
    // Corrupt store reads as empty; user sets a fresh code.
  }
  return null
}

function writeLock(record: LockRecord): void {
  try {
    localStorage.setItem(LOCK_KEY, JSON.stringify(record))
  } catch {
    reportStorageUnavailable()
  }
}

export class AuthDB {
  private static instance: AuthDB

  private constructor() {}

  static getInstance(): AuthDB {
    if (!AuthDB.instance) AuthDB.instance = new AuthDB()
    return AuthDB.instance
  }

  hasPasscode(): boolean {
    return readLock() !== null
  }

  async setPasscode(code: string): Promise<void> {
    if (!/^\d{6}$/.test(code)) throw new Error('Access code must be exactly 6 digits.')
    const salt = crypto.getRandomValues(new Uint8Array(16))
    writeLock({ salt: encode(salt), hash: encode(await this.hash(code, salt)) })
  }

  async verifyPasscode(code: string): Promise<boolean> {
    const record = readLock()
    if (!record) return false
    const actual = await this.hash(code, decode(record.salt))
    const expected = decode(record.hash)
    if (actual.length !== expected.length) return false
    let difference = 0
    for (let i = 0; i < actual.length; i++) difference |= actual[i] ^ expected[i]
    return difference === 0
  }

  private async hash(password: string, salt: Uint8Array): Promise<Uint8Array> {
    if (!globalThis.crypto?.subtle) throw new Error('Secure storage requires HTTPS or localhost.')
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: salt.slice().buffer as ArrayBuffer, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
      key,
      256,
    )
    return new Uint8Array(bits)
  }
}

export const authDB = AuthDB.getInstance()
