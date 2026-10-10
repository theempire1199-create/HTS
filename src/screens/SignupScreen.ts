export function renderSignupScreen(): string {
  return `
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
                <div class="input-wrap signup-secret-wrap"><input id="su-password" name="password" type="password" autocomplete="new-password" placeholder="At least 6 characters" minlength="6" required><button type="button" class="eye signup-eye" aria-label="Show secret" data-action="toggle-password" data-target="su-password"></button></div>
                <div class="signup-step-actions"><button class="signup-prev" type="button" data-action="signup-prev" aria-label="Previous step">←</button><button class="signup-next" type="button" data-action="signup-next" aria-label="Next step">→</button></div>
              </fieldset>
              <fieldset class="signup-step" data-signup-step="4" aria-hidden="true">
                <div class="signup-step-title" role="heading" aria-level="2">Confirm your secret</div>
                <div class="input-wrap signup-secret-wrap"><input id="su-confirm-password" name="confirmPassword" type="password" autocomplete="new-password" placeholder="Repeat your secret" minlength="6" required><button type="button" class="eye signup-eye" aria-label="Show secret" data-action="toggle-password" data-target="su-confirm-password"></button></div>
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
  `
}