export function renderReverifyScreen(): string {
  return `
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
  `
}