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

## Authentication (Firebase)

Identity is handled by **Firebase Authentication** (project `htsos-e3fa4`), so accounts
and sessions are server-managed and real verification / password-reset emails are sent.

- Create an account with email + password; a verification email is sent.
- Sign in with your email and password.
- Reset a password via the emailed link.
- Restore the session on reload and sign out.

The **app-lock access code** (6-digit) is a local, per-device convenience lock
(PBKDF2-hashed in this browser) — it is not an identity mechanism. The Firebase web
config lives in `src/firebase.ts`; those values are public client identifiers, and
access is controlled by Firebase Security Rules and Authorized Domains.

See `docs/ANDROID_AND_FIREBASE_SETUP.md` for the Firebase console setup steps.
