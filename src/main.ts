import './main.css'
import { firebaseConfigError } from './firebase'
import { pushLocal } from './Notify'

const app = document.querySelector<HTMLElement>('#app')

function escapeHtml(value: string): string {
  return value.replace(/[<>&]/g, (char) => (char === '<' ? '&lt;' : char === '>' ? '&gt;' : '&amp;'))
}

/** Show a readable message instead of a blank white screen when startup fails. */
function showFatal(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  console.error('[HTS] startup failed:', error)
  if (!app) return
  const isConfigError = /VITE_FIREBASE/i.test(message)
  const hint = isConfigError
    ? `<p style="font-size:13px;color:#755aa3">Vercel par ho? Dashboard -> Project -> Settings -> Environment Variables me <code>VITE_FIREBASE_*</code> values dalo, Authorized Domains check karo, phir <b>Redeploy</b> karo (env build-time par lagti hai). Local par <code>.env.example</code> ko <code>.env</code> me copy karke values bharo.</p>`
    : `<p style="font-size:13px;color:#755aa3">Run the app with <code>npm install</code> then <code>npm run dev</code>, and open the printed Local URL (e.g. http://localhost:5173).</p>`
  app.innerHTML = `<div style="max-width:560px;margin:12vh auto;padding:24px;font-family:system-ui,sans-serif;color:#2c2340">
    <h1 style="font-size:20px;color:#7c3aed;margin:0 0 10px">HASAN TECH STUDIO</h1>
    <p style="font-weight:700;margin:0 0 8px">App failed to start.</p>
    <pre style="white-space:pre-wrap;word-break:break-word;background:#f5efff;padding:12px;border-radius:10px;font-size:13px">${escapeHtml(message)}</pre>
    ${hint}
  </div>`
}

if (!app) {
  console.error('[HTS] #app root was not found.')
} else {
  // Dynamic import so even an import-time failure lands in showFatal (readable
  // error) instead of killing the whole module graph (blank white screen).
  const boot = async (): Promise<void> => {
    if (firebaseConfigError) throw firebaseConfigError
    const { AuthUI } = await import('./AuthUI')
    new AuthUI(app).init()
  }
  boot().catch(showFatal)
  // Surface a blank-screen-causing async error too, but never clobber a rendered app.
  window.addEventListener('error', (event) => {
    if (!app.childElementCount) showFatal(event.error ?? event.message)
  })
  window.addEventListener('unhandledrejection', (event) => {
    if (!app.childElementCount) showFatal(event.reason)
  })
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        const checkForUpdate = (): void => {
          registration.update().catch(() => {
            // Offline: keep running the cached shell; retry on next check.
          })
        }
        registration.addEventListener('updatefound', () => {
          const incoming = registration.installing
          if (!incoming) return
          incoming.addEventListener('statechange', () => {
            // New shell ready while an old one controls the page -> switch instantly.
            if (incoming.state === 'installed' && navigator.serviceWorker.controller) {
              void pushLocal('HASAN TECH STUDIO', 'App updated — fresh version is live.')
              window.setTimeout(() => window.location.reload(), 1500)
            }
          })
        })
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') checkForUpdate()
        })
        window.setInterval(checkForUpdate, 30 * 60 * 1000)
      })
      .catch(() => {
        // Offline shell is best-effort; the app still runs fully online.
      })
  })
}
