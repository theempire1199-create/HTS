import { authDB } from '../AuthDB'
import type { ToastOptions } from '../index'
import { pushLocal } from '../Notify'
import { focusFast } from '../PerformanceLayer'
import { FP_CRED_KEY, FP_MAX_ATTEMPTS, STORAGE_UNAVAILABLE_MESSAGE } from '../utils/constants'
import { FP_ICON } from '../utils/icons'

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

export interface LockScreenEvents {
  toast: (options: ToastOptions) => void
  /** Code ya fingerprint success — shell celebrate karke main par le jata hai. */
  onUnlock: () => void
  /** Wrong code — shell mascot ko worried flash karta hai. */
  onWrongCode: () => void
}

/** Lock screen: 6-digit code gate + WebAuthn fingerprint flow. */
export class LockScreen {
  private readonly container: HTMLElement
  private readonly events: LockScreenEvents
  private passcodeMode: 'verify' | 'set' | 'confirm' = 'verify'
  private pendingPasscode = ''
  private passcodeResolving = false
  private isFpBusy = false
  private fpAttempts = 0
  private passcodeResetTimer: number | undefined
  private bound = false

  constructor(container: HTMLElement, events: LockScreenEvents) {
    this.container = container
    this.events = events
  }

  /** Overlay markup ek baar inject + input bindings. Shell init se call hota hai. */
  ensureMounted(): void {
    if (this.container.querySelector('#passcode-overlay')) return
    this.container.insertAdjacentHTML('beforeend', `
      <div class="passcode-overlay" id="passcode-overlay" hidden>
        <div class="passcode-card" role="dialog" aria-modal="true" aria-labelledby="passcode-title">
          <div class="passcode-title" id="passcode-title">Enter Code</div>
          <div class="passcode-sub">Fill your 6-digit access code</div>
          <div class="passcode-dots" id="passcode-dots" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>
          <div class="input-wrap passcode-wrap"><input id="passcode-input" type="tel" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" enterkeyhint="done" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="6" placeholder="••••••" aria-label="6-digit access code"></div>
          <div class="passcode-error" id="passcode-error" hidden>Wrong code, try again</div>
          <button class="passcode-fp" id="fp-button" type="button" data-action="fingerprint" hidden aria-label="Unlock with fingerprint"><span class="passcode-fp-icon" aria-hidden="true">${FP_ICON}</span></button>
        </div>
      </div>
    `)
    this.bindInput()
  }

  /** Gate overlay khula hai ya nahi — shell fingerprint routing ke liye. */
  isOpen(): boolean {
    const overlay = this.container.querySelector<HTMLElement>('#passcode-overlay')
    return !!overlay && !overlay.hidden
  }

  hidePopup(): void {
    const overlay = this.container.querySelector<HTMLElement>('#passcode-overlay')
    if (!overlay) return
    overlay.classList.remove('show')
    overlay.hidden = true
  }

  /** Pehli baar code set hota hai, uske baad har baar verify + fingerprint-first. */
  openGate(): void {
    if (authDB.hasPasscode()) this.showPasscodePopup()
    else this.openPasscodeSetup()
  }

  /** First-run + "Change access code": fingerprint + 6-digit code setup. */
  openPasscodeSetup(): void {
    const overlay = this.container.querySelector<HTMLElement>('#passcode-overlay')
    const input = this.container.querySelector<HTMLInputElement>('#passcode-input')
    const error = this.container.querySelector<HTMLElement>('#passcode-error')
    const card = this.container.querySelector<HTMLElement>('.passcode-card')
    if (!overlay || !input) return
    this.passcodeMode = 'set'
    this.pendingPasscode = ''
    this.passcodeResolving = false
    card?.classList.remove('code-ok', 'code-error', 'passcode-shake')
    this.setPasscodeCopy('Set access code', 'Choose a 6-digit code — ya 👆 se fingerprint lagao')
    if (error) error.hidden = true
    input.value = ''
    this.updatePasscodeDots('')
    overlay.hidden = false
    void overlay.offsetWidth
    overlay.classList.add('show')
    // Setup me fingerprint button dikhao taaki pehli baar me hi dono set ho jayein.
    void this.refreshFingerprintButton()
    // No 200ms lag — rAF focus opens the keyboard within the tap.
    focusFast(input)
  }

