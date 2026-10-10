# HASAN TECH STUDIO — Identity

## Run locally

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. For a production bundle, run `npm run build`; `npm run preview` serves that bundle locally.

### Running on Android (Termux)

Android 11+ blocks network-interface queries, so Node's `os.networkInterfaces()`
throws `ERR_SYSTEM_ERROR` (errno 13) and Vite crashes on startup while printing the
LAN URLs. The dev server therefore binds to `127.0.0.1`, which avoids that call.
If you need LAN access from another device, use:

```sh
npm run dev:android
```

That preloads `scripts/patch-net.cjs` (a small `os.networkInterfaces` guard) and
binds to all interfaces, so it works on Android without the crash.

Signup and login metadata is stored in this browser (password-free) and can be read via the helpers in `src/LoginDetails.ts` and `src/SignupDetails.ts`.

## Authentication (device-only)

No accounts, no server, no backend. Unlock is purely on-device:

- Splash → fingerprint unlock is tried first (WebAuthn platform authenticator).
- Fingerprint unavailable/failed → 6-digit access code.
- First launch asks you to set the code (old per-account codes are adopted automatically).
- Main screen: change code, enable/test fingerprint, lock now, notifications.

The 6-digit code is PBKDF2-hashed (210k iterations) in this browser's
localStorage — it never leaves the device. Fingerprint data stays in the
device authenticator via WebAuthn; only a credential id is kept locally.

See `docs/ANDROID_SETUP.md` for packaging the PWA as an Android app.
