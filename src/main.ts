import './main.css'
import { AuthUI } from './AuthUI'
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
  app.innerHTML = `<div style="max-width:560px;margin:12vh auto;padding:24px;font-family:system-ui,sans-serif;color:#2c2340">
    <h1 style="font-size:20px;color:#7c3aed;margin:0 0 10px">HASAN TECH STUDIO</h1>
    <p style="font-weight:700;margin:0 0 8px">App failed to start.</p>
    <pre style="white-space:pre-wrap;word-break:break-word;background:#f5efff;padding:12px;border-radius:10px;font-size:13px">${escapeHtml(message)}</pre>
    <p style="font-size:13px;color:#755aa3">Reload the page. If it keeps failing, reinstall the app.</p>
  </div>`
}

if (!app) {
  console.error('[HTS] #app root was not found.')
} else {
  try {
    new AuthUI(app).init()
  } catch (error) {
    showFatal(error)
  }
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
