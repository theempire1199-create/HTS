import { authDB } from './AuthDB'
import type { OTPPurpose, ScreenId, SignupDetails, ToastOptions } from './index'
import { isValidContact, isValidEmail, isValidIdentifier } from './index'
import { rafThrottle, startTimedLoop } from './PerformanceLayer'
import { recordLoginDetail } from './LoginDetails'
import { recordSignupDetail } from './SignupDetails'
import { currentPermission, enableNotifications, notifySupported, prefEnabled, pushLocal, setPref } from './Notify'

const BELL_ON_ICON = '<svg class="bell-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>'
const BELL_OFF_ICON = '<svg class="bell-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.7 3A6 6 0 0 1 18 8c0 4 1.4 6.3 2.3 7.5"/><path d="M6.3 6.3C6.1 6.9 6 7.4 6 8c0 7-3 9-3 9h14"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><line x1="2" y1="2" x2="22" y2="22"/></svg>'

const EYE_OFF_ICON = '<svg class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19 15.6 15.6 0 0 1-2.66 2.58"/><path d="M6.61 6.61A13.5 13.5 0 0 0 1 12s3 8 11 8a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>'
const EYE_ON_ICON = '<svg class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>'
const ACCESS_PASSCODE = '119911'
const FP_CRED_KEY = 'hts_fp_cred_v1'
const FP_MAX_ATTEMPTS = 3

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

export class AuthUI {
  private readonly container: HTMLElement
  private currentScreen: ScreenId = 'v-start'
  private otpPurpose: OTPPurpose = 'recovery'
  private otpIdentifier = ''
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
  private isFpBusy = false
  private fpAttempts = 0
  private initialized = false
  private stopBotIdleAnimation: (() => void) | undefined
  private readonly companionImage = new URL('./IMG-20261008-WA6370.jpg', import.meta.url).href

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
      this.configureReverify('recovery', '')
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
                  <label for="li-id">Email ID or Contact Number</label>
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
                    <div class="input-wrap signup-secret-wrap"><input id="su-password" name="password" type="password" autocomplete="new-password" placeholder="At least 6 characters" minlength="6" required><button type="button" class="eye signup-eye" aria-label="Show secret" data-action="toggle-password" data-target="su-password">${EYE_OFF_ICON}</button></div>
                    <div class="signup-step-actions"><button class="signup-prev" type="button" data-action="signup-prev" aria-label="Previous step">←</button><button class="signup-next" type="button" data-action="signup-next" aria-label="Next step">→</button></div>
                  </fieldset>
                  <fieldset class="signup-step" data-signup-step="4" aria-hidden="true">
                    <div class="signup-step-title" role="heading" aria-level="2">Confirm your secret</div>
                    <div class="input-wrap signup-secret-wrap"><input id="su-confirm-password" name="confirmPassword" type="password" autocomplete="new-password" placeholder="Repeat your secret" minlength="6" required><button type="button" class="eye signup-eye" aria-label="Show secret" data-action="toggle-password" data-target="su-confirm-password">${EYE_OFF_ICON}</button></div>
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
            <h1 class="title screen-title" id="reverify-title">Re-verify 🔄<small>Verify your email / number with OTP</small></h1>
            <div class="auth-card reverify-card" id="card3">
              <form id="reverify-form" class="auth-form" novalidate>
                <label for="rv-id">Email ID or Contact</label>
                <div class="otp-row">
                  <div class="input-wrap"><input id="rv-id" autocomplete="username" placeholder="you@email.com / number" required></div>
                  <button type="button" class="mini-button" data-action="send-otp">Send OTP</button>
                </div>
                <label for="rv-otp">Enter OTP</label>
                <div class="input-wrap"><input id="rv-otp" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="6-digit OTP" required></div>
                <button class="primary-button" type="submit">VERIFY →</button>
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