  /** Gate par fingerprint button — success = unlock. */
  async handleGateFingerprint(): Promise<void> {
    if (this.isFpBusy) return
    if (!(await this.fingerprintSupported())) {
      this.events.toast({ message: 'Fingerprint is not available on this device.', type: 'error' })
      return
    }
    this.isFpBusy = true
    const button = this.container.querySelector<HTMLElement>('#fp-button')
    button?.classList.add('fp-busy')
    try {
      // Setup mode (first time / change code): sirf fingerprint REGISTER karo,
      // unlock nahi — code flow uske baad jari rehta hai.
      if (this.passcodeMode !== 'verify') {
        this.events.toast({ message: 'Touch the sensor to add your fingerprint (optional).', type: 'info' })
        try {
          await this.registerFingerprint()
          this.events.toast({ message: '✅ Fingerprint added — ab code set karo.', type: 'success' })
          void pushLocal('HASAN TECH STUDIO', 'Fingerprint registered.')
          void this.refreshFingerprintButton()
        } catch (error) {
          if (!(error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'AbortError'))) {
            this.events.toast({ message: this.fpErrorMessage(error), type: 'error' })
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
            this.events.toast({ message: 'Fingerprint changed — tap again to register.', type: 'warning' })
            return
          }
          this.registerFpStrike()
          throw error
        }
      } else {
        this.events.toast({ message: 'Touch the sensor to register your fingerprint.', type: 'info' })
        try {
          await this.registerFingerprint()
          void pushLocal('HASAN TECH STUDIO', 'Fingerprint registered.')
        } catch (error) {
          this.registerFpStrike()
          throw error
        }
      }
      this.hidePopup()
      void pushLocal('HASAN TECH STUDIO', 'Unlocked with fingerprint.')
      this.events.onUnlock()
    } catch (error) {
      if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'AbortError')) {
        // Silent cancel/deny — code card is already there, zero irritation.
      } else {
        this.events.toast({ message: this.fpErrorMessage(error), type: 'error' })
      }
    } finally {
      this.isFpBusy = false
      button?.classList.remove('fp-busy')
    }
  }

  destroy(): void {
    if (this.passcodeResetTimer !== undefined) clearTimeout(this.passcodeResetTimer)
    this.passcodeResetTimer = undefined
  }

  private bindInput(): void {
    if (this.bound) return
    this.bound = true
    const passcodeInput = this.container.querySelector<HTMLInputElement>('#passcode-input')
    passcodeInput?.addEventListener('input', () => this.handlePasscodeInput())
    passcodeInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') void this.submitPasscode()
    })
    // Tap anywhere on the card = instant keyboard. Guard avoids re-focus flicker.
    this.container.querySelector<HTMLElement>('.passcode-card')?.addEventListener('click', (event) => {
      if ((event.target as HTMLElement | null)?.closest?.('#fp-button')) return
      if (passcodeInput && document.activeElement !== passcodeInput) focusFast(passcodeInput)
    })
  }

  private setPasscodeCopy(title: string, sub: string): void {
    const titleEl = this.container.querySelector<HTMLElement>('#passcode-title')
    if (titleEl) titleEl.textContent = title
    const subEl = this.container.querySelector<HTMLElement>('.passcode-sub')
    if (subEl) subEl.textContent = sub
  }

  private showPasscodePopup(): void {
    const overlay = this.container.querySelector<HTMLElement>('#passcode-overlay')
    const input = this.container.querySelector<HTMLInputElement>('#passcode-input')
    const error = this.container.querySelector<HTMLElement>('#passcode-error')
    const card = this.container.querySelector<HTMLElement>('.passcode-card')
    if (!overlay || !input) return
    this.passcodeMode = 'verify'
    this.pendingPasscode = ''
    this.passcodeResolving = false
    card?.classList.remove('code-ok', 'code-error', 'passcode-shake')
    this.setPasscodeCopy('Enter Code', 'Fill your 6-digit access code')
    if (error) error.hidden = true
    input.value = ''
    this.updatePasscodeDots('')
    this.fpAttempts = 0
    overlay.hidden = false
    void overlay.offsetWidth
    overlay.classList.add('show')
    // Fingerprint FIRST — sensor prompt auto, fail ho to code se kholo.
    void this.refreshFingerprintButton().then(() => {
      void this.autoFingerprint()
      // http (LAN IP) link par browser fingerprint allow nahi karta —
      // user confuse na ho, isliye seedha bata do.
      if (!window.isSecureContext) {
        this.events.toast({ message: 'Ye http link hai — fingerprint yahan nahi chalega. Vercel wala https link kholo, ya code se kholo.', type: 'warning', duration: 5000 })
      }
    })
    if (!readFpCredentialId()) {
      // Fingerprint not registered — focus instantly via rAF, no 350ms wait.
      focusFast(input)
    }
  }

  private handlePasscodeInput(): void {
    const input = this.container.querySelector<HTMLInputElement>('#passcode-input')
    if (!input) return
    // Only rewrite when filtering actually changed something — avoids cursor
    // jump / keyboard flicker that feels like a "glitch" while typing fast.
    const clean = input.value.replace(/\D/g, '').slice(0, 6)
    if (clean !== input.value) input.value = clean
    this.updatePasscodeDots(clean)
    const error = this.container.querySelector<HTMLElement>('#passcode-error')
    if (error) error.hidden = true
    if (clean.length === 6) void this.submitPasscode()
  }

  private async submitPasscode(): Promise<void> {
    const input = this.container.querySelector<HTMLInputElement>('#passcode-input')
    if (!input || this.passcodeResolving) return
    const value = input.value
    if (value.length !== 6) return
    if (this.passcodeMode === 'set') {
      this.pendingPasscode = value
      this.passcodeMode = 'confirm'
      this.setPasscodeCopy('Confirm access code', 'Re-enter your 6-digit code')
      input.value = ''
      this.updatePasscodeDots('')
      focusFast(input)
      return
    }
    if (this.passcodeMode === 'confirm') {
      if (value === this.pendingPasscode) {
        try {
          await authDB.setPasscode(value)
          this.pendingPasscode = ''
          this.passcodeMode = 'verify'
          this.events.toast({ message: '✅ Access code saved.', type: 'success' })
          void pushLocal('HASAN TECH STUDIO', 'Access code saved.')
          await this.flashOkAndUnlock()
        } catch (error) {
          this.events.toast({ message: this.errorMessage(error), type: 'error' })
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
        await this.flashOkAndUnlock()
        return
      }
    } catch (error) {
      this.events.toast({ message: this.errorMessage(error), type: 'error' })
      return
    }
    if (input.value.length === 6) {
      this.events.onWrongCode()
      this.passcodeError('Wrong code, try again')
      this.events.toast({ message: '❌ Wrong code, try again', type: 'error' })
      this.resetPasscodeInput(input)
    }
  }

  /** Correct code complete — stroke flashes GREEN, then unlock. */
  private async flashOkAndUnlock(): Promise<void> {
    const card = this.container.querySelector<HTMLElement>('.passcode-card')
    const input = this.container.querySelector<HTMLInputElement>('#passcode-input')
    this.passcodeResolving = true
    card?.classList.remove('code-error')
    card?.classList.add('code-ok')
    await new Promise<void>((resolve) => window.setTimeout(resolve, 550))
    if (input) {
      input.value = ''
      this.updatePasscodeDots('')
    }
    card?.classList.remove('code-ok')
    this.passcodeResolving = false
    this.hidePopup()
    this.events.onUnlock()
  }

  private resetPasscodeInput(input: HTMLInputElement): void {
    if (this.passcodeResetTimer !== undefined) clearTimeout(this.passcodeResetTimer)
    this.passcodeResetTimer = window.setTimeout(() => {
      this.passcodeResetTimer = undefined
      input.value = ''
      this.updatePasscodeDots('')
      this.container.querySelector<HTMLElement>('.passcode-card')?.classList.remove('code-error')
      focusFast(input)
    }, 650)
  }

  private passcodeError(message: string): void {
    const card = this.container.querySelector<HTMLElement>('.passcode-card')
    const error = this.container.querySelector<HTMLElement>('#passcode-error')
    if (error) { error.textContent = message; error.hidden = false }
    card?.classList.remove('passcode-shake')
    void card?.offsetWidth
    card?.classList.add('passcode-shake')
    // Wrong input — stroke turns RED.
    card?.classList.add('code-error')
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
    if (!button) return
    // Icon-only round button — no text label to load or shift layout.
    const ok = (await this.fingerprintSupported()) && !!navigator.credentials
    button.hidden = !ok
  }

  private registerFpStrike(): void {
    this.fpAttempts += 1
    if (this.fpAttempts < FP_MAX_ATTEMPTS) return
    const button = this.container.querySelector<HTMLElement>('#fp-button')
    if (button) button.hidden = true
    this.events.toast({ message: 'Use your code instead.', type: 'info' })
  }

  private async registerFingerprint(): Promise<void> {
    if (!navigator.credentials) throw new Error('WebAuthn is unavailable.')
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        // rp.id explicit = current host. Browsers default to the same value,
        // but an explicit id avoids "invalid domain"-style failures where the
        // default cannot be computed (wrappers, portals, odd hosts).
        rp: { name: 'HASAN TECH STUDIO', id: window.location.hostname },
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
      this.events.toast({ message: STORAGE_UNAVAILABLE_MESSAGE, type: 'warning' })
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
      this.hidePopup()
      void pushLocal('HASAN TECH STUDIO', 'Unlocked with fingerprint.')
      this.events.onUnlock()
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

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
  }

  /** Fingerprint failures show the exact browser error (name + message) so the cause is diagnosable. */
  private fpErrorMessage(error: unknown): string {
    if (error instanceof DOMException) {
      const detail = error.message ? `${error.name}: ${error.message}` : error.name
      if (error.name === 'SecurityError') {
        return `${detail} (page HTTPS/localhost par kholo, aur domain sahi honi chahiye)`
      }
      return detail
    }
    return this.errorMessage(error)
  }
}
