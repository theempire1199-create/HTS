import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

/**
 * Firebase project: hasan-tech-studio
 *
 * Config loads from `VITE_FIREBASE_*` environment variables (see
 * `.env.example`; real values live in the gitignored `.env` locally and in
 * Vercel -> Settings -> Environment Variables for deploys).
 *
 * These are public client identifiers, not secrets — Firebase's own docs say
 * they are safe to ship in the browser bundle. Access is controlled by
 * Firebase Security Rules and the project's Authorized Domains, NOT by hiding
 * these values. Do NOT put a service-account key / private key here.
 *
 * IMPORTANT: importing this module never throws, so the UI can always render
 * a readable error instead of a blank screen. Use the lazy getters below —
 * they throw `firebaseConfigError` only when Firebase is actually used.
 */
function readEnv(name: string): string {
  return (import.meta.env[name] as string | undefined)?.trim() ?? ''
}

const REQUIRED_VARS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const

const missingVars = REQUIRED_VARS.filter((name) => !readEnv(name))

/**
 * Non-null when the app was built without Firebase config
 * (e.g. Vercel deploy without VITE_FIREBASE_* env vars — env is baked
 * at BUILD time, so adding vars needs a Redeploy).
 */
export const firebaseConfigError: Error | null =
  missingVars.length > 0
    ? new Error(
        `Missing ${missingVars.join(', ')}. ` +
          `Local: copy .env.example to .env and fill it from the Firebase console ` +
          `(Project settings -> General -> Your apps -> Web). ` +
          `Vercel: add the VITE_FIREBASE_* Environment Variables, then Redeploy.`,
      )
    : null

const firebaseConfig = {
  apiKey: readEnv('VITE_FIREBASE_API_KEY'),
  authDomain: readEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: readEnv('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: readEnv('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: readEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: readEnv('VITE_FIREBASE_APP_ID'),
  measurementId: readEnv('VITE_FIREBASE_MEASUREMENT_ID') || undefined,
}

let cachedApp: FirebaseApp | undefined
let cachedAuth: Auth | undefined
let cachedDB: Firestore | undefined

function assertConfigured(): void {
  if (firebaseConfigError) throw firebaseConfigError
}

/** Lazy init so a missing config fails with a readable error, never a blank screen. */
export function getFirebaseApp(): FirebaseApp {
  assertConfigured()
  if (!cachedApp) cachedApp = initializeApp(firebaseConfig)
  return cachedApp
}

/** Lazy Auth instance — safe to call from any auth flow. */
export function getFirebaseAuth(): Auth {
  if (!cachedAuth) cachedAuth = getAuth(getFirebaseApp())
  return cachedAuth
}

/**
 * Lazy Firestore — app data (user profiles + login history).
 * Firebase console -> Build -> Firestore Database -> Create database.
 * Rules ke liye repo me `firestore.rules` dekho.
 */
export function getFirebaseDB(): Firestore {
  if (!cachedDB) cachedDB = getFirestore(getFirebaseApp())
  return cachedDB
}