    const loginCard = this.container.querySelector<HTMLElement>('#card1')
    let borderTimer: number | undefined
    loginCard?.addEventListener('pointerdown', () => {
      loginCard.classList.remove('card-awake')
      void loginCard.offsetWidth
      loginCard.classList.add('card-awake')
      if (borderTimer) clearTimeout(borderTimer)
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

    this.container.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-action]') : null
      if (!target) return
      const action = target.dataset.action
      if (action === 'show-screen') {
        const screen = target.dataset.screen
        if (screen === 'v-start' || screen === 'v-login' || screen === 'v-signup' || screen === 'v-reverify' || screen === 'v-work-progress') this.showScreen(screen)
      }
      if (action === 'toggle-password') this.togglePassword(target)
      if (action === 'send-otp') this.sendOTP()
      if (action === 'notify-toggle') void this.toggleNotifications()
      if (action === 'fingerprint') void this.handleFingerprint()
      if (action === 'signup-next') this.advanceSignupStep()
      if (action === 'signup-prev') this.retreatSignupStep()
      if (action === 'logout') this.logout()
      if (action === 'terms-link' || action === 'privacy-link') event.preventDefault()
    })

    this.container.addEventListener('submit', (event) => {
      event.preventDefault()
      const form = event.target
      if (!(form instanceof HTMLFormElement)) return
      if (form.id === 'login-form') {
        this.hapticFeedback()
        void this.handleLogin(form)
      }
      if (form.id === 'signup-form') void this.handleSignup(form)
      if (form.id === 'reverify-form') void this.handleReverify(form)
    })

    this.container.querySelector<HTMLInputElement>('#rv-otp')?.addEventListener('input', (event) => {
      const input = event.currentTarget as HTMLInputElement
      input.value = input.value.replace(/\D/g, '').slice(0, 6)
    })

    const passcodeInput = this.container.querySelector<HTMLInputElement>('#passcode-input')
    passcodeInput?.addEventListener('input', () => this.handlePasscodeInput())
    passcodeInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.verifyPasscode()
    })
    this.container.querySelector<HTMLElement>('.passcode-card')?.addEventListener('click', () => {
      passcodeInput?.focus({ preventScroll: true })
    })

    const loginIdentifier = this.container.querySelector<HTMLInputElement>('#li-id')!
    const loginPassword = this.container.querySelector<HTMLInputElement>('#li-pw')!
    const identifierMirror = this.container.querySelector<HTMLElement>('#mirror-li-id')!
    const passwordMirror = this.container.querySelector<HTMLElement>('#mirror-li-pw')!
    loginIdentifier.addEventListener('input', () => this.paintMirror(loginIdentifier, identifierMirror, false))
    loginPassword.addEventListener('input', () => this.paintMirror(loginPassword, passwordMirror, true))
    loginIdentifier.addEventListener('paste', (event) => this.handlePlainPaste(event, loginIdentifier))
    loginPassword.addEventListener('paste', (event) => this.handlePlainPaste(event, loginPassword))
    loginIdentifier.addEventListener('input', () => this.updatePencil(loginIdentifier))
    loginPassword.addEventListener('input', () => this.updatePencil(loginPassword))
    loginIdentifier.addEventListener('input', () => this.updateBotFromInput(loginIdentifier, loginPassword))
    loginPassword.addEventListener('input', () => this.updateBotFromInput(loginIdentifier, loginPassword))
    loginIdentifier.addEventListener('focus', () => this.setBotMood('listening'))
    loginPassword.addEventListener('focus', () => this.setBotMood('listening'))
    loginIdentifier.addEventListener('blur', () => this.updateBotFromInput(loginIdentifier, loginPassword))
    loginPassword.addEventListener('blur', () => this.updateBotFromInput(loginIdentifier, loginPassword))

    const tiltCards = [
      this.container.querySelector<HTMLElement>('#card2'),
      this.container.querySelector<HTMLElement>('#card3'),
    ].filter((card): card is HTMLElement => card !== null)
    const mouseTilt = rafThrottle<MouseEvent>((event) => {
      const x = event.clientX / window.innerWidth - .5
      const y = event.clientY / window.innerHeight - .5
      tiltCards.forEach(card => { card.style.transform = `perspective(1000px) rotateX(${2 - y * 6}deg) rotateY(${-2 + x * 6}deg)` })
    })
    document.addEventListener('mousemove', mouseTilt.handler, { passive: true })
    tiltCards.forEach(card => {
      const touchTilt = rafThrottle<TouchEvent>((event) => {
        const touch = event.touches[0]
        if (!touch) return
        const x = touch.clientX / window.innerWidth - .5
        const y = touch.clientY / window.innerHeight - .5
        card.style.transform = `perspective(1000px) rotateX(${2 - y * 6}deg) rotateY(${-2 + x * 6}deg)`
      })
      card.addEventListener('touchmove', touchTilt.handler, { passive: true })
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
    tests.forEach(([title, body, tag], index) => {
      window.setTimeout(() => {
        void pushLocal(title, body, tag)
      }, index * 2000)
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
      if (authDB.getCurrentUser()) {
        this.showPasscodePopup()
      } else {
        this.showScreen('v-login')
      }
    }, 10000)
  }

  private clearSplashTimer(): void {
    if (this.splashTimer) clearTimeout(this.splashTimer)
    this.splashTimer = undefined
  }

  private showPasscodePopup(): void {
    const overlay = this.container.querySelector<HTMLElement>('#passcode-overlay')
    const input = this.container.querySelector<HTMLInputElement>('#passcode-input')
    const error = this.container.querySelector<HTMLElement>('#passcode-error')
    if (!overlay || !input) return
    if (error) error.hidden = true
    input.value = ''
    this.updatePasscodeDots('')
    this.fpAttempts = 0
    overlay.hidden = false
    void overlay.offsetWidth
    overlay.classList.add('show')
    void this.refreshFingerprintButton().then(() => this.autoFingerprint())
    if (!this.fpCredentialIdForCurrentUser()) {
      window.setTimeout(() => input.focus({ preventScroll: true }), 350)
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
    if (input.value.length === 6) this.verifyPasscode()
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
            try {
              localStorage.setItem(FP_CRED_KEY, JSON.stringify(store))
            } catch {
              // Store cleanup is best-effort; re-registration still works.
            }
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
        try {
          localStorage.setItem(FP_CRED_KEY, JSON.stringify(store))
        } catch {
          // Best-effort cleanup; manual re-register still works.
        }
      } else {
        this.registerFpStrike()
      }
      // Silent on auto path: code card is already visible for code or manual tap.
    } finally {
      this.isFpBusy = false
      button?.classList.remove('fp-busy')
    }
  }

  private verifyPasscode(): void {
    const input = this.container.querySelector<HTMLInputElement>('#passcode-input')
    const card = this.container.querySelector<HTMLElement>('.passcode-card')
    if (!input) return
    if (input.value === ACCESS_PASSCODE) {
      input.value = ''
      this.updatePasscodeDots('')
      this.hidePasscodePopup()
      void pushLocal('HASAN TECH STUDIO', 'Unlocked with access code.')
      this.restoreRememberedSession()
      return
    }
    if (input.value.length === 6) {
      card?.classList.remove('passcode-shake')
      void card?.offsetWidth
      card?.classList.add('passcode-shake')
      const error = this.container.querySelector<HTMLElement>('#passcode-error')
      if (error) error.hidden = false
      this.showToast({ message: '❌ Wrong code, try again', type: 'error' })
      window.setTimeout(() => {
        input.value = ''
        this.updatePasscodeDots('')
        input.focus({ preventScroll: true })
      }, 650)
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
    if (this.signupFocusTimer) clearTimeout(this.signupFocusTimer)
    this.signupFocusTimer = window.setTimeout(() => activeInput?.focus({ preventScroll: true }), 260)
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
    if (input.id === 'li-pw') this.paintMirror(input, this.container.querySelector<HTMLElement>('#mirror-li-pw')!, true)
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
    window.setTimeout(() => {
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
    if (this.avatarRevealTimer) clearTimeout(this.avatarRevealTimer)
    if (this.avatarHideTimer) clearTimeout(this.avatarHideTimer)
    if (this.avatarCloseTimer) clearTimeout(this.avatarCloseTimer)
    emblem.classList.remove('avatar-revealed', 'eyes-closing')
    emblem.classList.add('eyes-opening')
    this.avatarRevealTimer = window.setTimeout(() => emblem.classList.add('avatar-revealed'), 520)
    this.avatarHideTimer = window.setTimeout(() => this.hideAvatar(), duration)
  }

  private hideAvatar(): void {
    const emblem = this.container.querySelector<HTMLElement>('.brand-emblem')
    if (!emblem) return
    if (this.avatarRevealTimer) clearTimeout(this.avatarRevealTimer)
    if (this.avatarHideTimer) clearTimeout(this.avatarHideTimer)
    if (this.avatarCloseTimer) clearTimeout(this.avatarCloseTimer)
    this.avatarRevealTimer = undefined
    this.avatarHideTimer = undefined
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
    if (this.botBubbleTimer) clearTimeout(this.botBubbleTimer)
    if (reveal) this.revealAvatar(duration)
    bubble.textContent = message
    bubble.classList.remove('show')
    talk?.classList.toggle('side-left', Math.random() < 0.5)
    void bubble.offsetWidth
    bubble.classList.add('show')
    this.botBubbleTimer = window.setTimeout(() => bubble.classList.remove('show'), duration)
  }

  private showGreeting(): void {
    if (this.botBubbleSequenceTimer) clearTimeout(this.botBubbleSequenceTimer)
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
      window.setTimeout(() => {
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
    window.setTimeout(() => bot.classList.remove(animationClass), 850)
  }

  private triggerBotFall(): void {
    const emblem = this.container.querySelector<HTMLElement>('.brand-emblem')
    if (!emblem || this.isBotAnimating) return
    this.isBotAnimating = true
    this.showGreeting()
    const previousMood = emblem.dataset.mood || 'idle'
    window.setTimeout(() => {
      emblem.dataset.mood = previousMood
      window.setTimeout(() => { this.isBotAnimating = false }, 1000)
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
    if (!authDB.hasAccount(identifier)) {
      this.setBotMood('happy')
      this.flashBot('bot-success')
      this.showBotBubble('welcome to hasan tech studio')
      this.signupPrefillIdentifier = identifier
      this.showToast({ message: '🆕 Not signed up yet — taking you to signup...', type: 'info' })
      this.showScreen('v-signup')
      return
    }
    try {
      const user = await authDB.login(identifier, password)
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

    try {
      await authDB.createUser(details)
      recordSignupDetail({ name: details.name, contact: details.contact, email: details.email })
      const loginIdentifier = this.container.querySelector<HTMLInputElement>('#li-id')
      if (loginIdentifier) {
        loginIdentifier.value = details.email
        loginIdentifier.dispatchEvent(new Event('input', { bubbles: true }))
      }
      this.signupPrefillIdentifier = ''
      this.showToast({ message: `🎉 ${details.name}, signed up! Please login now.`, type: 'success' })
      void pushLocal('HASAN TECH STUDIO', `Account created for ${details.name} — please login.`)
      this.showScreen('v-login')
    } catch (error) {
      this.showToast({ message: this.errorMessage(error), type: 'error' })
    }
  }

  private issueOTP(): void {
    const code = authDB.startOTP(this.otpIdentifier, this.otpPurpose)
    const sendButton = this.container.querySelector<HTMLButtonElement>('[data-action="send-otp"]')
    if (sendButton) {
      sendButton.textContent = 'Sent ✓'
      sendButton.classList.add('sent')
    }
    this.showToast({ message: `📩 OTP sent for reverify (demo: ${code})`, type: 'info' })
  }

  private configureReverify(purpose: OTPPurpose, identifier: string): void {
    this.otpPurpose = purpose
    this.otpIdentifier = identifier
    this.container.querySelector('#reverify-title')!.innerHTML = 'Re-verify 🔄<small>Verify your email / number with OTP</small>'
    const identifierInput = this.container.querySelector<HTMLInputElement>('#rv-id')!
    identifierInput.value = identifier
    identifierInput.readOnly = false
    this.container.querySelector<HTMLInputElement>('#rv-otp')!.value = ''
  }

  private async handleReverify(_form: HTMLFormElement): Promise<void> {
    const identifier = this.container.querySelector<HTMLInputElement>('#rv-id')!.value.trim()
    const code = this.container.querySelector<HTMLInputElement>('#rv-otp')!.value.trim()
    if (!identifier || !isValidIdentifier(identifier)) {
      this.showToast({ message: 'Enter a valid email or contact number.', type: 'error' })
      return
    }
    if (identifier.toLowerCase() !== this.otpIdentifier.toLowerCase()) {
      this.showToast({ message: 'Send a verification code for this email or number first.', type: 'warning' })
      return
    }
    if (!authDB.verifyOTP(identifier, code, this.otpPurpose)) {
      this.showToast({ message: 'That code is incorrect or expired. Request a new one and try again.', type: 'error' })
      return
    }
    this.showToast({ message: '✅ Re-verified successfully!', type: 'success' })
    this.showScreen('v-login')
  }

  private sendOTP(): void {
    const identifier = this.container.querySelector<HTMLInputElement>('#rv-id')?.value.trim() || ''
    if (!isValidIdentifier(identifier)) {
      this.showToast({ message: 'Enter a valid email or contact number.', type: 'error' })
      return
    }
    if (this.otpPurpose === 'recovery' && !authDB.hasAccount(identifier)) {
      this.showToast({ message: 'No account was found for that email or contact number.', type: 'error' })
      return
    }
    this.otpIdentifier = identifier
    this.issueOTP()
    this.container.querySelector<HTMLInputElement>('#rv-otp')!.value = ''
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
  }

  private showToast(options: ToastOptions): void {
    const toast = this.container.querySelector<HTMLElement>('#toast')
    if (!toast) return
    toast.textContent = options.message
    toast.className = `show ${options.type || 'info'}`
    if (this.toastTimeout) clearTimeout(this.toastTimeout)
    this.toastTimeout = window.setTimeout(() => toast.classList.remove('show'), options.duration || 3000)
  }
}
