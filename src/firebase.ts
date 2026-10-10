import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

/**
 * Firebase project: hasan-tech-studio
 *
 * Config loads from `VITE_FIREBASE_*` environment variables (see
 * `.env.example`; real values live in the gitignored `.env`).
 *
 * These are public client identifiers, not secrets — Firebase's own docs say
 * they are safe to ship in the browser bundle. Access is controlled by
 * Firebase Security Rules and the project's Authorized Domains, NOT by hiding
 * these values. Do NOT put a service-account key / private key here.
 */
function requiredEnv(name: string): string {
  const value = (import.meta.env[name] as string | undefined)?.trim()
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env and fill it from the Firebase console ` +
        `(Project settings -> General -> Your apps -> Web).`,
    )
  }
  return value
}

const firebaseConfig = {
  apiKey: requiredEnv('VITE_FIREBASE_API_KEY'),
  authDomain: requiredEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: requiredEnv('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: requiredEnv('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: requiredEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: requiredEnv('VITE_FIREBASE_APP_ID'),
  measurementId: (import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined)?.trim() || undefined,
}

export const firebaseApp = initializeApp(firebaseConfig)
export const firebaseAuth = getAuth(firebaseApp)

/**
 * Firestore — app data (user profiles + login history).
 * Firebase console -> Build -> Firestore Database -> Create database.
 * Rules ke liye repo me `firestore.rules` dekho.
 */
export const firebaseDB = getFirestore(firebaseApp)
