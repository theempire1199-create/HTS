export function renderPasscodeOverlay(): string {
  return `
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
  `
}