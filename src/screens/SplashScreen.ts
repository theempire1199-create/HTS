import { AuthUI } from '../AuthUI'

export function renderSplashScreen(ui: AuthUI): string {
  return `
    <section class="view show" id="v-start" role="button" tabindex="0" aria-label="Tap anywhere to continue" data-action="show-screen" data-screen="v-login">
      <div class="start-screen hts-intro">
        <div class="hts-stage-glow" aria-hidden="true"></div>
        <div class="hts-top-lockup" aria-label="HTS.OS">${ui['renderTopBrand']()}</div>
        <div class="hts-glow-line" aria-hidden="true"></div>
        <div class="hts-tagline" aria-hidden="true">the independent tech......</div>
        <div class="hts-dev-credit" aria-hidden="true"><span class="hts-dev-by">developed by-</span><span class="hts-dev-studio">HASAN TECH STUDIO</span></div>
      </div>
    </section>
  `
}