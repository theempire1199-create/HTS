export interface ClientContext {
  source: string
  referrer: string
  userAgent: string
  platform: string
  language: string
  timezone: string
  screen: string
}

export const unknownClientContext: ClientContext = {
  source: 'unknown',
  referrer: 'unknown',
  userAgent: 'unknown',
  platform: 'unknown',
  language: 'unknown',
  timezone: 'unknown',
  screen: 'unknown',
}

export function getClientContext(): ClientContext {
  const browserScreen = typeof screen === 'undefined' ? 'unknown' : `${screen.width}×${screen.height}`
  let timezone = 'unknown'
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown'
  } catch {
    // Some restricted browsers do not expose timezone information.
  }
  return {
    source: window.location.hostname || 'local',
    referrer: document.referrer || 'Direct',
    userAgent: navigator.userAgent || 'unknown',
    platform: navigator.platform || 'unknown',
    language: navigator.language || 'unknown',
    timezone,
    screen: browserScreen,
  }
}
