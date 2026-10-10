import { authDB } from './AuthDB'
import type { ScreenId, ToastOptions } from './index'
import { startTimedLoop } from './PerformanceLayer'
import { currentPermission, enableNotifications, notifySupported, onStorageUnavailable, prefEnabled, pushLocal, setPref } from './Notify'
import {
  FP_CRED_KEY,
  FP_MAX_ATTEMPTS,
  STORAGE_UNAVAILABLE_MESSAGE,
} from './utils/constants'
import { BELL_OFF_ICON, BELL_ON_ICON } from './utils/icons'

function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  bytes.forEach(byte => { binary += String.fromCharCode(byte) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0))
}

/** Single-device fingerprint credential id (tolerates the old per-uid map shape). */
function readFpCredentialId(): string | null {
  try {
    const raw = localStorage.getItem(FP_CRED_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed === 'string' && parsed) return parsed
    if (parsed && typeof parsed === 'object') {
      for (const value of Object.values(parsed as Record<string, unknown>)) {
        if (typeof value === 'string' && value) return value
      }
    }
  } catch {
    // Corrupt store reads as empty; re-registration fixes it.
  }
  return null
}

function writeFpCredentialId(id: string | null): void {
  try {
    if (id) localStorage.setItem(FP_CRED_KEY, JSON.stringify(id))
    else localStorage.removeItem(FP_CRED_KEY)
  } catch {
    // Best-effort; caller shows a toast.
  }
}

export class AuthUI {
  private readonly container: HTMLElement
  private currentScreen: ScreenId = 'v-start'
  private toastTimeout: number | undefined
  private isBotAnimating = false
  private botBubbleTimer: number | undefined
  private avatarRevealTimer: number | undefined
  private avatarHideTimer: number | undefined
  private avatarCloseTimer: number | undefined
  private splashTimer: number | undefined
  private passcodeFocusTimer: number | undefined
  private passcodeResetTimer: number | undefined
  private botFlashTimer: number | undefined
  private botFallTimer: number | undefined
  private botFallResetTimer: number | undefined
  private botIdleRevertTimer: number | undefined
  private storageUnavailableUnsubscribe: (() => void) | undefined
  private containerClickHandler: ((event: Event) => void) | undefined
  private passcodeMode: 'verify' | 'set' | 'confirm' = 'verify'
  private pendingPasscode = ''
  private isFpBusy = false
  private fpAttempts = 0
  private initialized = false
  private stopBotIdleAnimation: (() => void) | undefined
  private readonly companionImage = '/IMG-20261008-WA6370.jpg'

  constructor(container: HTMLElement) {
    this.container = container
  }

