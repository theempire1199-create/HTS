import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User as FirebaseUser,
} from 'firebase/auth'
import { firebaseAuth } from './firebase'
import type { SignupDetails } from './index'
import { isValidContact, isValidEmail } from './index'
import { reportStorageUnavailable } from './Notify'

/** Public shape of a signed-in user, mapped from the Firebase user record. */
export interface AppUser {
  id: string
  name: string
  email: string
  contact: string
  createdAt: number
  lastLoginAt: number
  loginCount: number
  emailVerified: boolean
}

/** Local-only extras keyed by Firebase uid (contact, login count, app-lock code). */
type Profile = {
  contact: string
  loginCount: number
  passcodeSalt?: string
  passcodeHash?: string
}

const PROFILE_KEY = 'hts_profiles_v1'
const PBKDF2_ITERATIONS = 210_000

function encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

function decode(value: string): Uint8Array {
  return Uint8Array.from(atob(value), char => char.charCodeAt(0))
}

function readProfiles(): Record<string, Profile> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}')
    if (parsed && typeof parsed === 'object') return parsed as Record<string, Profile>
  } catch {
    // Corrupt store reads as empty; it is rebuilt on next write.
  }
  return {}
}

function writeProfiles(map: Record<string, Profile>): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(map))
  } catch {
    reportStorageUnavailable()
  }
}

/** Turn a Firebase error code into a message a person can act on. */
function friendly(error: unknown): Error {
  const code = (error as { code?: string } | null)?.code ?? ''
  switch (code) {
    case 'auth/email-already-in-use': return new Error('That email is already registered — try signing in.')
    case 'auth/invalid-email': return new Error('Enter a valid email ID.')
    case 'auth/weak-password': return new Error('Secret must be at least 6 characters.')
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential': return new Error('Email or password is incorrect.')
    case 'auth/too-many-requests': return new Error('Too many attempts. Please wait a moment and try again.')
    case 'auth/network-request-failed': return new Error('Network error — check your connection and try again.')
    case 'auth/requires-recent-login': return new Error('Please sign in again to continue.')
    default: return error instanceof Error ? new Error(error.message) : new Error('Something went wrong. Please try again.')
  }
}

export class AuthDB {
  private static instance: AuthDB

  private constructor() {}

  static getInstance(): AuthDB {
    if (!AuthDB.instance) AuthDB.instance = new AuthDB()
    return AuthDB.instance
  }

  /** Subscribe to sign-in/sign-out. Returns an unsubscribe function. */
  onChange(listener: (user: AppUser | null) => void): () => void {
    return onAuthStateChanged(firebaseAuth, (fb) => listener(fb ? this.mapUser(fb) : null))
  }

  private mapUser(fb: FirebaseUser): AppUser {
    const profile = readProfiles()[fb.uid] ?? { contact: '', loginCount: 0 }
    return {
      id: fb.uid,
      name: fb.displayName || '',
      email: fb.email || '',
      contact: profile.contact || '',
      createdAt: fb.metadata.creationTime ? Date.parse(fb.metadata.creationTime) : 0,
      lastLoginAt: fb.metadata.lastSignInTime ? Date.parse(fb.metadata.lastSignInTime) : 0,
      loginCount: profile.loginCount || 0,
      emailVerified: fb.emailVerified,
    }
  }

  getCurrentUser(): AppUser | null {
    const fb = firebaseAuth.currentUser
    return fb ? this.mapUser(fb) : null
  }

  async createUser(details: SignupDetails): Promise<void> {
    const name = details.name.trim()
    const contact = details.contact.trim()
    const email = details.email.trim().toLowerCase()
    if (name.length < 3) throw new Error('Enter full name.')
    if (!isValidContact(contact)) throw new Error('Enter a valid contact number (7-15 digits, e.g. 9876543210 or +919876543210).')
    if (!isValidEmail(email)) throw new Error('Enter a valid email ID (e.g. name@example.com).')
    if (details.password.length < 6) throw new Error('Secret must be at least 6 characters.')
    let cred
    try {
      cred = await createUserWithEmailAndPassword(firebaseAuth, email, details.password)
    } catch (error) {
      throw friendly(error)
    }
    if (name) {
      try { await updateProfile(cred.user, { displayName: name }) } catch { /* display name is best-effort */ }
    }
    const profiles = readProfiles()
    profiles[cred.user.uid] = { ...(profiles[cred.user.uid] ?? { loginCount: 0 }), contact, loginCount: profiles[cred.user.uid]?.loginCount ?? 0 }
    writeProfiles(profiles)
    try { await sendEmailVerification(cred.user) } catch { /* verification email is best-effort */ }
  }

  async login(identifier: string, password: string): Promise<AppUser> {
    const email = identifier.trim().toLowerCase()
    if (!isValidEmail(email)) throw new Error('Sign in with your email ID (phone sign-in is not enabled yet).')
    let cred
    try {
      cred = await signInWithEmailAndPassword(firebaseAuth, email, password)
    } catch (error) {
      throw friendly(error)
    }
    const profiles = readProfiles()
    const profile = profiles[cred.user.uid] ?? { contact: '', loginCount: 0 }
    profile.loginCount = (profile.loginCount || 0) + 1
    profiles[cred.user.uid] = profile
    writeProfiles(profiles)
    return this.mapUser(cred.user)
  }

  async logout(): Promise<void> {
    await signOut(firebaseAuth)
  }

  /** Sends a Firebase password-reset email. */
  async resetPassword(identifier: string): Promise<void> {
    const email = identifier.trim().toLowerCase()
    if (!isValidEmail(email)) throw new Error('Enter your email ID to reset your password.')
    try {
      await sendPasswordResetEmail(firebaseAuth, email)
    } catch (error) {
      throw friendly(error)
    }
  }

  async sendVerificationEmail(): Promise<void> {
    const fb = firebaseAuth.currentUser
    if (!fb) throw new Error('Sign in first.')
    if (fb.emailVerified) return
    try {
      await sendEmailVerification(fb)
    } catch (error) {
      throw friendly(error)
    }
  }

  /** Re-reads the user record and reports whether the email is now verified. */
  async reloadVerification(): Promise<boolean> {
    const fb = firebaseAuth.currentUser
    if (!fb) return false
    await fb.reload()
    return firebaseAuth.currentUser?.emailVerified ?? false
  }

  // ---- Local app-lock passcode (per Firebase uid, PBKDF2-hashed) ----

  hasPasscode(userId: string): boolean {
    const profile = readProfiles()[userId]
    return Boolean(profile?.passcodeHash && profile?.passcodeSalt)
  }

  async setPasscode(userId: string, code: string): Promise<void> {
    if (!/^\d{6}$/.test(code)) throw new Error('Access code must be exactly 6 digits.')
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const profiles = readProfiles()
    const profile = profiles[userId] ?? { contact: '', loginCount: 0 }
    profile.passcodeSalt = encode(salt)
    profile.passcodeHash = encode(await this.hash(code, salt))
    profiles[userId] = profile
    writeProfiles(profiles)
  }

  async verifyPasscode(userId: string, code: string): Promise<boolean> {
    const profile = readProfiles()[userId]
    if (!profile?.passcodeHash || !profile?.passcodeSalt) return false
    const actual = await this.hash(code, decode(profile.passcodeSalt))
    const expected = decode(profile.passcodeHash)
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
