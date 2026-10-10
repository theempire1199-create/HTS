import type { ToastOptions } from '../index'
import { tableStore } from '../store/TableStore'

export interface TableDetailEvents {
  toast: (options: ToastOptions) => void
  onDone: () => void
}

const money = (n: number): string => `₹${n.toLocaleString('en-IN')}`

/** Occupied table ki tap: items, jain/spice, allergen/complaint, info, bill. */
export class TableDetail {
  private readonly events: TableDetailEvents
  private root: HTMLElement | null = null
  private listeners: AbortController | null = null
  private unsubscribe: (() => void) | null = null
  private tableNo = 1

  constructor(events: TableDetailEvents) {
    this.events = events
  }

  open(slot: HTMLElement, tableNo: number): void {
    this.destroy()
    this.tableNo = tableNo
    const table = tableStore.get(tableNo)
    slot.innerHTML = `
      <div class="sheet" data-sheet>
        <div class="sheet-card wide" role="dialog" aria-modal="true" aria-label="Table ${tableNo} details">
          <div class="sheet-head">
            <h2>Table ${tableNo}</h2>
            <button type="button" class="drawer-close" data-close aria-label="Close">✕</button>
          </div>
          <p class="sheet-sub" data-info-line></p>

          <div class="dsec"><h3>Info</h3>
            <div class="gf-row3">
              <label class="gf-field">Pax<input name="pax" type="text" inputmode="numeric" maxlength="3" value="${table.pax}"></label>
              <label class="gf-field">Mobile<input name="mobile" type="tel" inputmode="numeric" maxlength="12" value="${table.mobile}" placeholder="—"></label>
              <label class="gf-field">Email<input name="email" type="email" maxlength="80" value="${table.email}" placeholder="—"></label>
            </div>
            <button type="button" class="btn-ghost" data-act="info-save">Update info</button>
          </div>

          <div class="dsec"><h3>Items <span data-items-count></span></h3>
            <div class="items" data-items></div>
            <div class="gf-row3">
              <label class="gf-field">Item<input name="item-name" type="text" maxlength="40" autocomplete="off" placeholder="e.g. Paneer"></label>
              <label class="gf-field">Qty<input name="item-qty" type="text" inputmode="numeric" maxlength="3" value="1"></label>
              <label class="gf-field">Price ₹<input name="item-price" type="text" inputmode="numeric" maxlength="6" placeholder="0"></label>
            </div>
            <button type="button" class="btn-ghost" data-act="item-add">+ Add item</button>
          </div>

          <div class="dsec"><h3>Preference</h3>
            <div class="chips" data-diet>
              <button type="button" class="gf-chip" data-diet-v="jain">Jain</button>
              <button type="button" class="gf-chip" data-diet-v="non-jain">Non-Jain</button>
            </div>
            <div class="chips spice" data-spice>
              <button type="button" class="gf-chip" data-spice-v="mild">Mild</button>
              <button type="button" class="gf-chip" data-spice-v="medium">Medium</button>
              <button type="button" class="gf-chip" data-spice-v="hot">Hot 🌶</button>
            </div>
          </div>

          <div class="dsec"><h3>Allergen / Complaint</h3>
            <div class="gf-row2">
              <label class="gf-field">Allergen<input name="allergen" type="text" maxlength="60" autocomplete="off" placeholder="e.g. peanut"></label>
              <label class="gf-field">Complaint<input name="complaint" type="text" maxlength="120" autocomplete="off" placeholder="e.g. late serve"></label>
            </div>
            <div class="gf-row2">
              <button type="button" class="btn-ghost" data-act="allergen-add">+ Allergen</button>
              <button type="button" class="btn-ghost" data-act="complaint-add">+ Complaint</button>
            </div>
            <div class="notes" data-notes></div>
          </div>

          <div class="dsec bill" data-bill></div>
        </div>
      </div>
    `
    this.root = slot.querySelector('[data-sheet]')
    if (!this.root) return
    const ac = new AbortController()
    this.listeners = ac
    const signal = ac.signal

    this.root.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null
      if (!target) return
      if (target.classList.contains('sheet')) { this.events.onDone(); return }
      const el = target.closest<HTMLElement>('[data-close],[data-act],[data-diet-v],[data-spice-v],[data-remove]')
      if (!el) return
      if (el.hasAttribute('data-close')) { this.events.onDone(); return }
      if (el.hasAttribute('data-remove')) { tableStore.removeItem(this.tableNo, Number(el.dataset.remove) || 0); return }
      if (el.hasAttribute('data-diet-v')) {
        const tableNow = tableStore.get(this.tableNo)
        const value = el.dataset.dietV === 'jain' ? 'jain' : 'non-jain'
        tableStore.setDiet(this.tableNo, tableNow.diet === value ? null : value)
        return
      }
      if (el.hasAttribute('data-spice-v')) {
        const tableNow = tableStore.get(this.tableNo)
        const value = (el.dataset.spiceV ?? 'mild') as 'mild' | 'medium' | 'hot'
        tableStore.setSpice(this.tableNo, tableNow.spice === value ? null : value)
        return
      }
      const act = el.dataset.act
      if (act === 'info-save') this.saveInfo()
      if (act === 'item-add') this.addItem()
      if (act === 'allergen-add') this.addNote('allergen')
      if (act === 'complaint-add') this.addNote('complaint')
      if (act === 'bill') tableStore.markBill(this.tableNo)
      if (act === 'bill-back') tableStore.backToActive(this.tableNo)
      if (act === 'bill-confirm') this.checkout()
    }, { signal })

    this.root.addEventListener('input', (event) => {
      const input = event.target
      if (!(input instanceof HTMLInputElement)) return
      if (['pax', 'mobile', 'item-qty', 'item-price'].includes(input.name)) {
        const clean = input.value.replace(/\D/g, '')
        if (clean !== input.value) input.value = clean
      }
      input.closest('.gf-field')?.classList.remove('err')
    }, { signal })

    this.unsubscribe = tableStore.subscribe(() => this.refresh())
    this.refresh()
  }

  destroy(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.listeners?.abort()
    this.listeners = null
    this.root = null
  }

  private refresh(): void {
    if (!this.root) return
    const table = tableStore.get(this.tableNo)
    if (table.status === 'empty') { this.events.onDone(); return }

    const infoLine = this.root.querySelector('[data-info-line]')
    if (infoLine) {
      const bits = [`${table.pax} pax`, table.status === 'bill' ? 'bill ready' : 'active']
      if (table.mobile) bits.push(table.mobile)
      if (table.diet) bits.push(table.diet === 'jain' ? 'Jain' : 'Non-Jain')
      if (table.spice) bits.push(table.spice)
      infoLine.textContent = bits.join(' · ')
    }

    const count = this.root.querySelector('[data-items-count]')
    if (count) count.textContent = table.items.length ? `(${table.items.length})` : ''
    const items = this.root.querySelector('[data-items]')
    if (items) {
      items.innerHTML = table.items.length ? table.items.map(item => `
        <div class="item-row">
          <span class="item-name">${escapeHtml(item.name)} <b>×${item.qty}</b></span>
          <span class="item-price">${money(item.qty * item.price)}</span>
          <button type="button" class="item-x" data-remove="${item.id}" aria-label="Remove ${escapeHtml(item.name)}">✕</button>
        </div>
      `).join('') : '<p class="dim">No items yet — jitni baar chaho add karo.</p>'
    }

    this.root.querySelectorAll<HTMLElement>('[data-diet-v]').forEach(chip => {
      chip.classList.toggle('on', (chip.dataset.dietV === 'jain' ? 'jain' : 'non-jain') === table.diet)
    })
    this.root.querySelectorAll<HTMLElement>('[data-spice-v]').forEach(chip => {
      chip.classList.toggle('on', chip.dataset.spiceV === table.spice)
    })

    const notes = this.root.querySelector('[data-notes]')
    if (notes) {
      notes.innerHTML = table.notes.length ? table.notes.map(note => `
        <div class="note-row"><span class="note-kind ${note.kind}">${note.kind}</span><span>${escapeHtml(note.text)}</span></div>
      `).join('') : ''
    }

    const bill = this.root.querySelector('[data-bill]')
    if (bill) {
      if (table.status === 'bill') {
        bill.innerHTML = `
          <div class="bill-preview">
            <div class="bill-total">${money(tableStore.totalOf(table))}</div>
            <p class="dim">${table.items.length} items · ${table.pax} pax · Table ${table.no}</p>
            <div class="gf-row2">
              <button type="button" class="btn-ghost" data-act="bill-back">Back</button>
              <button type="button" class="gf-save" data-act="bill-confirm">Confirm Bill</button>
            </div>
          </div>`
      } else {
        bill.innerHTML = `<button type="button" class="btn-danger" data-act="bill">Bill — close table</button>`
      }
    }
  }

  private saveInfo(): void {
    if (!this.root) return
    const paxInput = this.root.querySelector<HTMLInputElement>('input[name="pax"]')
    const mobileInput = this.root.querySelector<HTMLInputElement>('input[name="mobile"]')
    const emailInput = this.root.querySelector<HTMLInputElement>('input[name="email"]')
    if (!paxInput || !mobileInput || !emailInput) return
    let ok = true
    const paxNum = Number(paxInput.value)
    if (!/^\d{1,3}$/.test(paxInput.value) || paxNum < 1) {
      paxInput.closest('.gf-field')?.classList.add('err')
      ok = false
    }
    let digits = mobileInput.value.replace(/\D/g, '')
    if (digits.startsWith('91') && digits.length === 12) digits = digits.slice(2)
    if (mobileInput.value.trim() && digits.length !== 10) {
      mobileInput.closest('.gf-field')?.classList.add('err')
      ok = false
    }
    const mail = emailInput.value.trim()
    if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      emailInput.closest('.gf-field')?.classList.add('err')
      ok = false
    }
    if (!ok) {
      this.events.toast({ message: 'Info check karo.', type: 'error' })
      return
    }
    tableStore.updateInfo(this.tableNo, { pax: paxNum, mobile: digits, email: mail })
    this.events.toast({ message: '✅ Info updated.', type: 'success' })
  }

  private addItem(): void {
    if (!this.root) return
    const nameInput = this.root.querySelector<HTMLInputElement>('input[name="item-name"]')
    const qtyInput = this.root.querySelector<HTMLInputElement>('input[name="item-qty"]')
    const priceInput = this.root.querySelector<HTMLInputElement>('input[name="item-price"]')
    if (!nameInput || !qtyInput || !priceInput) return
    const name = nameInput.value.trim()
    const qty = Math.max(1, Number(qtyInput.value) || 1)
    const price = Math.max(0, Number(priceInput.value) || 0)
    if (!name) {
      nameInput.closest('.gf-field')?.classList.add('err')
      nameInput.focus()
      return
    }
    tableStore.addItem(this.tableNo, { name, qty, price })
    nameInput.value = ''
    qtyInput.value = '1'
    priceInput.value = ''
    nameInput.focus()
  }

  private addNote(kind: 'allergen' | 'complaint'): void {
    if (!this.root) return
    const input = this.root.querySelector<HTMLInputElement>(`input[name="${kind}"]`)
    if (!input) return
    const text = input.value.trim()
    if (!text) {
      input.closest('.gf-field')?.classList.add('err')
      input.focus()
      return
    }
    tableStore.addNote(this.tableNo, kind, text)
    input.value = ''
    this.events.toast({ message: `✅ ${kind === 'allergen' ? 'Allergen' : 'Complaint'} noted.`, type: 'success' })
  }

  private checkout(): void {
    const record = tableStore.checkout(this.tableNo)
    if (!record) return
    this.events.toast({ message: `✅ Table ${record.table} closed · ${money(record.total)}`, type: 'success' })
    this.events.onDone()
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[<>&"]/g, (char) => {
    if (char === '<') return '&lt;'
    if (char === '>') return '&gt;'
    if (char === '&') return '&amp;'
    return '&quot;'
  })
}
