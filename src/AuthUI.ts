import type { ScreenId, ToastOptions } from './index'
import { prefersReducedMotion, rafThrottle, startTimedLoop } from './PerformanceLayer'
import { currentPermission, enableNotifications, notifySupported, onStorageUnavailable, prefEnabled, pushLocal, setPref } from './Notify'
import { STORAGE_UNAVAILABLE_MESSAGE } from './utils/constants'
import { BELL_OFF_ICON, BELL_ON_ICON } from './utils/icons'
import { LockScreen } from './screens/LockScreen'
import { MainScreen } from './screens/MainScreen'

/**
 * App shell: frame render, screen router, bell/notifications, toast, mascot.
 * Screen flows live in ./screens (LockScreen, MainScreen) and wire up here.
 */
export class AuthUI {
  private readonly container: HTMLElement
  private readonly lock: LockScreen
  private readonly main: MainScreen
  private currentScreen: ScreenId = 'v-code'
  private toastTimeout: number | undefined
  private isBotAnimating = false
  private botBubbleTimer: number | undefined
  private avatarRevealTimer: number | undefined
  private avatarHideTimer: number | undefined
  private avatarCloseTimer: number | undefined
  private botFlashTimer: number | undefined
  private botFallTimer: number | undefined
  private botFallResetTimer: number | undefined
  private botIdleRevertTimer: number | undefined
  private storageUnavailableUnsubscribe: (() => void) | undefined
  private containerClickHandler: ((event: Event) => void) | undefined
  private initialized = false
  private stopBotIdleAnimation: (() => void) | undefined
  private cancelGazeThrottle: (() => void) | undefined
  private readonly companionImage = '/IMG-20261008-WA6370.jpg'

  constructor(container: HTMLElement) {
    this.container = container
    this.lock = new LockScreen(container, {
      toast: (options) => this.showToast(options),
      onUnlock: () => this.unlock(),
      onWrongCode: () => {
        this.setBotMood('worried')
        this.flashBot('bot-error')
      },
    })
    this.main = new MainScreen(container, {
      toast: (options) => this.showToast(options),
    })
  }

