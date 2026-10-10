import './main.css'
import { AuthUI } from './AuthUI'
import { pushLocal } from './Notify'

const app = document.querySelector<HTMLElement>('#app')
if (!app) throw new Error('App root #app was not found.')

new AuthUI(app).init()

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
