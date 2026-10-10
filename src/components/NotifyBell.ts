const BELL_OFF_ICON = '<svg class="bell-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.7 3A6 6 0 0 1 18 8c0 4 1.4 6.3 2.3 7.5"/><path d="M6.3 6.3C6.1 6.9 6 7.4 6 8c0 7-3 9-3 9h14"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><line x1="2" y1="2" x2="22" y2="22"/></svg>'

export function renderNotifyBell(): string {
  return `
    <button class="notify-bell" type="button" data-action="notify-toggle" aria-label="Enable notifications">${BELL_OFF_ICON}</button>
  `
}