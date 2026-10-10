import type { ClientContext } from '../ClientContext'
import { unknownClientContext } from '../ClientContext'
import { authDB } from '../AuthDB'
import { getLoginDetails, type LoginDetailRecord } from '../LoginDetails'
import { getSignupDetails, type SignupDetailRecord } from '../SignupDetails'
import './admin.css'

type AdminTab = 'joins' | 'logins'

const app = document.querySelector<HTMLElement>('#admin-app')
if (!app) throw new Error('Admin root #admin-app was not found.')
const adminRoot = app

const state: { tab: AdminTab; search: string } = { tab: 'joins', search: '' }

function escapeHTML(value: string): string {
  return value.replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] || character)
}

function formatDate(value: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(value)
}

function contextText(context: ClientContext): string {
  return `${context.platform} · ${context.screen} · ${context.timezone}`
}

function contextDetails(context: ClientContext): string {
  return `Source: ${context.source}\nReferrer: ${context.referrer}\nBrowser: ${context.userAgent}\nLanguage: ${context.language}\nPlatform: ${context.platform}\nScreen: ${context.screen}\nTimezone: ${context.timezone}`
}

function matchesSearch(values: string[]): boolean {
  const needle = state.search.trim().toLowerCase()
  return !needle || values.some(value => value.toLowerCase().includes(needle))
}

function signupRows(records: SignupDetailRecord[]): string {
  const filtered = records.filter(record => matchesSearch([record.name, record.email, record.contact, record.context.source, record.context.referrer, record.context.platform]))
  if (!filtered.length) return '<tr><td class="empty-cell" colspan="5">No signup records found.</td></tr>'
  return filtered.map(record => `
    <tr>
      <td><strong>${escapeHTML(record.name)}</strong><small>${escapeHTML(record.email)}</small></td>
      <td>${escapeHTML(record.contact)}</td>
      <td><strong>${escapeHTML(record.context.source)}</strong><small>${escapeHTML(record.context.referrer)}</small></td>
      <td title="${escapeHTML(contextDetails(record.context))}">${escapeHTML(contextText(record.context))}<small>${escapeHTML(record.context.language)}</small></td>
      <td>${escapeHTML(formatDate(record.signedUpAt))}</td>
    </tr>`).join('')
}

function loginRows(records: LoginDetailRecord[]): string {
  const filtered = records.filter(record => matchesSearch([record.identifier, record.context.source, record.context.referrer, record.context.platform]))
  if (!filtered.length) return '<tr><td class="empty-cell" colspan="4">No login records found.</td></tr>'
  return filtered.map(record => `
    <tr>
      <td><strong>${escapeHTML(record.identifier)}</strong></td>
      <td><strong>${escapeHTML(record.context.source)}</strong><small>${escapeHTML(record.context.referrer)}</small></td>
      <td title="${escapeHTML(contextDetails(record.context))}">${escapeHTML(contextText(record.context))}<small>${escapeHTML(record.context.language)}</small></td>
      <td>${escapeHTML(formatDate(record.loggedInAt))}</td>
    </tr>`).join('')
}

function render(): void {
  const activeElement = document.activeElement
  const focusedSearch = activeElement instanceof HTMLInputElement && activeElement.id === 'admin-search'
  const cursor = focusedSearch ? activeElement.selectionStart : null
  const accountUsers = authDB.listUsers()
  const detailedSignups = getSignupDetails()
  const signups: SignupDetailRecord[] = accountUsers.map(user => {
    const detail = detailedSignups.find(record => record.email === user.email)
    return detail || {
      name: user.name,
      contact: user.contact,
      email: user.email,
      signedUpAt: user.createdAt,
      context: unknownClientContext,
    }
  }).sort((a, b) => b.signedUpAt - a.signedUpAt)
  const detailedLogins = getLoginDetails()
  const logins: LoginDetailRecord[] = authDB.listLoginEvents().map(event => {
    const account = accountUsers.find(user => user.id === event.userId)
    const identifier = account?.email || event.userId
    const detail = detailedLogins.find(record => record.identifier.toLowerCase() === identifier.toLowerCase() && Math.abs(record.loggedInAt - event.timestamp) < 5000)
    return detail || { identifier, loggedInAt: event.timestamp, context: unknownClientContext }
  })
  const latestSignup = signups[0]
  const latestLogin = logins[0]
  adminRoot.innerHTML = `
    <div class="admin-shell">
      <header class="admin-header">
        <div>
          <p class="admin-kicker">HASAN TECH STUDIO</p>
          <h1>Admin Panel</h1>
          <p class="admin-subtitle">A lightweight identity activity dashboard</p>
        </div>
        <button class="refresh-button" type="button" data-action="refresh">↻ Refresh</button>
      </header>

      <section class="metric-grid" aria-label="Overview">
        <article class="metric-card"><span>Joined</span><strong>${signups.length}</strong><small>${latestSignup ? `Last: ${escapeHTML(latestSignup.name)}` : 'No signups yet'}</small></article>
        <article class="metric-card"><span>Login events</span><strong>${logins.length}</strong><small>${latestLogin ? `Last: ${escapeHTML(latestLogin.identifier)}` : 'No logins yet'}</small></article>
        <article class="metric-card"><span>Latest source</span><strong>${escapeHTML(latestSignup?.context.source || '—')}</strong><small>${latestSignup ? escapeHTML(latestSignup.context.timezone) : 'Waiting for activity'}</small></article>
        <article class="metric-card"><span>Storage</span><strong>LOCAL</strong><small>Same browser and origin</small></article>
      </section>

      <section class="data-panel">
        <div class="panel-toolbar">
          <div class="tabs" role="tablist" aria-label="Activity type">
            <button class="tab ${state.tab === 'joins' ? 'is-active' : ''}" type="button" data-tab="joins">Who joined <b>${signups.length}</b></button>
            <button class="tab ${state.tab === 'logins' ? 'is-active' : ''}" type="button" data-tab="logins">Login activity <b>${logins.length}</b></button>
          </div>
          <label class="search-box"><span>⌕</span><input id="admin-search" value="${escapeHTML(state.search)}" placeholder="Search details" autocomplete="off"></label>
        </div>
        <div class="table-wrap">
          ${state.tab === 'joins' ? `
            <table><thead><tr><th>Member</th><th>Contact</th><th>Where from</th><th>Device</th><th>Joined</th></tr></thead><tbody>${signupRows(signups)}</tbody></table>` : `
            <table><thead><tr><th>Identifier</th><th>Where from</th><th>Device</th><th>Logged in</th></tr></thead><tbody>${loginRows(logins)}</tbody></table>`}
        </div>
        <p class="privacy-note">Local browser dashboard • opens records from this exact origin • passwords and secret values are never displayed or collected.</p>
      </section>
    </div>`
  if (focusedSearch) {
    const nextInput = adminRoot.querySelector<HTMLInputElement>('#admin-search')
    nextInput?.focus()
    const nextCursor = cursor ?? nextInput?.value.length ?? 0
    nextInput?.setSelectionRange(nextCursor, nextCursor)
  }
}

adminRoot.addEventListener('click', event => {
  const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-action],[data-tab]') : null
  if (!target) return
  if (target.dataset.action === 'refresh') render()
  const tab = target.dataset.tab
  if (tab === 'joins' || tab === 'logins') {
    state.tab = tab
    render()
  }
})

adminRoot.addEventListener('input', event => {
  const input = event.target
  if (!(input instanceof HTMLInputElement) || input.id !== 'admin-search') return
  state.search = input.value
  render()
})

render()
window.setInterval(render, 4000)
