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
import { firebaseAuth, firebaseDB } from './firebase'
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  where,
} from 'firebase/firestore'
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

/**
 * Firestore DB schema (project: hasan-tech-studio).
 *
 * Collection: `users` — docId = Firebase Auth uid
 *   - name: string (full name, >= 3 chars)
 *   - email: string (lowercase, unique via Firebase Auth)
 *   - contact: string (unique via app-level query, e.g. 9876543210)
 *   - createdAt: number (Date.now() ms at signup)
 *   - lastLoginAt: number (Date.now() ms at last login)
 *   - loginCount: number (increments on every login)
 *   - emailVerified: boolean (mirror of Auth flag, refreshed on reverify)
 *   - updatedAt: number (last profile write)
 *
 * Subcollection: `users/{uid}/logins` — auto-id per login
 *   - timestamp: number
 *   - identifier: string (email used at login)
 *
 * Security: user can read/write ONLY their own doc
 * (see `firestore.rules` in repo root).
 */
export interface UserProfileDoc {
  name: string
  email: string
  contact: string
  createdAt: number
  lastLoginAt: number
  loginCount: number
  emailVerified: boolean
  updatedAt: number
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
    case 'permission-denied': return new Error('Database permission denied — Firestore Rules check karo (firestore.rules).')
    case 'unavailable': return new Error('Database unavailable — Firestore Database bana hai ya nahi check karo.')
    default: return error instanceof Error ? new Error(error.message) : new Error('Something went wrong. Please try again.')
  }
}

/** Firestore helpers — best-effort: Auth kabhi Firestore ki wajah se block nahi hoga. */
function userDocRef(uid: string) {
  return doc(firebaseDB, 'users', uid)
}

function loginsCollectionRef(uid: string) {
  return collection(firebaseDB, 'users', uid, 'logins')
}

async function isContactTaken(contact: string): Promise<boolean> {
  try {
    const snap = await getDocs(query(collection(firebaseDB, 'users'), where('contact', '==', contact), limit(1)))
    return !snap.empty
  } catch {
    // Firestore abhi bana nahi / offline — signup ko block mat karo.
    return false
  }
}

async function writeUserDoc(uid: string, data: Partial<UserProfileDoc>, merge = true): Promise<void> {
  try {
    await setDoc(userDocRef(uid), { ...data, updatedAt: Date.now() }, { merge })
  } catch (error) {
    console.warn('[Firestore] user doc write failed:', error)
  }
}

async function recordLoginEvent(uid: string, identifier: string): Promise<void> {
  try {
    await addDoc(loginsCollectionRef(uid), { timestamp: Date.now(), identifier })
  } catch (error) {
    console.warn('[Firestore] login event write failed:', error)
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
    if (await isContactTaken(contact)) throw new Error('That contact number is already registered — try signing in.')
    let cred
    try {
      cred = await createUserWithEmailAndPassword(firebaseAuth, email, details.password)
    } catch (error) {
      throw friendly(error)
    }
    if (name) {
      try { await updateProfile(cred.user, { displayName: name }) } catch { /* display name is best-effort */ }
    }
    const now = Date.now()
    // 1) Firestore — source of truth (users/{uid})
    await writeUserDoc(cred.user.uid, {
      name,
      email,
      contact,
      createdAt: now,
      lastLoginAt: now,
      loginCount: 0,
      emailVerified: cred.user.emailVerified,
    }, false)
    // 2) Local cache — offline fallback + app-lock store
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
    const now = Date.now()
    // 1) Local cache update (instant UI)
    const profiles = readProfiles()
    const profile = profiles[cred.user.uid] ?? { contact: '', loginCount: 0 }
    profile.loginCount = (profile.loginCount || 0) + 1
    profiles[cred.user.uid] = profile
    writeProfiles(profiles)
    // 2) Firestore sync — backfill purane users + increment count
    try {
      const snap = await getDoc(userDocRef(cred.user.uid))
      const existing = snap.exists() ? (snap.data() as Partial<UserProfileDoc>) : null
      const nextCount = (existing?.loginCount ?? profile.loginCount - 1) + 1
      // Purane user ka contact local me ho to cloud me backfill karo
      const contact = existing?.contact || profile.contact || ''
      await writeUserDoc(cred.user.uid, {
        name: existing?.name || cred.user.displayName || '',
        email: cred.user.email?.toLowerCase() || email,
        contact,
        createdAt: existing?.createdAt || now,
        lastLoginAt: now,
        loginCount: nextCount,
        emailVerified: cred.user.emailVerified,
      })
      if (contact && !profile.contact) {
        profile.contact = contact
        profiles[cred.user.uid] = profile
        writeProfiles(profiles)
      } else if (contact) {
        profile.contact = contact
        profile.loginCount = nextCount
        profiles[cred.user.uid] = profile
        writeProfiles(profiles)
      } else {
        profile.loginCount = nextCount
        profiles[cred.user.uid] = profile
        writeProfiles(profiles)
      }
    } catch (error) {
      console.warn('[Firestore] login sync failed:', error)
    }
    void recordLoginEvent(cred.user.uid, email)
    return this.mapUser(cred.user)
  }

  /** Firestore se fresh profile lao + local cache sync karo. Dashboard ke liye. */
  async fetchCloudProfile(uid: string): Promise<UserProfileDoc | null> {
    try {
      const snap = await getDoc(userDocRef(uid))
      if (!snap.exists()) return null
      const data = snap.data() as UserProfileDoc
      const profiles = readProfiles()
      const local = profiles[uid] ?? { contact: '', loginCount: 0 }
      if (data.contact) local.contact = data.contact
      if (typeof data.loginCount === 'number') local.loginCount = data.loginCount
      profiles[uid] = local
      writeProfiles(profiles)
      return data
    } catch (error) {
      console.warn('[Firestore] profile fetch failed:', error)
      return null
    }
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
    const verified = firebaseAuth.currentUser?.emailVerified ?? false
    if (verified) void writeUserDoc(fb.uid, { emailVerified: true })
    return verified
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
