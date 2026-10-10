import { tableStore } from '../store/TableStore'

function timeOf(at: number): string {
  try {
    return new Date(at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  } catch {
    return ''
  }
}

/** Drawer → Activity: closed bills ka record (dashboard bhi yahi fetch karega). */
export class ActivityView {
  private root: HTMLElement | null = null
  private unsubscribe: (() => void) | null = null
  private readonly onBack: () => void

  constructor(onBack: () => void) {
    this.onBack = onBack
  }

  mount(slot: HTMLElement): void {
    this.destroy()
    slot.innerHTML = `
      <div class="act-wrap">
        <div class="act-head">
          <button type="button" class="icon-btn sm" data-back aria-label="Back to tables">←</button>
          <h2>Activity</h2>
        </div>
        <div class="act-list" data-list></div>
      </div>`
    this.root = slot.querySelector('.act-wrap')
    this.root?.addEventListener('click', (event) => {
      const back = event.target instanceof Element ? event.target.closest('[data-back]') : null
      if (back) this.onBack()
    })
    this.unsubscribe = tableStore.subscribe(() => this.paint())
    this.paint()
  }

  destroy(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.root = null
  }

  private paint(): void {
    const list = this.root?.querySelector('[data-list]')
    if (!list) return
    const records = tableStore.activityList()
    if (!records.length) {
      list.innerHTML = '<p class="dim pad">No closed bills yet — Bill confirm hote hi yahan save hoga.</p>'
      return
    }
    list.innerHTML = records.map(record => {
      const extras: string[] = []
      if (record.diet) extras.push(record.diet === 'jain' ? 'Jain' : 'Non-Jain')
      if (record.spice) extras.push(record.spice)
      if (record.notes.length) extras.push(`${record.notes.length} notes`)
      return `
        <div class="act-card">
          <div class="act-top"><b>Table ${record.table}</b><span class="act-total">₹${record.total.toLocaleString('en-IN')}</span></div>
          <div class="act-meta">${record.pax} pax · ${record.items.length} items${extras.length ? ` · ${extras.join(' · ')}` : ''}</div>
          <div class="act-meta dim">${timeOf(record.closedAt)}</div>
        </div>`
    }).join('')
  }
}