  init(): void {
    if (this.initialized) return
    this.initialized = true
    this.render()
    this.bindEvents()
    this.startBotIdleAnimation()
    this.refreshBell()
    this.startSplashTimer()
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
        <section class="view show" id="v-start" role="button" tabindex="0" aria-label="Tap anywhere to continue" data-action="show-screen" data-screen="v-code">
          <div class="start-screen hts-intro">
            <div class="hts-stage-glow" aria-hidden="true"></div>
            <div class="hts-top-lockup" aria-label="HTS.OS">${this.renderTopBrand()}</div>
            <div class="hts-glow-line" aria-hidden="true"></div>
            <div class="hts-tagline" aria-hidden="true">the independent tech......</div>
            <div class="hts-dev-credit" aria-hidden="true"><span class="hts-dev-by">developed by-</span><span class="hts-dev-studio">HASAN TECH STUDIO</span></div>
          </div>
        </section>

        <section class="view" id="v-code" aria-label="Unlock" hidden>
          <h1 class="title">UNLOCK<small>Fingerprint ya 6-digit code se kholo</small></h1>
        </section>

        <section class="view" id="v-work-progress" aria-label="Main screen" hidden>
          <div class="work-progress-screen"></div>
        </section>

      </main>
      <footer class="site-footer"><span class="powered-by">powered by</span><b>HASAN TECHNOLOGY PVT LTD</b></footer>
      <button class="notify-bell" type="button" data-action="notify-toggle" aria-label="Enable notifications">${BELL_OFF_ICON}</button>
      <div class="passcode-overlay" id="passcode-overlay" hidden>
        <div class="passcode-card" role="dialog" aria-modal="true" aria-labelledby="passcode-title">
          <div class="passcode-title" id="passcode-title">Enter Code</div>
          <div class="passcode-sub">Fill your 6-digit access code</div>
          <div class="passcode-dots" id="passcode-dots" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>
          <div class="input-wrap passcode-wrap"><input id="passcode-input" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••" aria-label="6-digit access code"></div>
          <div class="passcode-error" id="passcode-error" hidden>Wrong code, try again</div>
          <button class="passcode-fp" id="fp-button" type="button" data-action="fingerprint" hidden aria-label="Unlock with fingerprint"><span class="passcode-fp-icon" aria-hidden="true">&#9757;</span><span id="fp-label">Use fingerprint</span></button>
          <button class="passcode-alt" type="button" hidden aria-hidden="true" tabindex="-1">try another way</button>
        </div>
      </div>
      <div id="toast" role="status" aria-live="polite"></div>
    `
    document.body.dataset.screen = this.currentScreen
  }

  private renderTopBrand(): string {
    const letters = Array.from('HTS.OS').map((character, index) =>
      character === '.'
        ? `<span class="hts-x-letter hts-x-dot" aria-hidden="true" style="--i:${index}">.</span>`
        : `<span class="hts-x-letter" aria-hidden="true" style="--i:${index}">${character}</span>`,
    ).join('')
    return `<span class="hts-extreme">${letters}</span>`
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
    bot?.addEventListener('pointermove', (event) => {
      const bounds = bot.getBoundingClientRect()
      const x = Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width - .5) * 2))
      const y = Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height - .5) * 2))
      bot.style.setProperty('--gaze-x', `${x * 3}px`)
      bot.style.setProperty('--gaze-y', `${y * 2}px`)
      if (!bot.dataset.mood || bot.dataset.mood === 'idle') bot.dataset.mood = 'curious'
    })
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
        if (screen === 'v-start' || screen === 'v-code' || screen === 'v-work-progress') this.showScreen(screen)
      }
      if (action === 'notify-toggle') void this.toggleNotifications()
      if (action === 'fingerprint') {
        // Gate (overlay) khula ho to unlock flow, main screen par ho to setup/test flow.
        const overlay = this.container.querySelector<HTMLElement>('#passcode-overlay')
        if (overlay && !overlay.hidden) void this.handleGateFingerprint()
        else void this.handleMainFingerprint()
      }
      if (action === 'set-passcode') this.openPasscodeSetup()
      if (action === 'lock-now') this.lockNow()
    }
    this.container.addEventListener('click', this.containerClickHandler)

    const passcodeInput = this.container.querySelector<HTMLInputElement>('#passcode-input')
    passcodeInput?.addEventListener('input', () => this.handlePasscodeInput())
    passcodeInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') void this.submitPasscode()
    })
    this.container.querySelector<HTMLElement>('.passcode-card')?.addEventListener('click', () => {
      passcodeInput?.focus({ preventScroll: true })
    })

    document.addEventListener('keydown', this.handleEscape)

    const start = this.container.querySelector<HTMLElement>('#v-start')
    start?.addEventListener('keydown', (event) => {
      if ((event.key === 'Enter' || event.key === ' ') && this.currentScreen === 'v-start') {
        event.preventDefault()
        this.showScreen('v-code')
      }
    })
  }

  private readonly handleEscape = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return
    // Lock kabhi Escape se bypass nahi hoga; main screen par Escape = lock.
    if (this.currentScreen === 'v-work-progress') this.lockNow()
  }

  private showScreen(screen: ScreenId): void {
    if (!document.getElementById(screen)) return
    this.clearTimers()
    this.refreshBell()
    // Gate overlay sirf v-code par ya setup ke liye khulta hai.
    if (screen !== 'v-code') {
      const overlay = this.container.querySelector<HTMLElement>('#passcode-overlay')
      if (overlay && this.currentScreen !== 'v-work-progress') {
        overlay.classList.remove('show')
        overlay.hidden = true
      }
    }
    if (screen === 'v-start') {
      this.hidePasscodePopup()
      this.startSplashTimer()
    } else {
      this.clearSplashTimer()
    }
    this.currentScreen = screen
    if (screen === 'v-code') this.openGate()
    if (screen === 'v-work-progress') this.renderMain()
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

  // ---- Splash ----

  private startSplashTimer(): void {
    this.clearSplashTimer()
    this.splashTimer = window.setTimeout(() => {
      this.splashTimer = undefined
      if (this.currentScreen !== 'v-start') return
      this.showScreen('v-code')
    }, 3500)
  }

  private clearSplashTimer(): void {
    if (this.splashTimer !== undefined) clearTimeout(this.splashTimer)
    this.splashTimer = undefined
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
    if (this.splashTimer !== undefined) clearTimeout(this.splashTimer)
    this.splashTimer = undefined
    if (this.passcodeFocusTimer !== undefined) clearTimeout(this.passcodeFocusTimer)
    this.passcodeFocusTimer = undefined
    if (this.passcodeResetTimer !== undefined) clearTimeout(this.passcodeResetTimer)
    this.passcodeResetTimer = undefined
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
    if (this.toastTimeout !== undefined) {
      clearTimeout(this.toastTimeout)
      this.toastTimeout = undefined
    }
    this.stopBotIdleAnimation?.()
    this.stopBotIdleAnimation = undefined
    document.removeEventListener('keydown', this.handleEscape)
    if (this.containerClickHandler) {
      this.container.removeEventListener('click', this.containerClickHandler)
      this.containerClickHandler = undefined
    }
    this.storageUnavailableUnsubscribe?.()
    this.storageUnavailableUnsubscribe = undefined
  }

  // ---- Code gate (splash ke baad pehli screen) ----

  /** Pehli baar code set hota hai, uske baad har baar verify + fingerprint-first. */
  private openGate(): void {
    if (authDB.hasPasscode()) this.showPasscodePopup()
    else this.openPasscodeSetup()
  }

  private lockNow(): void {
    this.setBotMood('idle')
    this.showToast({ message: '🔒 Locked.', type: 'info' })
    this.showScreen('v-code')
  }

  private setPasscodeCopy(title: string, sub: string): void {
    const titleEl = this.container.querySelector<HTMLElement>('#passcode-title')
    if (titleEl) titleEl.textContent = title
    const subEl = this.container.querySelector<HTMLElement>('.passcode-sub')
    if (subEl) subEl.textContent = sub
  }

  /** First-run + "Change access code": fingerprint + 6-digit code setup. */
  private openPasscodeSetup(): void {
    const overlay = this.container.querySelector<HTMLElement>('#passcode-overlay')
    const input = this.container.querySelector<HTMLInputElement>('#passcode-input')
    const error = this.container.querySelector<HTMLElement>('#passcode-error')
    if (!overlay || !input) return
    this.passcodeMode = 'set'
    this.pendingPasscode = ''
    this.setPasscodeCopy('Set access code', 'Choose a 6-digit code — ya 👆 se fingerprint lagao')
    if (error) error.hidden = true
    input.value = ''
    this.updatePasscodeDots('')
    overlay.hidden = false
    void overlay.offsetWidth
    overlay.classList.add('show')
    // Setup me fingerprint button dikhao taaki pehli baar me hi dono set ho jayein.
    void this.refreshFingerprintButton()
    if (this.passcodeFocusTimer !== undefined) clearTimeout(this.passcodeFocusTimer)
    this.passcodeFocusTimer = window.setTimeout(() => {
      this.passcodeFocusTimer = undefined
      input.focus({ preventScroll: true })
    }, 200)
  }

  private showPasscodePopup(): void {
    const overlay = this.container.querySelector<HTMLElement>('#passcode-overlay')
    const input = this.container.querySelector<HTMLInputElement>('#passcode-input')
    const error = this.container.querySelector<HTMLElement>('#passcode-error')
    if (!overlay || !input) return
    this.passcodeMode = 'verify'
    this.pendingPasscode = ''
    this.setPasscodeCopy('Enter Code', 'Fill your 6-digit access code')
    if (error) error.hidden = true
    input.value = ''
    this.updatePasscodeDots('')
    this.fpAttempts = 0
    overlay.hidden = false
    void overlay.offsetWidth
    overlay.classList.add('show')
    // Fingerprint FIRST — sensor prompt auto, fail ho to code se kholo.
    void this.refreshFingerprintButton().then(() => this.autoFingerprint())
    if (!readFpCredentialId()) {
      if (this.passcodeFocusTimer !== undefined) clearTimeout(this.passcodeFocusTimer)
      this.passcodeFocusTimer = window.setTimeout(() => {
        this.passcodeFocusTimer = undefined
        input.focus({ preventScroll: true })
      }, 350)
    }
  }

  private hidePasscodePopup(): void {
    const overlay = this.container.querySelector<HTMLElement>('#passcode-overlay')
    if (!overlay) return
    overlay.classList.remove('show')
    overlay.hidden = true
  }

  private handlePasscodeInput(): void {
    const input = this.container.querySelector<HTMLInputElement>('#passcode-input')
    if (!input) return
    input.value = input.value.replace(/\D/g, '').slice(0, 6)
    this.updatePasscodeDots(input.value)
    const error = this.container.querySelector<HTMLElement>('#passcode-error')
    if (error) error.hidden = true
    if (input.value.length === 6) void this.submitPasscode()
  }

  private async submitPasscode(): Promise<void> {
    const input = this.container.querySelector<HTMLInputElement>('#passcode-input')
    if (!input) return
    const value = input.value
    if (value.length !== 6) return
    if (this.passcodeMode === 'set') {
      this.pendingPasscode = value
      this.passcodeMode = 'confirm'
      this.setPasscodeCopy('Confirm access code', 'Re-enter your 6-digit code')
      input.value = ''
      this.updatePasscodeDots('')
      input.focus({ preventScroll: true })
      return
    }
    if (this.passcodeMode === 'confirm') {
      if (value === this.pendingPasscode) {
        try {
          await authDB.setPasscode(value)
          this.pendingPasscode = ''
          this.passcodeMode = 'verify'
          this.hidePasscodePopup()
          this.showToast({ message: '✅ Access code saved.', type: 'success' })
          void pushLocal('HASAN TECH STUDIO', 'Access code saved.')
          this.unlock()
        } catch (error) {
          this.showToast({ message: this.errorMessage(error), type: 'error' })
        }
      } else {
        this.passcodeError('Codes do not match. Start again.')
        this.passcodeMode = 'set'
        this.pendingPasscode = ''
        this.setPasscodeCopy('Set access code', 'Choose a 6-digit code')
        this.resetPasscodeInput(input)
      }
      return
    }
    await this.verifyPasscode()
  }

  private async verifyPasscode(): Promise<void> {
    const input = this.container.querySelector<HTMLInputElement>('#passcode-input')
    if (!input) return
    try {
      if (await authDB.verifyPasscode(input.value)) {
        input.value = ''
        this.updatePasscodeDots('')
        this.hidePasscodePopup()
        this.unlock()
        return
      }
    } catch (error) {
      this.showToast({ message: this.errorMessage(error), type: 'error' })
      return
    }
    if (input.value.length === 6) {
      this.setBotMood('worried')
      this.flashBot('bot-error')
      this.passcodeError('Wrong code, try again')
      this.showToast({ message: '❌ Wrong code, try again', type: 'error' })
      this.resetPasscodeInput(input)
    }
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

  private resetPasscodeInput(input: HTMLInputElement): void {
    if (this.passcodeResetTimer !== undefined) clearTimeout(this.passcodeResetTimer)
    this.passcodeResetTimer = window.setTimeout(() => {
      this.passcodeResetTimer = undefined
      input.value = ''
      this.updatePasscodeDots('')
      input.focus({ preventScroll: true })
    }, 650)
  }

  private passcodeError(message: string): void {
    const card = this.container.querySelector<HTMLElement>('.passcode-card')
    const error = this.container.querySelector<HTMLElement>('#passcode-error')
    if (error) { error.textContent = message; error.hidden = false }
    card?.classList.remove('passcode-shake')
    void card?.offsetWidth
    card?.classList.add('passcode-shake')
  }

  private updatePasscodeDots(value: string): void {
    this.container.querySelectorAll<HTMLElement>('#passcode-dots i').forEach((dot, index) => {
      dot.classList.toggle('is-on', index < value.length)
    })
  }

  // ---- Fingerprint (WebAuthn platform authenticator, single device) ----

  private async fingerprintSupported(): Promise<boolean> {
    try {
      if (!window.isSecureContext) return false
      if (typeof PublicKeyCredential === 'undefined') return false
      if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') return false
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
    } catch {
      return false
    }
  }

  private async refreshFingerprintButton(): Promise<void> {
    const button = this.container.querySelector<HTMLElement>('#fp-button')
    const label = this.container.querySelector<HTMLElement>('#fp-label')
    if (!button) return
    const ok = (await this.fingerprintSupported()) && !!navigator.credentials
    button.hidden = !ok
    if (label) label.hidden = !ok
  }

  private registerFpStrike(): void {
    this.fpAttempts += 1
    if (this.fpAttempts < FP_MAX_ATTEMPTS) return
    const button = this.container.querySelector<HTMLElement>('#fp-button')
    const label = this.container.querySelector<HTMLElement>('#fp-label')
    if (button) button.hidden = true
    if (label) label.hidden = true
    this.showToast({ message: 'Use your code instead.', type: 'info' })
  }

  private async registerFingerprint(): Promise<void> {
    if (!navigator.credentials) throw new Error('WebAuthn is unavailable.')
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'HASAN TECH STUDIO' },
        user: {
          id: new TextEncoder().encode('hts-local-user'),
          name: 'hts-local-user',
          displayName: 'HTS user',
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
        timeout: 60000,
        attestation: 'none',
      },
    })) as PublicKeyCredential | null
    if (!credential) throw new Error('Registration failed.')
    try {
      writeFpCredentialId(bufferToBase64url(credential.rawId))
    } catch {
      this.showToast({ message: STORAGE_UNAVAILABLE_MESSAGE, type: 'warning' })
      throw new Error('Storage unavailable.')
    }
  }

  private async authenticateFingerprint(credentialId: string): Promise<void> {
    if (!navigator.credentials) throw new Error('WebAuthn is unavailable.')
    const result = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: base64urlToBytes(credentialId).buffer as ArrayBuffer }],
        userVerification: 'required',
        timeout: 60000,
      },
    })
    if (!result) throw new Error('Authentication failed.')
  }

  /** Gate par fingerprint button — success = unlock. */
  private async handleGateFingerprint(): Promise<void> {
    if (this.isFpBusy) return
    if (!(await this.fingerprintSupported())) {
      this.showToast({ message: 'Fingerprint is not available on this device.', type: 'error' })
      return
    }
    this.isFpBusy = true
    const button = this.container.querySelector<HTMLElement>('#fp-button')
    button?.classList.add('fp-busy')
    try {
      // Setup mode (first time / change code): sirf fingerprint REGISTER karo,
      // unlock nahi — code flow uske baad jari rehta hai.
      if (this.passcodeMode !== 'verify') {
        this.showToast({ message: 'Touch the sensor to add your fingerprint (optional).', type: 'info' })
        try {
          await this.registerFingerprint()
          this.showToast({ message: '✅ Fingerprint added — ab code set karo.', type: 'success' })
          void pushLocal('HASAN TECH STUDIO', 'Fingerprint registered.')
          void this.refreshFingerprintButton()
        } catch (error) {
          if (!(error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'AbortError'))) {
            this.showToast({ message: this.errorMessage(error), type: 'error' })
          }
        }
        return
      }
      const existing = readFpCredentialId()
      if (existing) {
        try {
          await this.authenticateFingerprint(existing)
        } catch (error) {
          if (error instanceof DOMException && (error.name === 'NotFoundError' || error.name === 'InvalidStateError')) {
            writeFpCredentialId(null)
            this.showToast({ message: 'Fingerprint changed — tap again to register.', type: 'warning' })
            if (this.currentScreen === 'v-work-progress') this.renderMain()
            return
          }
          this.registerFpStrike()
          throw error
        }
      } else {
        this.showToast({ message: 'Touch the sensor to register your fingerprint.', type: 'info' })
        try {
          await this.registerFingerprint()
          void pushLocal('HASAN TECH STUDIO', 'Fingerprint registered.')
        } catch (error) {
          this.registerFpStrike()
          throw error
        }
      }
      this.hidePasscodePopup()
      void pushLocal('HASAN TECH STUDIO', 'Unlocked with fingerprint.')
      this.unlock()
    } catch (error) {
      if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'AbortError')) {
        // Silent cancel/deny — code card is already there, zero irritation.
      } else {
        this.showToast({ message: this.errorMessage(error), type: 'error' })
      }
    } finally {
      this.isFpBusy = false
      button?.classList.remove('fp-busy')
    }
  }

  /** Gate khulne par fingerprint AUTO try — fail ho to chup-chaap code se kholo. */
  private async autoFingerprint(): Promise<void> {
    if (this.isFpBusy) return
    const overlay = this.container.querySelector<HTMLElement>('#passcode-overlay')
    if (!overlay || overlay.hidden) return
    const existing = readFpCredentialId()
    if (!existing) return
    if (!(await this.fingerprintSupported())) return
    const button = this.container.querySelector<HTMLElement>('#fp-button')
    this.isFpBusy = true
    button?.classList.add('fp-busy')
    try {
      await this.authenticateFingerprint(existing)
      this.hidePasscodePopup()
      void pushLocal('HASAN TECH STUDIO', 'Unlocked with fingerprint.')
      this.unlock()
    } catch (error) {
      if (error instanceof DOMException && (error.name === 'NotFoundError' || error.name === 'InvalidStateError')) {
        writeFpCredentialId(null)
      } else {
        this.registerFpStrike()
      }
      // Silent on auto path: code card is already visible for code or manual tap.
    } finally {
      this.isFpBusy = false
      button?.classList.remove('fp-busy')
    }
  }

  /** Main screen par fingerprint button — register ya test. */
  private async handleMainFingerprint(): Promise<void> {
    if (this.isFpBusy) return
    if (!(await this.fingerprintSupported())) {
      this.showToast({ message: 'Fingerprint is not available on this device.', type: 'error' })
      return
    }
    const existing = readFpCredentialId()
    if (!existing) {
      this.showToast({ message: 'Touch the sensor to register your fingerprint.', type: 'info' })
      this.isFpBusy = true
      try {
        await this.registerFingerprint()
        this.showToast({ message: '✅ Fingerprint registered.', type: 'success' })
        void pushLocal('HASAN TECH STUDIO', 'Fingerprint registered.')
        this.renderMain()
      } catch (error) {
        if (!(error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'AbortError'))) {
          this.showToast({ message: this.errorMessage(error), type: 'error' })
        }
      } finally {
        this.isFpBusy = false
      }
      return
    }
    this.isFpBusy = true
    try {
      await this.authenticateFingerprint(existing)
      this.setBotMood('happy')
      this.flashBot('bot-success')
      this.showToast({ message: '✅ Fingerprint works!', type: 'success' })
    } catch (error) {
      if (error instanceof DOMException && (error.name === 'NotFoundError' || error.name === 'InvalidStateError')) {
        writeFpCredentialId(null)
        this.showToast({ message: 'Fingerprint changed — register again.', type: 'warning' })
        this.renderMain()
      } else if (!(error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'AbortError'))) {
        this.showToast({ message: this.errorMessage(error), type: 'error' })
      }
    } finally {
      this.isFpBusy = false
    }
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
      if (this.currentScreen === 'v-work-progress') this.renderMain()
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
    if (this.currentScreen === 'v-work-progress') this.renderMain()
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
    this.stopBotIdleAnimation = startTimedLoop(() => {
      const bot = this.container.querySelector<HTMLElement>('.brand-emblem')
      if (!bot || this.currentScreen !== 'v-start' || this.isBotAnimating) return
      if (bot.dataset.mood && !['idle', 'curious'].includes(bot.dataset.mood)) return
      this.setBotMood('curious')
      if (this.botIdleRevertTimer !== undefined) clearTimeout(this.botIdleRevertTimer)
      this.botIdleRevertTimer = window.setTimeout(() => {
        this.botIdleRevertTimer = undefined
        if (this.currentScreen === 'v-start' && !this.isBotAnimating && bot.dataset.mood === 'curious') this.setBotMood('idle')
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

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
  }

  /** Main screen — no accounts, just device security controls. */
  private renderMain(): void {
    const mount = this.container.querySelector<HTMLElement>('.work-progress-screen')
    if (!mount) return
    const fpOn = readFpCredentialId() !== null
    const notifyOn = prefEnabled() && currentPermission() === 'granted'
    mount.innerHTML = `
      <div class="dash">
        <h1 class="dash-hello">HASAN TECH STUDIO</h1>
        <p class="dash-muted" style="text-align:center">Unlocked 🔓 — this device only, no accounts.</p>
        <div class="dash-grid">
          <section class="dash-card">
            <h2>Security</h2>
            <p class="dash-muted">Access code: <b>set</b> · Fingerprint: <b>${fpOn ? 'on' : 'off'}</b></p>
            <button class="dash-btn" type="button" data-action="set-passcode">Change access code</button>
            <button class="dash-btn dash-btn-ghost" type="button" data-action="fingerprint">${fpOn ? 'Test fingerprint' : 'Enable fingerprint'}</button>
            <button class="dash-btn dash-btn-danger" type="button" data-action="lock-now">Lock now</button>
          </section>
          <section class="dash-card">
            <h2>Notifications</h2>
            <p class="dash-muted">App alerts are <b>${notifyOn ? 'on' : 'off'}</b>.</p>
            <button class="dash-btn dash-btn-ghost" type="button" data-action="notify-toggle">${notifyOn ? 'Turn off' : 'Turn on'}</button>
          </section>
        </div>
      </div>`
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
