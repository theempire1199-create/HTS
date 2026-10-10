import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

/**
 * Firebase project: htsos-e3fa4
 *
 * These are the Firebase **web** config values. They are public client
 * identifiers, not secrets — Firebase's own docs say they are safe to ship in
 * the browser bundle. Access is controlled by Firebase Security Rules and the
 * project's Authorized Domains, NOT by hiding these values. Do NOT put a
 * service-account key / private key here.
 *
 * To move them out of source later, replace each value with
 * `import.meta.env.VITE_FIREBASE_*` and provide a `.env` file.
 */
const firebaseConfig = {
  apiKey: 'AIzaSyDcSZX4PdNHPoHDQL-ULQAPaM-hZzB6nSc',
  authDomain: 'htsos-e3fa4.firebaseapp.com',
  projectId: 'htsos-e3fa4',
  storageBucket: 'htsos-e3fa4.firebasestorage.app',
  messagingSenderId: '209782611493',
  appId: '1:209782611493:web:3d5d909172f2ce4d9629cc',
  measurementId: 'G-TMWN3H00VS',
}

export const firebaseApp = initializeApp(firebaseConfig)
export const firebaseAuth = getAuth(firebaseApp)
