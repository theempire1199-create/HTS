import { authDB } from './AuthDB'
import type { ScreenId, SignupDetails, ToastOptions } from './index'
import { isValidContact, isValidEmail, isValidIdentifier } from './index'
import { rafThrottle, startTimedLoop } from './PerformanceLayer'
import { getLoginDetails, recordLoginDetail } from './LoginDetails'
import { recordSignupDetail } from './SignupDetails'
import { currentPermission, enableNotifications, notifySupported, onStorageUnavailable, prefEnabled, pushLocal, setPref } from './Notify'
import {
  FP_CRED_KEY,
  FP_MAX_ATTEMPTS,
  SECURING_DATA_LABEL,
  STORAGE_UNAVAILABLE_MESSAGE,
} from './utils/constants'
import { BELL_OFF_ICON, BELL_ON_ICON, EYE_OFF_ICON, EYE_ON_ICON } from './utils/icons'

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

function readFpStore(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(FP_CRED_KEY) || '{}')
    if (typeof parsed === 'object' && parsed !== null) return parsed as Record<string, string>
  } catch {
    // Corrupt store reads as empty; re-registration fixes it.
  }
  return {}
}

/** Escape user-supplied text before it is placed into innerHTML. */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&': return '&amp;'
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '"': return '&quot;'
      default: return '&#39;'
    }
  })
}

export class AuthUI {
  private readonly container: HTMLElement
  private currentScreen: ScreenId = 'v-start'
  private toastTimeout: number | undefined
  private isBotAnimating = false
  private botBubbleTimer: number | undefined
  private botBubbleSequenceTimer: number | undefined
  private avatarRevealTimer: number | undefined
  private avatarHideTimer: number | undefined
  private avatarCloseTimer: number | undefined
  private signupStep = 0
  private signupPrefillIdentifier = ''
  private signupFocusTimer: number | undefined
  private splashTimer: number | undefined
  private passcodeFocusTimer: number | undefined
  private passcodeResetTimer: number | undefined
  private loginFlashTimer: number | undefined
  private botFlashTimer: number | undefined
  private botFallTimer: number | undefined
  private botFallResetTimer: number | undefined
  private botIdleRevertTimer: number | undefined
  private testNotificationTimers: number[] = []
  private storageUnavailableUnsubscribe: (() => void) | undefined
  private mouseTilt: { handler: (event: MouseEvent) => void; cancel: () => void } | undefined
  private touchTilts: Array<{ card: HTMLElement; handler: (event: TouchEvent) => void; cancel: () => void }> = []
  private containerClickHandler: ((event: Event) => void) | undefined
  private containerSubmitHandler: ((event: Event) => void) | undefined
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
    if (window.location.hash === '#reverify') {
      this.configureReverify('')
      this.showScreen('v-reverify')
      return
    }
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
        <section class="view show" id="v-start" role="button" tabindex="0" aria-label="Tap anywhere to continue" data-action="show-screen" data-screen="v-login">
          <div class="start-screen hts-intro">
            <div class="hts-stage-glow" aria-hidden="true"></div>
            <div class="hts-top-lockup" aria-label="HTS.OS">${this.renderTopBrand()}</div>
            <div class="hts-glow-line" aria-hidden="true"></div>
            <div class="hts-tagline" aria-hidden="true">the independent tech......</div>
            <div class="hts-dev-credit" aria-hidden="true"><span class="hts-dev-by">developed by-</span><span class="hts-dev-studio">HASAN TECH STUDIO</span></div>
          </div>
        </section>

        <section class="view" id="v-login" aria-labelledby="login-title" hidden>
          <h1 class="title" id="login-title">INITIALIZE ACCESS</h1>
          <div class="scene" id="scene1">
            <div class="round3d thali-card login-orb" id="card1">
              <div class="thali-plate"><div class="thali-inner">
                <form id="login-form" class="auth-form" novalidate>
                  <label for="li-id">Email ID</label>
                  <div class="input-wrap mirror-wrap identifier-wrap"><input id="li-id" name="identifier" autocomplete="username" required><span class="input-pencil" aria-hidden="true">|</span><div class="mirror" id="mirror-li-id" aria-hidden="true"></div></div>
                  <label for="li-pw">Password</label>
                  <div class="input-wrap mirror-wrap password-wrap"><input id="li-pw" name="password" type="password" autocomplete="current-password" minlength="6" required><span class="input-pencil" aria-hidden="true">|</span><div class="mirror" id="mirror-li-pw" aria-hidden="true"></div><button type="button" class="eye" aria-label="Show password" data-action="toggle-password" data-target="li-pw">${EYE_OFF_ICON}</button></div>
                  <button class="primary-button btn-enter" type="submit"><span>ENTER</span></button>
                </form>
              </div></div>
            </div>
          </div>
        </section>