  init(): void {
    if (this.initialized) return
    this.initialized = true
    this.render()
    this.lock.ensureMounted()
    this.bindEvents()
    this.startBotIdleAnimation()
    this.refreshBell()
    // No splash — fingerprint/code gate opens the moment the app starts.
    this.showScreen('v-code')
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="ambient ambient-a" aria-hidden="true"></div>
      <div class="ambient ambient-b" aria-hidden="true"></div>
      <div class="ambient ambient-c" aria-hidden="true"></div>
      <header class="site-header top-head">
        <div class="brand-lockup" aria-label="HASAN TECH STUDIO — The Tech of Future">
            <span class="brand-emblem" aria-label="HTS assistant companion" role="button" tabindex="0">
              <span class="brand-ring"></span>
              <span class="brand-orb">
                <span class="companion-closed-eyes" aria-hidden="true"><i></i><i></i><b class="companion-nose"></b><b class="companion-smile"></b></span>
                <img class="companion-image" src="${this.companionImage}" alt="HASAN TECH STUDIO companion" decoding="async" fetchpriority="high" onerror="this.style.display='none'">
                <span class="bot-companion" aria-hidden="true">
                <span class="bot-antenna"><i></i></span>
                <span class="bot-hair"></span>
                <span class="bot-neck"></span><span class="bot-body"><i class="bot-panel"></i></span><i class="bot-arm bot-arm-left"></i><i class="bot-arm bot-arm-right"></i>
                <i class="bot-foot bot-foot-left"></i><i class="bot-foot bot-foot-right"></i>
                <span class="bot-ear bot-ear-left"></span><span class="bot-ear bot-ear-right"></span>
                <span class="bot-face"><i class="bot-brow bot-brow-left"></i><i class="bot-brow bot-brow-right"></i><i class="bot-eye bot-eye-left"></i><i class="bot-eye bot-eye-right"></i><i class="bot-cheek bot-cheek-left"></i><i class="bot-cheek bot-cheek-right"></i><i class="bot-sweat"></i><b class="bot-mouth"></b></span>
                <span class="bot-status" aria-hidden="true"></span>
              </span>
            </span>
            <span class="brand-shine"></span>
            <span class="companion-talk" role="status" aria-live="polite"><span class="companion-bubble"></span></span>
          </span>
          <span class="brand-name">HASAN TECH STUDIO</span>
          <span class="brand-tagline" aria-label="the tech of future .....">${this.renderTagline()}</span>
        </div>
      </header>
      <main class="auth-shell">
        <section class="view show" id="v-code" aria-label="Unlock">
          <h1 class="title">UNLOCK<small>Fingerprint ya 6-digit code se kholo</small></h1>
        </section>

        <section class="view" id="v-work-progress" aria-label="Main screen" hidden>
          <div class="work-progress-screen"></div>
        </section>

      </main>
      <footer class="site-footer"><span class="powered-by">powered by</span><b>HASAN TECHNOLOGY PVT LTD</b></footer>
      <button class="notify-bell" type="button" data-action="notify-toggle" aria-label="Enable notifications">${BELL_OFF_ICON}</button>
      <div id="toast" role="status" aria-live="polite"></div>
    `
    document.body.dataset.screen = this.currentScreen
  }

  private renderTagline(): string {
    return Array.from('the tech of future .....').map((character, index) => {
      const content = character === ' ' ? '&nbsp;' : character
      return `<span class="tagline-char" aria-hidden="true" style="--tagline-index:${index}">${content}</span>`
    }).join('')
  }

  private bindEvents(): void {
    const bot = this.container.querySelector<HTMLElement>('.brand-emblem')
    bot?.addEventListener('pointerdown', () => this.triggerBotFall())
    bot?.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') this.triggerBotFall() })
    // Gaze follows the pointer but throttled to 1 style-write per frame (no jank).
    this.cancelGazeThrottle?.()
    const gaze = rafThrottle<PointerEvent>((event) => {
      if (!bot || prefersReducedMotion()) return
      const bounds = bot.getBoundingClientRect()
      const x = Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width - .5) * 2))
      const y = Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height - .5) * 2))
      bot.style.setProperty('--gaze-x', `${x * 3}px`)
      bot.style.setProperty('--gaze-y', `${y * 2}px`)
      if (!bot.dataset.mood || bot.dataset.mood === 'idle') bot.dataset.mood = 'curious'
    })
    this.cancelGazeThrottle = gaze.cancel
    bot?.addEventListener('pointermove', gaze.handler, { passive: true })
    bot?.addEventListener('pointerleave', () => {
      bot.style.setProperty('--gaze-x', '0px')
      bot.style.setProperty('--gaze-y', '0px')
      if (bot.dataset.mood === 'curious') bot.dataset.mood = 'idle'
    })

    // Surface a friendly toast whenever any localStorage write fails.
    this.storageUnavailableUnsubscribe = onStorageUnavailable(() => {
      this.showToast({ message: STORAGE_UNAVAILABLE_MESSAGE, type: 'warning' })
    })

    this.containerClickHandler = (event) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-action]') : null
      if (!target) return
      const action = target.dataset.action
      if (action === 'show-screen') {
        const screen = target.dataset.screen
        if (screen === 'v-code' || screen === 'v-work-progress') this.showScreen(screen)
      }
      if (action === 'notify-toggle') void this.toggleNotifications()
      if (action === 'fingerprint' && this.lock.isOpen()) void this.lock.handleGateFingerprint()
      if (action === 'set-passcode') this.lock.openPasscodeSetup()
      if (action === 'lock-now') this.lockNow()
      if (action === 'menu') this.main.openDrawer()
      if (action === 'drawer-close') this.main.closeDrawer()
      if (action === 'dashboard') this.main.openDashboard()
      if (action === 'activity') this.main.openActivity()
      if (action === 'profile') this.main.openProfile()
    }
    this.container.addEventListener('click', this.containerClickHandler)

    document.addEventListener('keydown', this.handleEscape)
  }

  private readonly handleEscape = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return
    // Sheet khula ho to pehle wahi, phir drawer; main screen par Escape = lock.
    if (this.main.closeSheet()) return
    if (this.main.closeDrawer()) return
    // Lock kabhi Escape se bypass nahi hoga; main screen par Escape = lock.
    if (this.currentScreen === 'v-work-progress') this.lockNow()
  }

  private showScreen(screen: ScreenId): void {
    if (!document.getElementById(screen)) return
    this.clearTimers()
    this.refreshBell()
    // Gate overlay sirf v-code par ya setup ke liye khulta hai.
    if (screen !== 'v-code') this.lock.hidePopup()
    this.currentScreen = screen
    if (screen === 'v-code') this.lock.openGate()
    if (screen === 'v-work-progress') this.main.render()
    this.container.querySelectorAll<HTMLElement>('.view').forEach(view => {
      const active = view.id === screen
      view.classList.toggle('show', active)
      view.hidden = !active
    })
    document.body.dataset.screen = screen
    try {
      history.replaceState(null, '', `#${screen.slice(2)}`)
    } catch {
      // Hash navigation is unavailable in some sandboxed contexts; screens still switch.
    }
    this.container.querySelector<HTMLElement>(`#${screen} h1`)?.focus({ preventScroll: true })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /** Clear every pending UI timer before a screen transition or unmount. */
  private clearTimers(): void {
    if (this.botBubbleTimer !== undefined) clearTimeout(this.botBubbleTimer)
    this.botBubbleTimer = undefined
    if (this.avatarRevealTimer !== undefined) clearTimeout(this.avatarRevealTimer)
    this.avatarRevealTimer = undefined
    if (this.avatarHideTimer !== undefined) clearTimeout(this.avatarHideTimer)
    this.avatarHideTimer = undefined
    if (this.avatarCloseTimer !== undefined) clearTimeout(this.avatarCloseTimer)
    this.avatarCloseTimer = undefined
    if (this.botFlashTimer !== undefined) clearTimeout(this.botFlashTimer)
    this.botFlashTimer = undefined
    if (this.botFallTimer !== undefined) clearTimeout(this.botFallTimer)
    this.botFallTimer = undefined
    if (this.botFallResetTimer !== undefined) clearTimeout(this.botFallResetTimer)
    this.botFallResetTimer = undefined
    if (this.botIdleRevertTimer !== undefined) clearTimeout(this.botIdleRevertTimer)
    this.botIdleRevertTimer = undefined
  }

