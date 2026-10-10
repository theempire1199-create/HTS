/** Single-user local notifications. No server, no push service, one-click on/off. */

import { NOTIFY_PREF_KEY } from './utils/constants'

const ICON = '/icons/icon-192.png'
const STORAGE_UNAVAILABLE_EVENT = 'hts:storage-unavailable'

/** Notify the UI that a localStorage write failed (quota / private mode). */
export function reportStorageUnavailable(): void {
  try {
    window.dispatchEvent(new CustomEvent(STORAGE_UNAVAILABLE_EVENT))
  } catch {
    // Event dispatch is best-effort; callers also show a toast directly when possible.
  }
}

/** Subscribe to storage-unavailable signals. Returns an unsubscribe function. */
export function onStorageUnavailable(listener: () => void): () => void {
  window.addEventListener(STORAGE_UNAVAILABLE_EVENT, listener)
  return () => window.removeEventListener(STORAGE_UNAVAILABLE_EVENT, listener)
}

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
    return localStorage.getItem(NOTIFY_PREF_KEY) === 'on'
  } catch {
    return false
  }
}

export function setPref(on: boolean): void {
  try {
    localStorage.setItem(NOTIFY_PREF_KEY, on ? 'on' : 'off')
  } catch {
    // Preference is best-effort; notifications still work for this session.
    reportStorageUnavailable()
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
