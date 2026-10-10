import { AuthUI } from '../AuthUI'

export function renderHeader(ui: AuthUI): string {
  const companionImage = (ui as any).companionImage
  return `
    <header class="site-header top-head">
      <div class="brand-lockup" aria-label="HASAN TECH STUDIO — The Tech of Future">
        <span class="brand-emblem" aria-label="HTS assistant companion" role="button" tabindex="0">
          <span class="brand-ring"></span>
          <span class="brand-orb">
            <span class="companion-closed-eyes" aria-hidden="true"><i></i><i></i><b class="companion-nose"></b><b class="companion-smile"></b></span>
            <img class="companion-image" src="${companionImage}" alt="HASAN TECH STUDIO companion" decoding="async" fetchpriority="high" onerror="this.style.display='none'">
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
        <span class="brand-tagline" aria-label="the tech of future .....">${ui['renderTagline']()}</span>
      </div>
    </header>
  `
}