/** Single-user local notifications. No server, no push service, one-click on/off. */

const PREF_KEY = 'hts_notify_v1'
const ICON = '/icons/icon-192.png'

export function notifySupported(): boolean {
  try {
    return typeof Notification !== 'undefined'
  } catch {
    return false
  }
}

export function currentPermission(): 'granted' | 'denied' | 'default' | 'unsupported' {
  if (!notifySupported()) return 'unsupported'
  return Notification.permission
}

export function prefEnabled(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === 'on'
  } catch {
    return false
  }
}

export function setPref(on: boolean): void {
  try {
    localStorage.setItem(PREF_KEY, on ? 'on' : 'off')
  } catch {
    // Preference is best-effort; notifications still work for this session.
  }
}

/** One-click enable. Must run on a user tap. Returns the resulting state. */
export async function enableNotifications(): Promise<'granted' | 'denied' | 'unsupported'> {
  if (!notifySupported()) return 'unsupported'
  if (Notification.permission === 'granted') {
    setPref(true)
    return 'granted'
  }
  try {
    const result = await Notification.requestPermission()
    if (result === 'granted') setPref(true)
    return result === 'granted' ? 'granted' : 'denied'
  } catch {
    return 'denied'
  }
}

/** Fire-and-forget local notification. Silent no-op unless enabled + granted. */
export async function pushLocal(title: string, body: string, tag = 'hts-event'): Promise<void> {
  try {
    if (!prefEnabled() || !notifySupported() || Notification.permission !== 'granted') return
    const options = {
      body,
      icon: ICON,
      badge: ICON,
      vibrate: [100, 50, 100],
      tag,
      renotify: true,
      data: { url: '/' },
    }
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready
      await registration.showNotification(title, options)
      return
    }
    new Notification(title, options)
  } catch {
    // Notifications must never break app flow.
  }
}
