import type { ToastOptions } from '../index'
import { MENU_ICON } from '../utils/icons'
import { tableStore } from '../store/TableStore'
import { ActivityView } from '../components/ActivityView'
import { TableDetail } from '../components/TableDetail'
import { TableForm } from '../components/TableForm'
import { TableGrid } from '../components/TableGrid'

export interface MainScreenEvents {
  toast: (options: ToastOptions) => void
}

type MainView = 'grid' | 'activity'

/** Main screen: sticky HTS.OS bar + content (tables/activity) + drawer + sheets. */
export class MainScreen {
  private readonly container: HTMLElement
  private readonly events: MainScreenEvents
  private readonly profilePhoto = '/IMG-20261008-WA6370.jpg'
  private view: MainView = 'grid'
  private grid: TableGrid | null = null
  private activity: ActivityView | null = null
  private form: TableForm | null = null
  private detail: TableDetail | null = null

  constructor(container: HTMLElement, events: MainScreenEvents) {
    this.container = container
    this.events = events
  }

  render(): void {
    const mount = this.container.querySelector<HTMLElement>('.work-progress-screen')
    if (!mount) return
    this.teardownContent()
    mount.innerHTML = `
      <div class="main-top">
        <div class="main-topbar">
          <button class="icon-btn" type="button" data-action="menu" aria-label="Open menu">${MENU_ICON}</button>
          <span class="main-brand">HTS.OS</span>
          <button class="icon-btn profile-btn" type="button" data-action="profile" aria-label="Profile"><img class="profile-photo" src="${this.profilePhoto}" alt="Profile photo"></button>
        </div>
      </div>
      <div class="main-content" data-content></div>
      <div class="sheet-root" data-sheet-root></div>
      <div class="drawer-scrim" data-action="drawer-close" hidden></div>
      <aside class="drawer" aria-label="Menu" hidden>
        <div class="drawer-head"><span>Menu</span><button class="drawer-close" type="button" data-action="drawer-close" aria-label="Close menu">✕</button></div>
        <button class="drawer-item" type="button" data-action="dashboard">Dashboard</button>
        <button class="drawer-item" type="button" data-action="activity">Activity</button>
      </aside>`
    this.paintContent()
  }

  openActivity(): void {
    this.closeDrawer()
    this.view = 'activity'
    this.paintContent()
  }

  openDashboard(): void {
    this.closeDrawer()
    // Dashboard isi activity log se fetch karega — view jald aa raha hai.
    this.events.toast({ message: 'Dashboard coming soon.', type: 'info' })
    if (this.view !== 'grid') {
      this.view = 'grid'
      this.paintContent()
    }
  }

  openProfile(): void {
    this.events.toast({ message: 'Profile coming soon.', type: 'info' })
  }

  openDrawer(): void {
    const drawer = this.container.querySelector<HTMLElement>('.drawer')
    const scrim = this.container.querySelector<HTMLElement>('.drawer-scrim')
    if (!drawer || !scrim) return
    drawer.hidden = false
    scrim.hidden = false
    void drawer.offsetWidth
    drawer.classList.add('open')
    scrim.classList.add('show')
  }

  /** Returns true when a drawer was open and got closed. */
  closeDrawer(): boolean {
    const drawer = this.container.querySelector<HTMLElement>('.drawer')
    const scrim = this.container.querySelector<HTMLElement>('.drawer-scrim')
    if (!drawer || !scrim || drawer.hidden) return false
    drawer.classList.remove('open')
    scrim.classList.remove('show')
    drawer.hidden = true
    scrim.hidden = true
    return true
  }

  /** Returns true when a table sheet was open and got closed. */
  closeSheet(): boolean {
    const root = this.container.querySelector<HTMLElement>('[data-sheet-root]')
    if (!root || !root.firstChild) return false
    this.form?.destroy()
    this.detail?.destroy()
    this.form = null
    this.detail = null
    root.innerHTML = ''
    return true
  }

  destroy(): void {
    this.teardownContent()
    this.closeSheet()
  }

  private paintContent(): void {
    const mount = this.container.querySelector<HTMLElement>('.work-progress-screen')
    const content = mount?.querySelector<HTMLElement>('[data-content]')
    if (!content) return
    this.teardownContent()
    if (this.view === 'activity') {
      this.activity = new ActivityView(() => {
        this.view = 'grid'
        this.paintContent()
      })
      this.activity.mount(content)
      return
    }
    this.grid = new TableGrid((no) => this.openTable(no))
    this.grid.mount(content)
  }

  private openTable(no: number): void {
    const root = this.container.querySelector<HTMLElement>('[data-sheet-root]')
    if (!root) return
    const close = (): void => { this.closeSheet() }
    const toast = (options: ToastOptions): void => this.events.toast(options)
    if (tableStore.get(no).status === 'empty') {
      this.closeSheet()
      this.form = new TableForm({ toast, onDone: close })
      this.form.open(root, no)
    } else {
      this.closeSheet()
      this.detail = new TableDetail({ toast, onDone: close })
      this.detail.open(root, no)
    }
  }

  private teardownContent(): void {
    this.grid?.destroy()
    this.grid = null
    this.activity?.destroy()
    this.activity = null
  }
}
