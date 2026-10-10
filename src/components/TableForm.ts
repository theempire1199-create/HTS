import type { ToastOptions } from '../index'
import { focusFast } from '../PerformanceLayer'
import { tableStore } from '../store/TableStore'

export interface TableFormEvents {
  toast: (options: ToastOptions) => void
  onDone: () => void
}

/** Pehli tap (empty table): pax + optional mobile/email → Done = occupy. */
export class TableForm {
  private readonly events: TableFormEvents
  private root: HTMLElement | null = null
  private listeners: AbortController | null = null
  private tableNo = 1

  constructor(events: TableFormEvents) {
    this.events = events
  }

  open(slot: HTMLElement, tableNo: number): void {
    this.destroy()
    this.tableNo = tableNo
    slot.innerHTML = `
      <div class="sheet" data-sheet>
        <div class="sheet-card" role="dialog" aria-modal="true" aria-label="Table ${tableNo} entry">
          <div class="sheet-head"><h2>Table ${tableNo}</h2><button type="button" class="drawer-close" data-close aria-label="Close">✕</button></div>
          <p class="sheet-sub">Pax only — 10 sec me done</p>
          <form class="gf" novalidate>
            <div class="gf-field" data-field="pax">Pax *
              <div class="gf-stepper">
                <button type="button" data-gf="pax-minus" aria-label="Fewer guests">−</button>
                <input name="pax" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off"
                  autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="next"
                  maxlength="3" placeholder="2" value="2">
                <button type="button" data-gf="pax-plus" aria-label="More guests">+</button>
              </div>
            </div>
            <div class="gf-chips" role="group" aria-label="Quick pax">
              ${[1, 2, 4, 6].map(n => `<button type="button" class="gf-chip" data-gf="pax-chip" data-pax="${n}">${n}</button>`).join('')}
            </div>
            <label class="gf-field" data-field="mobile">Mobile <em>(optional)</em>
              <input name="mobile" type="tel" inputmode="numeric" autocomplete="tel"
                autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="next"
                maxlength="12" placeholder="10-digit number">
            </label>
            <label class="gf-field" data-field="email">Email <em>(if guest provides)</em>
              <input name="email" type="email" inputmode="email" autocomplete="email"
                autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done"
                maxlength="80" placeholder="guest@email.com">
            </label>
            <button class="gf-save" type="submit">Done</button>
          </form>
        </div>
      </div>
    `
    this.root = slot.querySelector('[data-sheet]')
    if (!this.root) return
    const ac = new AbortController()
    this.listeners = ac
    const signal = ac.signal

    this.root.addEventListener('submit', (event) => {
      event.preventDefault()
      this.done()
    }, { signal })

    this.root.addEventListener('input', (event) => {
      const input = event.target
      if (!(input instanceof HTMLInputElement)) return
      if (input.name === 'pax' || input.name === 'mobile') {
        const clean = input.value.replace(/\D/g, '')
        if (clean !== input.value) input.value = clean
        if (input.name === 'pax') this.markPaxChip(input.value)
      }
      input.closest('.gf-field')?.classList.remove('err')
    }, { signal })

    this.root.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return
      const input = event.target
      if (!(input instanceof HTMLInputElement)) return
      event.preventDefault()
      const fields = Array.from(this.root?.querySelectorAll<HTMLInputElement>('.gf-field input') ?? [])
      const next = fields[fields.indexOf(input) + 1]
      if (next) focusFast(next)
      else this.done()
    }, { signal })

    this.root.addEventListener('click', (event) => {
      const el = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-close],[data-gf]') : null
      if (!el) return
      if (el.hasAttribute('data-close')) { this.events.onDone(); return }
      const pax = this.root?.querySelector<HTMLInputElement>('input[name="pax"]')
      if (!pax) return
      const value = Number(pax.value) || 0
      if (el.dataset.gf === 'pax-minus') this.setPax(Math.max(1, value - 1))
      if (el.dataset.gf === 'pax-plus') this.setPax(Math.min(999, value + 1))
      if (el.dataset.gf === 'pax-chip') this.setPax(Number(el.dataset.pax) || 2)
    }, { signal })

    this.markPaxChip('2')
    const first = this.root.querySelector<HTMLInputElement>('input[name="pax"]')
    if (first) {
      first.select()
      focusFast(first)
    }
  }

  destroy(): void {
    this.listeners?.abort()
    this.listeners = null
    this.root = null
  }

  private setPax(value: number): void {
    const pax = this.root?.querySelector<HTMLInputElement>('input[name="pax"]')
    if (!pax) return
    pax.value = String(value)
    pax.closest('.gf-field')?.classList.remove('err')
    this.markPaxChip(pax.value)
  }

  private markPaxChip(value: string): void {
    this.root?.querySelectorAll<HTMLElement>('.gf-chip').forEach(chip => {
      chip.classList.toggle('on', chip.dataset.pax === value)
    })
  }

  private done(): void {
    if (!this.root) return
    const pax = this.root.querySelector<HTMLInputElement>('input[name="pax"]')
    const mobile = this.root.querySelector<HTMLInputElement>('input[name="mobile"]')
    const email = this.root.querySelector<HTMLInputElement>('input[name="email"]')
    if (!pax || !mobile || !email) return

    let ok = true
    const flag = (input: HTMLInputElement): void => {
      input.closest('.gf-field')?.classList.add('err')
      ok = false
    }
    const paxNum = Number(pax.value)
    if (!/^\d{1,3}$/.test(pax.value) || paxNum < 1) flag(pax)

    let digits = mobile.value.replace(/\D/g, '')
    if (digits.startsWith('91') && digits.length === 12) digits = digits.slice(2)
    if (mobile.value.trim() && digits.length !== 10) flag(mobile)

    const mail = email.value.trim()
    if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) flag(email)

    if (!ok) {
      this.events.toast({ message: 'Pax check karo.', type: 'error' })
      this.root.querySelector<HTMLElement>('.gf-field.err input')?.focus({ preventScroll: true })
      return
    }

    tableStore.occupy(this.tableNo, { pax: paxNum, mobile: digits, email: mail })
    this.events.toast({ message: `✅ Table ${this.tableNo} · ${paxNum} pax`, type: 'success' })
    this.events.onDone()
  }
}