        <section class="view" id="v-signup" aria-labelledby="signup-title" hidden>
          <div class="signup-quote-layout">
            <h1 class="sr-only" id="signup-title">Create your account</h1>
            <blockquote class="technology-quote">“The best way to predict the future is to invent it.”</blockquote>
            <form id="signup-form" class="signup-wizard" novalidate>
              <div class="signup-roller" aria-live="polite">
                <div class="signup-track" id="signup-track">
                  <fieldset class="signup-step signup-name-step is-active" data-signup-step="0">
                    <div class="signup-step-title" role="heading" aria-level="2">Tell me your name</div>
                    <div class="input-wrap"><input id="su-name" name="name" autocomplete="name" placeholder="Your full name" required></div>
                    <button class="signup-next" type="button" data-action="signup-next" aria-label="Next step">→</button>
                  </fieldset>
                  <fieldset class="signup-step" data-signup-step="1" aria-hidden="true">
                    <div class="signup-step-title" role="heading" aria-level="2">Tell me your contact number</div>
                    <div class="input-wrap"><input id="su-contact" name="contact" type="tel" inputmode="tel" autocomplete="tel" placeholder="Contact number" required></div>
                    <div class="signup-step-actions"><button class="signup-prev" type="button" data-action="signup-prev" aria-label="Previous step">←</button><button class="signup-next" type="button" data-action="signup-next" aria-label="Next step">→</button></div>
                  </fieldset>
                  <fieldset class="signup-step" data-signup-step="2" aria-hidden="true">
                    <div class="signup-step-title" role="heading" aria-level="2">Write your email ID</div>
                    <div class="input-wrap"><input id="su-email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required></div>
                    <div class="signup-step-actions"><button class="signup-prev" type="button" data-action="signup-prev" aria-label="Previous step">←</button><button class="signup-next" type="button" data-action="signup-next" aria-label="Next step">→</button></div>
                  </fieldset>
                  <fieldset class="signup-step" data-signup-step="3" aria-hidden="true">
                    <div class="signup-step-title" role="heading" aria-level="2">Choose your secret</div>
                    <div class="input-wrap signup-secret-wrap"><input id="su-password" name="password" type="password" autocomplete="new-password" placeholder="At least 6 characters" minlength="6" required><button type="button" class="eye signup-eye" aria-label="Show password" data-action="toggle-password" data-target="su-password">${EYE_OFF_ICON}</button></div>
                    <div class="signup-step-actions"><button class="signup-prev" type="button" data-action="signup-prev" aria-label="Previous step">←</button><button class="signup-next" type="button" data-action="signup-next" aria-label="Next step">→</button></div>
                  </fieldset>
                  <fieldset class="signup-step" data-signup-step="4" aria-hidden="true">
                    <div class="signup-step-title" role="heading" aria-level="2">Confirm your secret</div>
                    <div class="input-wrap signup-secret-wrap"><input id="su-confirm-password" name="confirmPassword" type="password" autocomplete="new-password" placeholder="Repeat your secret" minlength="6" required><button type="button" class="eye signup-eye" aria-label="Show password" data-action="toggle-password" data-target="su-confirm-password">${EYE_OFF_ICON}</button></div>
                    <div class="signup-step-actions"><button class="signup-prev" type="button" data-action="signup-prev" aria-label="Previous step">←</button><button class="signup-next" type="button" data-action="signup-next" aria-label="Next step">→</button></div>
                  </fieldset>
                  <fieldset class="signup-step signup-terms-step" data-signup-step="5" aria-hidden="true">
                    <div class="signup-step-title" role="heading" aria-level="2">One last promise</div>
                    <label class="terms-check"><input id="su-terms" name="terms" type="checkbox" required><span>I agree to the <a href="#terms" data-action="terms-link">terms and conditions</a> and <a href="#privacy" data-action="privacy-link">privacy policy</a>.</span></label>
                    <button class="signup-join" type="submit">JOIN →</button>
                    <button class="signup-prev signup-last-back" type="button" data-action="signup-prev" aria-label="Previous step">←</button>
                  </fieldset>
                </div>
              </div>
              <div class="signup-progress" aria-label="Signup progress"><span class="signup-progress-dots"></span><span class="signup-progress-count">1 / 6</span></div>
            </form>
            <button class="back-button" type="button" data-action="show-screen" data-screen="v-login">← Back to Login</button>
          </div>
        </section>

        <section class="view" id="v-work-progress" aria-label="Main screen" hidden>
          <div class="work-progress-screen"></div>
        </section>

        <section class="view" id="v-reverify" aria-labelledby="reverify-title" hidden>
          <div class="reverify-layout">
            <h1 class="title screen-title" id="reverify-title">Verify your email ✉️<small>We sent a verification link to your inbox</small></h1>
            <div class="auth-card reverify-card" id="card3">
              <form id="reverify-form" class="auth-form" novalidate>
                <label for="rv-id">Email</label>
                <div class="otp-row">
                  <div class="input-wrap"><input id="rv-id" type="email" autocomplete="email" readonly></div>
                  <button type="button" class="mini-button" data-action="send-otp">Send link</button>
                </div>
                <button class="primary-button" type="submit">I'VE VERIFIED ✓</button>
              </form>
            </div>
            <button class="back-button" type="button" data-action="show-screen" data-screen="v-login">← Back to Login</button>
          </div>
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
          <button class="passcode-alt" type="button" data-action="show-screen" data-screen="v-login">try another way</button>
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