  /** Tear down timers, animations, and global listeners when the UI is unmounted. */
  destroy(): void {
    this.clearTimers()
    this.lock.destroy()
    this.main.destroy()
    if (this.toastTimeout !== undefined) {
      clearTimeout(this.toastTimeout)
      this.toastTimeout = undefined
    }
    this.stopBotIdleAnimation?.()
    this.stopBotIdleAnimation = undefined
    this.cancelGazeThrottle?.()
    this.cancelGazeThrottle = undefined
    document.removeEventListener('keydown', this.handleEscape)
    if (this.containerClickHandler) {
      this.container.removeEventListener('click', this.containerClickHandler)
      this.containerClickHandler = undefined
    }
    this.storageUnavailableUnsubscribe?.()
    this.storageUnavailableUnsubscribe = undefined
  }

  private lockNow(): void {
    this.setBotMood('idle')
    this.showToast({ message: '🔒 Locked.', type: 'info' })
    this.showScreen('v-code')
  }

  /** Gate khul gaya — main screen par jao. */
  private unlock(): void {
    if ('vibrate' in navigator) navigator.vibrate(18)
    this.setBotMood('happy')
    this.flashBot('bot-success')
    this.showBotBubble('unlocked 🔓')
    this.showToast({ message: '✅ Unlocked!', type: 'success' })
    void pushLocal('HASAN TECH STUDIO', 'Unlocked.')
    this.showScreen('v-work-progress')
  }

  // ---- Notifications (same one-click local bell) ----

  private async toggleNotifications(): Promise<void> {
    if (!notifySupported()) {
      this.showToast({ message: 'Notifications are not supported here.', type: 'error' })
      return
    }
    if (!window.isSecureContext) {
      this.showToast({ message: 'Notifications need HTTPS or localhost.', type: 'error' })
      return
    }
    if (prefEnabled() && currentPermission() === 'granted') {
      setPref(false)
      this.refreshBell()
      this.showToast({ message: 'Notifications off.', type: 'info' })
      return
    }
    const result = await enableNotifications()
    this.refreshBell()
    if (result === 'granted') {
      this.showToast({ message: 'Notifications on.', type: 'success' })
      void pushLocal('HASAN TECH STUDIO', 'Alerts are live.')
    } else if (result === 'denied') {
      this.showToast({ message: 'Blocked — allow notifications in site settings.', type: 'error' })
    }
  }

  private refreshBell(): void {
    const bell = this.container.querySelector<HTMLElement>('.notify-bell')
    if (!bell) return
    const on = prefEnabled() && currentPermission() === 'granted'
    bell.classList.toggle('is-on', on)
    bell.setAttribute('aria-label', on ? 'Disable notifications' : 'Enable notifications')
    bell.innerHTML = on ? BELL_ON_ICON : BELL_OFF_ICON
  }

  // ---- Mascot (same companion, same moods) ----

  private revealAvatar(duration: number): void {
    const emblem = this.container.querySelector<HTMLElement>('.brand-emblem')
    if (!emblem) return
    if (this.avatarRevealTimer !== undefined) clearTimeout(this.avatarRevealTimer)
    if (this.avatarHideTimer !== undefined) clearTimeout(this.avatarHideTimer)
    if (this.avatarCloseTimer !== undefined) clearTimeout(this.avatarCloseTimer)
    this.avatarRevealTimer = undefined
    this.avatarHideTimer = undefined
    this.avatarCloseTimer = undefined
    emblem.classList.remove('avatar-revealed', 'eyes-closing')
    emblem.classList.add('eyes-opening')
    this.avatarRevealTimer = window.setTimeout(() => {
      this.avatarRevealTimer = undefined
      emblem.classList.add('avatar-revealed')
    }, 520)
    this.avatarHideTimer = window.setTimeout(() => {
      this.avatarHideTimer = undefined
      this.hideAvatar()
    }, duration)
  }

