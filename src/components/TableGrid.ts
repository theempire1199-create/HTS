import { tableStore, type TableState } from '../store/TableStore'

function badge(status: TableState['status']): string {
  if (status === 'active') return '<span class="tc-badge is-active"><i></i>Active</span>'
  if (status === 'bill') return '<span class="tc-badge is-bill"><i></i>Bill</span>'
  return '<span class="tc-badge is-empty"><i></i>Empty</span>'
}

function cardClass(status: TableState['status']): string {
  if (status === 'active') return 'is-active'
  if (status === 'bill') return 'is-bill'
  return 'is-empty'
}

/** 20 table cards — status + pax at a glance, tap to open. */
export class TableGrid {
  private root: HTMLElement | null = null
  private unsubscribe: (() => void) | null = null
  private readonly onTap: (no: number) => void

  constructor(onTap: (no: number) => void) {
    this.onTap = onTap
  }

  mount(slot: HTMLElement): void {
    this.destroy()
    slot.innerHTML = '<div class="tables-grid" role="grid" aria-label="Tables"></div>'
    this.root = slot.querySelector('.tables-grid')
    this.paint()
    this.unsubscribe = tableStore.subscribe(() => this.paint())
    this.root?.addEventListener('click', (event) => {
      const card = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-table]') : null
      if (!card) return
      this.onTap(Number(card.dataset.table) || 1)
    })
  }

  destroy(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.root = null
  }

  private paint(): void {
    if (!this.root) return
    this.root.innerHTML = tableStore.list().map((table) => `
      <button type="button" class="table-card ${cardClass(table.status)}" data-table="${table.no}" role="gridcell" aria-label="Table ${table.no}, ${table.status}, ${table.pax} guests">
        <span class="tc-no">T-${table.no}</span>
        ${badge(table.status)}
        <span class="tc-pax">${table.status === 'empty' ? '—' : `${table.pax} pax`}</span>
      </button>
    `).join('')
  }
}