  /**
   * Shared input wiring: mirror rendering, pencil state, plain-text paste,
   * bot mood sync, and focus/blur feedback. Applied to login + signup fields.
   */
  private attachInputEffects(
    input: HTMLInputElement | null,
    mirror: HTMLElement | null,
    isPassword = false,
  ): void {
    if (!input) return
    input.addEventListener('input', () => {
      if (mirror) this.paintMirror(input, mirror, isPassword)
      this.updatePencil(input)
      const loginId = this.container.querySelector<HTMLInputElement>('#li-id')
      const loginPw = this.container.querySelector<HTMLInputElement>('#li-pw')
      if (loginId && loginPw && (input === loginId || input === loginPw)) {
        this.updateBotFromInput(loginId, loginPw)
      }
    })
    input.addEventListener('paste', (event) => this.handlePlainPaste(event, input))
    input.addEventListener('focus', () => this.setBotMood('listening'))
    input.addEventListener('blur', () => {
      const loginId = this.container.querySelector<HTMLInputElement>('#li-id')
      const loginPw = this.container.querySelector<HTMLInputElement>('#li-pw')
      if (loginId && loginPw && (input === loginId || input === loginPw)) {
        this.updateBotFromInput(loginId, loginPw)
      }
    })
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

    const loginCard = this.container.querySelector<HTMLElement>('#card1')
    let borderTimer: number | undefined
    loginCard?.addEventListener('pointerdown', () => {
      loginCard.classList.remove('card-awake')
      void loginCard.offsetWidth
      loginCard.classList.add('card-awake')
      if (borderTimer !== undefined) clearTimeout(borderTimer)
      borderTimer = window.setTimeout(() => loginCard.classList.remove('card-awake'), 1100)
    })

    this.container.querySelectorAll<HTMLElement>('#card1 .input-wrap').forEach((wrap) => {
      wrap.addEventListener('click', (event) => {
        if (event.target instanceof Element && event.target.closest('button')) return
        wrap.querySelector<HTMLInputElement>('input')?.focus()
      })
    })
    const identifierWrap = this.container.querySelector<HTMLElement>('#card1 .identifier-wrap')
    identifierWrap?.addEventListener('pointerdown', (event) => {
      if (event.target instanceof Element && event.target.closest('button')) return
      const input = identifierWrap.querySelector<HTMLInputElement>('input')
      if (input && document.activeElement !== input) input.focus()
    })

    this.containerClickHandler = (event) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-action]') : null
      if (!target) return
      const action = target.dataset.action
      if (action === 'show-screen') {
        const screen = target.dataset.screen
        if (screen === 'v-start' || screen === 'v-login' || screen === 'v-signup' || screen === 'v-reverify' || screen === 'v-work-progress') this.showScreen(screen)
      }
      if (action === 'toggle-password') this.togglePassword(target)
      if (action === 'send-otp') void this.sendOTP()
      if (action === 'verify-email') void this.sendOTP()
      if (action === 'notify-toggle') void this.toggleNotifications()
      if (action === 'fingerprint') void this.handleFingerprint()
      if (action === 'signup-next') this.advanceSignupStep()
      if (action === 'signup-prev') this.retreatSignupStep()
      if (action === 'logout') this.logout()
      if (action === 'set-passcode') this.openPasscodeSetup()
      if (action === 'terms-link' || action === 'privacy-link') event.preventDefault()
    }
    this.container.addEventListener('click', this.containerClickHandler)

    this.containerSubmitHandler = (event) => {
      event.preventDefault()
      const form = event.target
      if (!(form instanceof HTMLFormElement)) return
      if (form.id === 'login-form') {
        this.hapticFeedback()
        void this.handleLogin(form)
      }
      if (form.id === 'signup-form') void this.handleSignup(form)
      if (form.id === 'reverify-form') void this.handleReverify(form)
    }
    this.container.addEventListener('submit', this.containerSubmitHandler)

    const passcodeInput = this.container.querySelector<HTMLInputElement>('#passcode-input')
    passcodeInput?.addEventListener('input', () => this.handlePasscodeInput())
    passcodeInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') void this.submitPasscode()
    })
    this.container.querySelector<HTMLElement>('.passcode-card')?.addEventListener('click', () => {
      passcodeInput?.focus({ preventScroll: true })
    })

    const loginIdentifier = this.container.querySelector<HTMLInputElement>('#li-id')
    const loginPassword = this.container.querySelector<HTMLInputElement>('#li-pw')
    const identifierMirror = this.container.querySelector<HTMLElement>('#mirror-li-id')
    const passwordMirror = this.container.querySelector<HTMLElement>('#mirror-li-pw')
    this.attachInputEffects(loginIdentifier, identifierMirror, false)
    this.attachInputEffects(loginPassword, passwordMirror, true)
    // Signup fields share the same focus/pencil/paste behaviour (no mirror element).
    this.attachInputEffects(this.container.querySelector<HTMLInputElement>('#su-name'), null, false)
    this.attachInputEffects(this.container.querySelector<HTMLInputElement>('#su-contact'), null, false)
    this.attachInputEffects(this.container.querySelector<HTMLInputElement>('#su-email'), null, false)
    this.attachInputEffects(this.container.querySelector<HTMLInputElement>('#su-password'), null, true)
    this.attachInputEffects(this.container.querySelector<HTMLInputElement>('#su-confirm-password'), null, true)

    const tiltCards = [
      this.container.querySelector<HTMLElement>('#card3'),
    ].filter((card): card is HTMLElement => card !== null)
    this.mouseTilt = rafThrottle<MouseEvent>((event) => {
      const x = event.clientX / window.innerWidth - .5
      const y = event.clientY / window.innerHeight - .5
      tiltCards.forEach(card => { card.style.transform = `perspective(1000px) rotateX(${2 - y * 6}deg) rotateY(${-2 + x * 6}deg)` })
    })
    document.addEventListener('mousemove', this.mouseTilt.handler, { passive: true })
    this.touchTilts = tiltCards.map(card => {
      const touchTilt = rafThrottle<TouchEvent>((event) => {
        const touch = event.touches[0]
        if (!touch) return
        const x = touch.clientX / window.innerWidth - .5
        const y = touch.clientY / window.innerHeight - .5
        card.style.transform = `perspective(1000px) rotateX(${2 - y * 6}deg) rotateY(${-2 + x * 6}deg)`
      })
      card.addEventListener('touchmove', touchTilt.handler, { passive: true })
      return { card, handler: touchTilt.handler, cancel: touchTilt.cancel }
    })

    document.addEventListener('keydown', this.handleEscape)

    const start = this.container.querySelector<HTMLElement>('#v-start')
    start?.addEventListener('keydown', (event) => {
      if ((event.key === 'Enter' || event.key === ' ') && this.currentScreen === 'v-start') {
        event.preventDefault()
        this.showScreen('v-login')
      }
    })
  }

  private readonly handleEscape = (event: KeyboardEvent): void => {
    const overlay = this.container.querySelector<HTMLElement>('#passcode-overlay')
    if (overlay && !overlay.hidden) return
    if (event.key === 'Escape' && this.currentScreen !== 'v-start') this.showScreen('v-start')
  }

  private showScreen(screen: ScreenId): void {
    if (!document.getElementById(screen)) return
    this.clearTimers()
    this.refreshBell()
    const passcode = this.container.querySelector<HTMLElement>('#passcode-overlay')
    if (passcode) {
      passcode.classList.remove('show')
      passcode.hidden = true
    }
    if (screen === 'v-start') {
      this.startSplashTimer()
    } else {
      this.clearSplashTimer()
    }
    this.currentScreen = screen
    if (screen === 'v-signup') this.resetSignupWizard(this.signupPrefillIdentifier)
    if (screen === 'v-work-progress') this.renderDashboard()
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

  private async toggleNotifications(): Promise<void> {
    if (!notifySupported()) {
      this.showToast({ message: 'Notifications are not supported here.', type: 'error' })
      return
    }
    if (!window.isSecureContext) {
      this.showToast({ message: 'Notifications need HTTPS or localhost — insecure http par Chrome permission nahi deta.', type: 'error' })
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
      void pushLocal('HASAN TECH STUDIO', 'Mast alerts are live.')
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
    bell.oncontextmenu = (event) => {
      event.preventDefault()
      void this.sendTestNotifications()
    }
  }

  private async sendTestNotifications(): Promise<void> {
    if (!prefEnabled() || currentPermission() !== 'granted') {
      this.showToast({ message: 'Turn notifications on first (tap the bell).', type: 'warning' })
      return
    }
    this.showToast({ message: '3 test notifications on the way.', type: 'info' })
    const tests: Array<[string, string, string]> = [
      ['HASAN TECH STUDIO', 'Test 1 — welcome to HTS alerts.', 'hts-test-1'],
      ['HASAN TECH STUDIO', 'Test 2 — logins, code gate aur updates ki khabar yahin milegi.', 'hts-test-2'],
      ['HASAN TECH STUDIO', 'Test 3 — is notification par tap karo, app khulni chahiye.', 'hts-test-3'],
    ]
    this.testNotificationTimers.forEach((timer) => clearTimeout(timer))
    this.testNotificationTimers = []
    tests.forEach(([title, body, tag], index) => {
      const timer = window.setTimeout(() => {
        void pushLocal(title, body, tag)
      }, index * 2000)
      this.testNotificationTimers.push(timer)
    })
  }

  private resetSignupWizard(prefillIdentifier = ''): void {
    const form = this.container.querySelector<HTMLFormElement>('#signup-form')
    form?.reset()
    this.signupStep = 0
    const email = this.container.querySelector<HTMLInputElement>('#su-email')
    const contact = this.container.querySelector<HTMLInputElement>('#su-contact')
    if (prefillIdentifier.includes('@')) {
      if (email) email.value = prefillIdentifier
    } else if (prefillIdentifier) {
      if (contact) contact.value = prefillIdentifier
    }
    this.updateSignupRoller()
  }

  private restoreRememberedSession(): void {
    const user = authDB.getCurrentUser()
    if (!user) return
    const loginIdentifier = this.container.querySelector<HTMLInputElement>('#li-id')
    if (loginIdentifier) {
      loginIdentifier.value = user.email
      loginIdentifier.dispatchEvent(new Event('input', { bubbles: true }))
    }
    this.setBotMood('happy')
    this.showBotBubble('welcome back')
    this.showToast({ message: `✅ Remembered session for ${user.name || user.email}`, type: 'success' })
    this.showScreen('v-work-progress')
  }

  private startSplashTimer(): void {
    this.clearSplashTimer()
    this.splashTimer = window.setTimeout(() => {
      this.splashTimer = undefined
      if (this.currentScreen !== 'v-start') return
      const user = authDB.getCurrentUser()
      if (user && authDB.hasPasscode(user.id)) {
        this.showPasscodePopup()
      } else if (user) {
        this.restoreRememberedSession()
      } else {
        this.showScreen('v-login')
      }
    }, 10000)
  }

  private clearSplashTimer(): void {
    if (this.splashTimer !== undefined) clearTimeout(this.splashTimer)
    this.splashTimer = undefined
  }

  /** Clear every pending UI timer before a screen transition or unmount. */
  private clearTimers(): void {
    if (this.botBubbleTimer !== undefined) clearTimeout(this.botBubbleTimer)
    this.botBubbleTimer = undefined
    if (this.botBubbleSequenceTimer !== undefined) clearTimeout(this.botBubbleSequenceTimer)
    this.botBubbleSequenceTimer = undefined
    if (this.avatarRevealTimer !== undefined) clearTimeout(this.avatarRevealTimer)
    this.avatarRevealTimer = undefined
    if (this.avatarHideTimer !== undefined) clearTimeout(this.avatarHideTimer)
    this.avatarHideTimer = undefined
    if (this.avatarCloseTimer !== undefined) clearTimeout(this.avatarCloseTimer)
    this.avatarCloseTimer = undefined
    if (this.signupFocusTimer !== undefined) clearTimeout(this.signupFocusTimer)
    this.signupFocusTimer = undefined
    if (this.splashTimer !== undefined) clearTimeout(this.splashTimer)
    this.splashTimer = undefined
    if (this.passcodeFocusTimer !== undefined) clearTimeout(this.passcodeFocusTimer)
    this.passcodeFocusTimer = undefined
    if (this.passcodeResetTimer !== undefined) clearTimeout(this.passcodeResetTimer)
    this.passcodeResetTimer = undefined
    if (this.loginFlashTimer !== undefined) clearTimeout(this.loginFlashTimer)
    this.loginFlashTimer = undefined
    if (this.botFlashTimer !== undefined) clearTimeout(this.botFlashTimer)
    this.botFlashTimer = undefined
    if (this.botFallTimer !== undefined) clearTimeout(this.botFallTimer)
    this.botFallTimer = undefined
    if (this.botFallResetTimer !== undefined) clearTimeout(this.botFallResetTimer)
    this.botFallResetTimer = undefined
    if (this.botIdleRevertTimer !== undefined) clearTimeout(this.botIdleRevertTimer)
    this.botIdleRevertTimer = undefined
    if (this.testNotificationTimers.length > 0) {
      this.testNotificationTimers.forEach((timer) => clearTimeout(timer))
      this.testNotificationTimers = []
    }
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
    if (this.mouseTilt) {
      document.removeEventListener('mousemove', this.mouseTilt.handler)
      this.mouseTilt.cancel()
      this.mouseTilt = undefined
    }
    this.touchTilts.forEach(({ card, handler, cancel }) => {
      card.removeEventListener('touchmove', handler)
      cancel()
    })
    this.touchTilts = []
    if (this.containerClickHandler) {
      this.container.removeEventListener('click', this.containerClickHandler)
      this.containerClickHandler = undefined
    }
    if (this.containerSubmitHandler) {
      this.container.removeEventListener('submit', this.containerSubmitHandler)
      this.containerSubmitHandler = undefined
    }
    this.storageUnavailableUnsubscribe?.()
    this.storageUnavailableUnsubscribe = undefined
  }

  /** Persist the fingerprint store with a friendly warning when storage is blocked. */
  private persistFpStore(store: Record<string, string>): void {
    try {
      localStorage.setItem(FP_CRED_KEY, JSON.stringify(store))
    } catch {
      this.showToast({ message: STORAGE_UNAVAILABLE_MESSAGE, type: 'warning' })
    }
  }

  /**
   * Disable a submit button and show PBKDF2 progress while `action` runs,
   * then restore the original label and enabled state.
   */
  private async withBusyButton<T>(button: HTMLButtonElement | null, action: () => Promise<T>): Promise<T> {
    if (!button) return action()
    const originalHTML = button.innerHTML
    const wasDisabled = button.disabled
    button.disabled = true
    button.classList.add('is-busy')
    button.setAttribute('aria-busy', 'true')
    button.innerHTML = `<span>${SECURING_DATA_LABEL}</span>`
    try {
      return await action()
    } finally {
      button.disabled = wasDisabled
      button.classList.remove('is-busy')
      button.removeAttribute('aria-busy')
      button.innerHTML = originalHTML
    }
  }

  private setPasscodeCopy(title: string, sub: string, showAlt: boolean): void {
    const titleEl = this.container.querySelector<HTMLElement>('#passcode-title')
    if (titleEl) titleEl.textContent = title
    const subEl = this.container.querySelector<HTMLElement>('.passcode-sub')
    if (subEl) subEl.textContent = sub
    const alt = this.container.querySelector<HTMLElement>('.passcode-alt')
    if (alt) alt.hidden = !showAlt
    const fp = this.container.querySelector<HTMLElement>('#fp-button')
    if (fp) fp.hidden = !showAlt
  }

  /** Open the app-lock code in "set a new code" mode (from the dashboard). */
  private openPasscodeSetup(): void {
    const user = authDB.getCurrentUser()
    const overlay = this.container.querySelector<HTMLElement>('#passcode-overlay')
    const input = this.container.querySelector<HTMLInputElement>('#passcode-input')
    const error = this.container.querySelector<HTMLElement>('#passcode-error')
    if (!user || !overlay || !input) return
    this.passcodeMode = 'set'
    this.pendingPasscode = ''
    this.setPasscodeCopy('Set access code', 'Choose a 6-digit code', false)
    if (error) error.hidden = true
    input.value = ''
    this.updatePasscodeDots('')
    overlay.hidden = false
    void overlay.offsetWidth
    overlay.classList.add('show')
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
    this.setPasscodeCopy('Enter Code', 'Fill your 6-digit access code', true)
    if (error) error.hidden = true
    input.value = ''
    this.updatePasscodeDots('')
    this.fpAttempts = 0
    overlay.hidden = false
    void overlay.offsetWidth
    overlay.classList.add('show')
    void this.refreshFingerprintButton().then(() => this.autoFingerprint())
    if (!this.fpCredentialIdForCurrentUser()) {
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
    if (this.passcodeMode === 'set') {
      this.pendingPasscode = value
      this.passcodeMode = 'confirm'
      this.setPasscodeCopy('Confirm access code', 'Re-enter your 6-digit code', false)
      input.value = ''
      this.updatePasscodeDots('')
      return
    }
    if (this.passcodeMode === 'confirm') {
      const user = authDB.getCurrentUser()
      if (user && value === this.pendingPasscode) {
        try {
          await authDB.setPasscode(user.id, value)
          this.hidePasscodePopup()
          this.pendingPasscode = ''
          this.passcodeMode = 'verify'
          this.showToast({ message: '✅ Access code saved.', type: 'success' })
          void pushLocal('HASAN TECH STUDIO', 'Access code saved.')
          if (this.currentScreen === 'v-work-progress') this.renderDashboard()
        } catch (error) {
          this.showToast({ message: this.errorMessage(error), type: 'error' })
        }
      } else {
        this.passcodeError('Codes do not match. Start again.')
        this.passcodeMode = 'set'
        this.pendingPasscode = ''
        this.setPasscodeCopy('Set access code', 'Choose a 6-digit code', false)
        this.resetPasscodeInput(input)
      }
      return
    }
    await this.verifyPasscode()
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

  private fpCredentialIdForCurrentUser(): string | null {
    const user = authDB.getCurrentUser()
    if (!user) return null
    const stored = readFpStore()[user.id]
    return typeof stored === 'string' && stored ? stored : null
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

  private async registerFingerprint(userId: string, userName: string): Promise<void> {
    if (!navigator.credentials) throw new Error('WebAuthn is unavailable.')
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'HASAN TECH STUDIO' },
        user: {
          id: new TextEncoder().encode(userId).slice(0, 64),
          name: userId,
          displayName: userName || userId,
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
    const store = readFpStore()
    store[userId] = bufferToBase64url(credential.rawId)
    try {
      localStorage.setItem(FP_CRED_KEY, JSON.stringify(store))
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

  private async handleFingerprint(): Promise<void> {
    if (this.isFpBusy) return
    const user = authDB.getCurrentUser()
    if (!user) return
    if (!(await this.fingerprintSupported())) {
      this.showToast({ message: 'Fingerprint is not available on this device.', type: 'error' })
      return
    }
    this.isFpBusy = true
    const button = this.container.querySelector<HTMLElement>('#fp-button')
    button?.classList.add('fp-busy')
    try {
      const existing = this.fpCredentialIdForCurrentUser()
      if (existing) {
        try {
          await this.authenticateFingerprint(existing)
        } catch (error) {
          if (error instanceof DOMException && (error.name === 'NotFoundError' || error.name === 'InvalidStateError')) {
            const store = readFpStore()
            delete store[user.id]
            this.persistFpStore(store)
            this.showToast({ message: 'Fingerprint changed — tap again to register.', type: 'warning' })
            return
          }
          this.registerFpStrike()
          throw error
        }
      } else {
        this.showToast({ message: 'Touch the sensor to register your fingerprint.', type: 'info' })
        try {
          await this.registerFingerprint(user.id, user.name)
          void pushLocal('HASAN TECH STUDIO', 'Fingerprint registered.')
        } catch (error) {
          this.registerFpStrike()
          throw error
        }
      }
      this.hidePasscodePopup()
      void pushLocal('HASAN TECH STUDIO', 'Unlocked with fingerprint.')
      this.restoreRememberedSession()
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

  private async autoFingerprint(): Promise<void> {
    if (this.isFpBusy) return
    const overlay = this.container.querySelector<HTMLElement>('#passcode-overlay')
    if (!overlay || overlay.hidden) return
    const user = authDB.getCurrentUser()
    if (!user) return
    const existing = this.fpCredentialIdForCurrentUser()
    if (!existing) return
    if (!(await this.fingerprintSupported())) return
    const button = this.container.querySelector<HTMLElement>('#fp-button')
    this.isFpBusy = true
    button?.classList.add('fp-busy')
    try {
      await this.authenticateFingerprint(existing)
      this.hidePasscodePopup()
      void pushLocal('HASAN TECH STUDIO', 'Unlocked with fingerprint.')
      this.restoreRememberedSession()
    } catch (error) {
      if (error instanceof DOMException && (error.name === 'NotFoundError' || error.name === 'InvalidStateError')) {
        const store = readFpStore()
        delete store[user.id]
        this.persistFpStore(store)
      } else {
        this.registerFpStrike()
      }
      // Silent on auto path: code card is already visible for code or manual tap.
    } finally {
      this.isFpBusy = false
      button?.classList.remove('fp-busy')
    }
  }

  private async verifyPasscode(): Promise<void> {
    const input = this.container.querySelector<HTMLInputElement>('#passcode-input')
    if (!input) return
    const user = authDB.getCurrentUser()
    if (user && (await authDB.verifyPasscode(user.id, input.value))) {
      input.value = ''
      this.updatePasscodeDots('')
      this.hidePasscodePopup()
      void pushLocal('HASAN TECH STUDIO', 'Unlocked with access code.')
      this.restoreRememberedSession()
      return
    }
    if (input.value.length === 6) {
      this.passcodeError('Wrong code, try again')
      this.showToast({ message: '❌ Wrong code, try again', type: 'error' })
      this.resetPasscodeInput(input)
    }
  }

  private logout(): void {
    authDB.logout()
    this.signupPrefillIdentifier = ''
    const identifier = this.container.querySelector<HTMLInputElement>('#li-id')
    const password = this.container.querySelector<HTMLInputElement>('#li-pw')
    if (identifier) {
      identifier.value = ''
      identifier.dispatchEvent(new Event('input', { bubbles: true }))
    }
    if (password) {
      password.value = ''
      password.dispatchEvent(new Event('input', { bubbles: true }))
    }
    this.setBotMood('idle')
    this.showToast({ message: '👋 You have been logged out.', type: 'info' })
    this.showScreen('v-login')
  }

  private updateSignupRoller(): void {
    const track = this.container.querySelector<HTMLElement>('#signup-track')
    if (!track) return
    track.style.setProperty('--signup-step', String(this.signupStep))
    this.container.querySelectorAll<HTMLElement>('.signup-step').forEach((step, index) => {
      const active = index === this.signupStep
      step.classList.toggle('is-active', active)
      step.setAttribute('aria-hidden', String(!active))
    })
    const count = this.container.querySelector<HTMLElement>('.signup-progress-count')
    if (count) count.textContent = `${this.signupStep + 1} / 6`
    const dots = this.container.querySelector<HTMLElement>('.signup-progress-dots')
    if (dots) dots.innerHTML = Array.from({ length: 6 }, (_, index) => `<i class="${index <= this.signupStep ? 'is-on' : ''}"></i>`).join('')
    const activeInput = this.container.querySelector<HTMLInputElement>(`.signup-step[data-signup-step="${this.signupStep}"] input`)
    if (this.signupFocusTimer !== undefined) clearTimeout(this.signupFocusTimer)
    this.signupFocusTimer = window.setTimeout(() => {
      this.signupFocusTimer = undefined
      activeInput?.focus({ preventScroll: true })
    }, 260)
  }

  private validateSignupStep(step: number): boolean {
    const value = (selector: string): string => this.container.querySelector<HTMLInputElement>(selector)?.value.trim() || ''
    if (step === 0 && value('#su-name').length < 3) {
      this.showToast({ message: '❌ Tell me your full name', type: 'error' })
      return false
    }
    if (step === 1 && !isValidContact(value('#su-contact'))) {
      this.showToast({ message: '❌ Enter a valid contact number', type: 'error' })
      return false
    }
    if (step === 2 && !isValidEmail(value('#su-email'))) {
      this.showToast({ message: '❌ Enter a valid email ID', type: 'error' })
      return false
    }
    if (step === 3 && value('#su-password').length < 6) {
      this.showToast({ message: '❌ Secret must be at least 6 characters', type: 'error' })
      return false
    }
    if (step === 4 && value('#su-confirm-password') !== value('#su-password')) {
      this.showToast({ message: '❌ Your secrets do not match', type: 'error' })
      return false
    }
    if (step === 5 && !this.container.querySelector<HTMLInputElement>('#su-terms')?.checked) {
      this.showToast({ message: '❌ Please agree before joining', type: 'error' })
      return false
    }
    return true
  }

  private advanceSignupStep(): void {
    if (!this.validateSignupStep(this.signupStep)) return
    this.signupStep = Math.min(5, this.signupStep + 1)
    this.updateSignupRoller()
  }

  private retreatSignupStep(): void {
    this.signupStep = Math.max(0, this.signupStep - 1)
    this.updateSignupRoller()
  }

  private togglePassword(button: HTMLElement): void {
    const input = document.getElementById(button.dataset.target || '') as HTMLInputElement | null
    if (!input) return
    const showing = input.type === 'password'
    input.type = showing ? 'text' : 'password'
    button.setAttribute('aria-label', showing ? 'Hide password' : 'Show password')
    button.classList.toggle('is-visible', showing)
    button.innerHTML = showing ? EYE_ON_ICON : EYE_OFF_ICON
    const icon = button.querySelector<HTMLElement>('.eye-icon')
    if (icon) {
      icon.classList.remove('eye-pop')
      void icon.offsetWidth
      icon.classList.add('eye-pop')
    }
    if (input.id === 'li-pw') {
      const mirror = this.container.querySelector<HTMLElement>('#mirror-li-pw')
      if (mirror) this.paintMirror(input, mirror, true)
    }
    input.focus({ preventScroll: true })
  }

  private paintMirror(input: HTMLInputElement, mirror: HTMLElement, isPassword: boolean): void {
    mirror.replaceChildren()
    const maxChars = isPassword ? 18 : 26
    const minScale = isPassword ? .72 : .5
    const textScale = input.value ? Math.max(minScale, Math.min(1, maxChars / input.value.length)) : 1
    mirror.style.setProperty('--mirror-scale', `${textScale}`)
    let wordIndex = 0
    input.value.split(/(\s+)/).forEach((part) => {
      if (!part) return
      if (/^\s+$/.test(part)) {
        mirror.append(document.createTextNode(part))
        return
      }
      const word = document.createElement('span')
      word.className = 'w'
      word.style.setProperty('--word-index', `${wordIndex++}`)
      word.textContent = isPassword && input.type === 'password' ? '•'.repeat(part.length) : part
      mirror.append(word)
    })
  }

  private updatePencil(input: HTMLInputElement): void {
    input.parentElement?.classList.toggle('has-value', input.value.length > 0)
  }

  private hapticFeedback(): void {
    if ('vibrate' in navigator) navigator.vibrate([18, 35, 18])
  }

  private flashLoginFields(): void {
    const fields = [
      this.container.querySelector<HTMLInputElement>('#li-id'),
      this.container.querySelector<HTMLInputElement>('#li-pw'),
    ].filter((field): field is HTMLInputElement => field !== null)
    const wrappers = fields.map(field => field.closest<HTMLElement>('.input-wrap')).filter((wrap): wrap is HTMLElement => wrap !== null)
    wrappers.forEach((wrap) => {
      wrap.classList.remove('input-error-fill')
      void wrap.offsetWidth
      wrap.classList.add('input-error-fill')
    })
    if (this.loginFlashTimer !== undefined) clearTimeout(this.loginFlashTimer)
    this.loginFlashTimer = window.setTimeout(() => {
      this.loginFlashTimer = undefined
      fields.forEach((field) => {
        field.value = ''
        field.dispatchEvent(new Event('input', { bubbles: true }))
      })
      wrappers.forEach(wrap => wrap.classList.remove('input-error-fill'))
    }, 1500)
  }

  private handlePlainPaste(event: ClipboardEvent, input: HTMLInputElement): void {
    const pasted = event.clipboardData?.getData('text/plain').replace(/[\r\n]+/g, '')
    if (pasted === undefined) return
    event.preventDefault()
    const start = input.selectionStart ?? input.value.length
    const end = input.selectionEnd ?? start
    input.setRangeText(pasted, start, end, 'end')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }

  private updateBotFromInput(identifier: HTMLInputElement, password: HTMLInputElement): void {
    const id = identifier.value.trim()
    const pw = password.value
    const validId = isValidIdentifier(id)
    this.container.querySelector<HTMLElement>('.identifier-wrap')?.classList.toggle('input-valid', Boolean(validId && id))
    this.container.querySelector<HTMLElement>('.password-wrap')?.classList.toggle('input-valid', pw.length >= 6)
    this.container.querySelector<HTMLButtonElement>('.btn-enter')?.classList.toggle('is-ready', Boolean(validId && pw.length >= 6))
    if (!id && !pw) {
      return this.setBotMood('idle')
    }
    if ((id && !validId) || (pw && pw.length < 6)) {
      this.setBotMood('worried')
    }
    else if (validId && pw.length >= 6) {
      this.setBotMood('happy')
    }
    else {
      this.setBotMood('listening')
    }
  }

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

  private showGreeting(): void {
    if (this.botBubbleSequenceTimer !== undefined) clearTimeout(this.botBubbleSequenceTimer)
    this.botBubbleSequenceTimer = undefined
    const message = authDB.getCurrentUser() ? 'welcome back' : 'welcome to hasan tech studio'
    this.showBotBubble(message, 3000)
  }

  private startBotIdleAnimation(): void {
    this.stopBotIdleAnimation?.()
    this.stopBotIdleAnimation = startTimedLoop(() => {
      const bot = this.container.querySelector<HTMLElement>('.brand-emblem')
      if (!bot || (this.currentScreen !== 'v-login' && this.currentScreen !== 'v-start') || this.isBotAnimating) return
      if (bot.dataset.mood && !['idle', 'curious'].includes(bot.dataset.mood)) return
      this.setBotMood('curious')
      if (this.botIdleRevertTimer !== undefined) clearTimeout(this.botIdleRevertTimer)
      this.botIdleRevertTimer = window.setTimeout(() => {
        this.botIdleRevertTimer = undefined
        if ((this.currentScreen === 'v-login' || this.currentScreen === 'v-start') && !this.isBotAnimating && bot.dataset.mood === 'curious') this.setBotMood('idle')
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
    this.showGreeting()
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

  private async handleLogin(form: HTMLFormElement): Promise<void> {
    const data = new FormData(form)
    const identifier = String(data.get('identifier') || '').trim()
    const password = String(data.get('password') || '')
    const validIdentifier = isValidIdentifier(identifier)
    if (!validIdentifier) {
      this.setBotMood('worried')
      this.flashBot('bot-error')
      this.flashLoginFields()
      this.showToast({ message: '❌ Enter valid email or contact', type: 'error' })
      return
    }
    if (password.length < 6) {
      this.setBotMood('worried')
      this.flashBot('bot-error')
      this.flashLoginFields()
      this.showToast({ message: '❌ Password min 6 chars', type: 'error' })
      return
    }
    const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]')
    try {
      const user = await this.withBusyButton(submitButton, () => authDB.login(identifier, password))
      recordLoginDetail(identifier)
      this.setBotMood('happy')
      this.flashBot('bot-success')
      this.showBotBubble('welcome back')
      this.showToast({ message: `✅ Welcome back${user.name ? `, ${user.name}` : ''}!`, type: 'success' })
      void pushLocal('HASAN TECH STUDIO', `Welcome back${user.name ? `, ${user.name}` : ''} — you are logged in.`)
      this.showScreen('v-work-progress')
    } catch (error) {
      this.setBotMood('worried')
      this.flashBot('bot-error')
      this.flashLoginFields()
      this.showToast({ message: this.errorMessage(error), type: 'error' })
    }
  }

  private async handleSignup(form: HTMLFormElement): Promise<void> {
    const data = new FormData(form)
    const details: SignupDetails = {
      name: String(data.get('name') || '').trim(),
      contact: String(data.get('contact') || '').trim(),
      email: String(data.get('email') || '').trim(),
      password: String(data.get('password') || ''),
    }
    const confirmation = String(data.get('confirmPassword') || '')
    const validEmail = isValidEmail(details.email)
    const validContact = isValidContact(details.contact)
    if (details.name.length < 3) return this.showToast({ message: '❌ Enter full name', type: 'error' })
    if (!validContact) return this.showToast({ message: '❌ Invalid contact', type: 'error' })
    if (!validEmail) return this.showToast({ message: '❌ Invalid email', type: 'error' })
    if (details.password.length < 6) return this.showToast({ message: '❌ Password min 6 chars', type: 'error' })
    if (details.password !== confirmation) return this.showToast({ message: '❌ Passwords not match', type: 'error' })
    if (!this.container.querySelector<HTMLInputElement>('#su-terms')?.checked) return this.showToast({ message: '❌ Please agree to continue', type: 'error' })

    const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]')
    try {
      await this.withBusyButton(submitButton, () => authDB.createUser(details))
      recordSignupDetail({ name: details.name, contact: details.contact, email: details.email })
      const loginIdentifier = this.container.querySelector<HTMLInputElement>('#li-id')
      if (loginIdentifier) {
        loginIdentifier.value = details.email
        loginIdentifier.dispatchEvent(new Event('input', { bubbles: true }))
      }
      this.signupPrefillIdentifier = ''
      this.showToast({ message: `🎉 ${details.name}, account created! Check your email to verify.`, type: 'success' })
      void pushLocal('HASAN TECH STUDIO', `Account created for ${details.name} — verify your email.`)
      this.configureReverify(details.email)
      this.showScreen('v-reverify')
    } catch (error) {
      this.showToast({ message: this.errorMessage(error), type: 'error' })
    }
  }

  private configureReverify(identifier: string): void {
    const email = identifier || authDB.getCurrentUser()?.email || ''
    const title = this.container.querySelector<HTMLElement>('#reverify-title')
    if (title) title.innerHTML = 'Verify your email ✉️<small>We sent a verification link to your inbox</small>'
    const identifierInput = this.container.querySelector<HTMLInputElement>('#rv-id')
    if (identifierInput) {
      identifierInput.value = email
      identifierInput.readOnly = true
    }
  }

  /** "I've verified" — re-reads the Firebase user and checks the email flag. */
  private async handleReverify(form: HTMLFormElement): Promise<void> {
    if (!authDB.getCurrentUser()) {
      this.showToast({ message: 'Sign in first, then verify your email.', type: 'warning' })
      return
    }
    const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]')
    try {
      const verified = await this.withBusyButton(submitButton, () => authDB.reloadVerification())
      if (verified) {
        this.showToast({ message: '✅ Email verified!', type: 'success' })
        this.showScreen('v-work-progress')
      } else {
        this.showToast({ message: 'Not verified yet — open the link in your email, then try again.', type: 'warning' })
      }
    } catch (error) {
      this.showToast({ message: this.errorMessage(error), type: 'error' })
    }
  }

  /** Sends a Firebase password-reset email. */
  async resetPasswordWithFeedback(identifier: string, button: HTMLButtonElement | null): Promise<void> {
    try {
      await this.withBusyButton(button, () => authDB.resetPassword(identifier))
      this.showToast({ message: '✅ Password reset email sent.', type: 'success' })
      this.showScreen('v-login')
    } catch (error) {
      this.showToast({ message: this.errorMessage(error), type: 'error' })
    }
  }

  /** Sends (or resends) the Firebase email-verification link. */
  private async sendOTP(): Promise<void> {
    try {
      await authDB.sendVerificationEmail()
      const sendButton = this.container.querySelector<HTMLButtonElement>('[data-action="send-otp"]')
      if (sendButton) {
        sendButton.textContent = 'Sent ✓'
        sendButton.classList.add('sent')
      }
      const email = authDB.getCurrentUser()?.email || ''
      this.showToast({ message: `📩 Verification link sent${email ? ` to ${email}` : ''}.`, type: 'info' })
    } catch (error) {
      this.showToast({ message: this.errorMessage(error), type: 'error' })
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
  }

  /** Fill the post-login screen with the signed-in user's details. */
  private renderDashboard(): void {
    const mount = this.container.querySelector<HTMLElement>('.work-progress-screen')
    if (!mount) return
    const user = authDB.getCurrentUser()
    if (!user) {
      mount.replaceChildren()
      return
    }
    const fmt = (ts: number): string => (ts ? new Date(ts).toLocaleString() : '—')
    const hasCode = authDB.hasPasscode(user.id)
    const recent = getLoginDetails().slice(0, 5)
    const activity = recent.length
      ? `<ul class="dash-activity">${recent.map(item => `<li><span>${escapeHtml(item.identifier)}</span><time>${fmt(item.loggedInAt)}</time></li>`).join('')}</ul>`
      : '<p class="dash-muted">No recent logins recorded.</p>'
    mount.innerHTML = `
      <div class="dash">
        <h1 class="dash-hello">Welcome back, ${escapeHtml(user.name || user.email)}</h1>
        ${user.emailVerified ? '' : '<div class="dash-banner">Your email is not verified yet. <button class="dash-banner-btn" type="button" data-action="verify-email">Send verification email</button></div>'}
        <div class="dash-grid">
          <section class="dash-card">
            <h2>Profile</h2>
            <dl class="dash-list">
              <dt>Name</dt><dd>${escapeHtml(user.name)}</dd>
              <dt>Email</dt><dd>${escapeHtml(user.email)}</dd>
              <dt>Contact</dt><dd>${escapeHtml(user.contact)}</dd>
              <dt>Member since</dt><dd>${fmt(user.createdAt)}</dd>
              <dt>Logins</dt><dd>${user.loginCount}</dd>
              <dt>Last login</dt><dd>${fmt(user.lastLoginAt)}</dd>
            </dl>
          </section>
          <section class="dash-card">
            <h2>Security</h2>
            <p class="dash-muted">Access code: <b>${hasCode ? 'set' : 'not set'}</b></p>
            <button class="dash-btn" type="button" data-action="set-passcode">${hasCode ? 'Change access code' : 'Set access code'}</button>
            <button class="dash-btn dash-btn-ghost" type="button" data-action="notify-toggle">Notifications</button>
            <button class="dash-btn dash-btn-danger" type="button" data-action="logout">Log out</button>
          </section>
        </div>
        <section class="dash-card">
          <h2>Recent activity</h2>
          ${activity}
        </section>
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