  private hideAvatar(): void {
    const emblem = this.container.querySelector<HTMLElement>('.brand-emblem')
    if (!emblem) return
    if (this.avatarRevealTimer !== undefined) clearTimeout(this.avatarRevealTimer)
    if (this.avatarHideTimer !== undefined) clearTimeout(this.avatarHideTimer)
    if (this.avatarCloseTimer !== undefined) clearTimeout(this.avatarCloseTimer)
    this.avatarRevealTimer = undefined
    this.avatarHideTimer = undefined
    this.avatarCloseTimer = undefined
    emblem.classList.remove('avatar-revealed', 'eyes-opening')
    emblem.classList.add('eyes-closing')
    this.avatarCloseTimer = window.setTimeout(() => {
      emblem.classList.remove('eyes-closing')
      this.avatarCloseTimer = undefined
    }, 900)
  }

  private showBotBubble(message: string, duration = 2600, reveal = true): void {
    const bubble = this.container.querySelector<HTMLElement>('.companion-bubble')
    const talk = this.container.querySelector<HTMLElement>('.companion-talk')
    if (!bubble) return
    if (this.botBubbleTimer !== undefined) clearTimeout(this.botBubbleTimer)
    this.botBubbleTimer = undefined
    if (reveal) this.revealAvatar(duration)
    bubble.textContent = message
    bubble.classList.remove('show')
    talk?.classList.toggle('side-left', Math.random() < 0.5)
    void bubble.offsetWidth
    bubble.classList.add('show')
    this.botBubbleTimer = window.setTimeout(() => {
      this.botBubbleTimer = undefined
      bubble.classList.remove('show')
    }, duration)
  }

  private startBotIdleAnimation(): void {
    this.stopBotIdleAnimation?.()
    // Reduced-motion users get zero idle loops — instant perf + comfort win.
    if (prefersReducedMotion()) return
    this.stopBotIdleAnimation = startTimedLoop(() => {
      const bot = this.container.querySelector<HTMLElement>('.brand-emblem')
      if (!bot || this.currentScreen !== 'v-code' || this.isBotAnimating) return
      if (bot.dataset.mood && !['idle', 'curious'].includes(bot.dataset.mood)) return
      this.setBotMood('curious')
      if (this.botIdleRevertTimer !== undefined) clearTimeout(this.botIdleRevertTimer)
      this.botIdleRevertTimer = window.setTimeout(() => {
        this.botIdleRevertTimer = undefined
        if (this.currentScreen === 'v-code' && !this.isBotAnimating && bot.dataset.mood === 'curious') this.setBotMood('idle')
      }, 1200)
    }, 5200)
  }

  private setBotMood(mood: 'idle' | 'curious' | 'listening' | 'worried' | 'happy'): void {
    const bot = this.container.querySelector<HTMLElement>('.brand-emblem')
    if (!bot || bot.classList.contains('bot-falling')) return
    bot.dataset.mood = mood
  }

  private flashBot(animationClass: 'bot-error' | 'bot-success'): void {
    const bot = this.container.querySelector<HTMLElement>('.brand-emblem')
    if (!bot) return
    bot.classList.remove(animationClass)
    void bot.offsetWidth
    bot.classList.add(animationClass)
    if (this.botFlashTimer !== undefined) clearTimeout(this.botFlashTimer)
    this.botFlashTimer = window.setTimeout(() => {
      this.botFlashTimer = undefined
      bot.classList.remove(animationClass)
    }, 850)
  }

  private triggerBotFall(): void {
    const emblem = this.container.querySelector<HTMLElement>('.brand-emblem')
    if (!emblem || this.isBotAnimating) return
    this.isBotAnimating = true
    this.showBotBubble('welcome to hasan tech studio', 3000)
    const previousMood = emblem.dataset.mood || 'idle'
    if (this.botFallTimer !== undefined) clearTimeout(this.botFallTimer)
    if (this.botFallResetTimer !== undefined) clearTimeout(this.botFallResetTimer)
    this.botFallTimer = window.setTimeout(() => {
      this.botFallTimer = undefined
      emblem.dataset.mood = previousMood
      this.botFallResetTimer = window.setTimeout(() => {
        this.botFallResetTimer = undefined
        this.isBotAnimating = false
      }, 1000)
    }, 900)
  }

  private showToast(options: ToastOptions): void {
    const toast = this.container.querySelector<HTMLElement>('#toast')
    if (!toast) return
    toast.textContent = options.message
    toast.className = `show ${options.type || 'info'}`
    if (this.toastTimeout !== undefined) clearTimeout(this.toastTimeout)
    this.toastTimeout = undefined
    this.toastTimeout = window.setTimeout(() => {
      this.toastTimeout = undefined
      toast.classList.remove('show')
    }, options.duration || 3000)
  }
}
