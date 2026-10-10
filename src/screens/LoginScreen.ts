export function renderLoginScreen(): string {
  return `
    <section class="view" id="v-login" aria-labelledby="login-title" hidden>
      <h1 class="title" id="login-title">INITIALIZE ACCESS</h1>
      <div class="scene" id="scene1">
        <div class="round3d thali-card login-orb" id="card1">
          <div class="thali-plate"><div class="thali-inner">
            <form id="login-form" class="auth-form" novalidate>
              <label for="li-id">Email ID or Contact Number</label>
              <div class="input-wrap mirror-wrap identifier-wrap">
                <input id="li-id" name="identifier" autocomplete="username" required>
                <span class="input-pencil" aria-hidden="true">|</span>
                <div class="mirror" id="mirror-li-id" aria-hidden="true"></div>
              </div>
              <label for="li-pw">Password</label>
              <div class="input-wrap mirror-wrap password-wrap">
                <input id="li-pw" name="password" type="password" autocomplete="current-password" minlength="6" required>
                <span class="input-pencil" aria-hidden="true">|</span>
                <div class="mirror" id="mirror-li-pw" aria-hidden="true"></div>
                <button type="button" class="eye" aria-label="Show password" data-action="toggle-password" data-target="li-pw"></button>
              </div>
              <button class="primary-button btn-enter" type="submit"><span>ENTER</span></button>
            </form>
          </div></div>
        </div>
      </div>
    </section>
  `
}