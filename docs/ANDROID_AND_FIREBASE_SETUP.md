# HTS — Android app + Firebase setup

This document lists exactly what has to be collected outside the codebase so the
two pending pieces can be finished: (A) packaging the PWA as an installable
Android app, and (B) wiring a real backend (Firebase) in place of the current
browser-only auth.

---

## Part A — Turn the PWA into an Android app (PWABuilder / TWA)

A PWA becomes a proper Android app via a **Trusted Web Activity (TWA)**. PWABuilder
generates it and also produces the two values the `assetlinks.json` file needs.

Steps:

1. **Deploy the site first.** The app must be live on an HTTPS URL (Vercel is
   already configured). Note the exact domain, e.g. `hts.vercel.app`.
2. Open **https://www.pwabuilder.com**, enter your URL, and choose
   **Package for stores → Android**.
3. Set the **Package ID** (Android `applicationId`), e.g.
   `com.hasantechstudio.app`. This must be unique and permanent.
4. **Signing key:** let PWABuilder create a new signing key (or upload your own).
   Download and keep the generated `.keystore` + passwords safe — you need the
   same key for every future Play Store update.
5. PWABuilder produces:
   - `.aab` — for the Google Play Store
   - `.apk` — for direct install / testing on a phone
   - the **SHA-256 fingerprint(s)** and an `assetlinks.json` preview
6. Install the `.apk` on a test phone (allow "install from unknown sources") to
   verify it opens full-screen with no browser URL bar.
7. **Give me:** the **Package ID** and the **SHA-256 fingerprint(s)**. If you will
   publish on Play, send **two** fingerprints — your signing key's and Google's
   *Play App Signing* key's.

### Permissions (fingerprint, location, etc.)

In a TWA these come from the **web app**, not the Android manifest — the manifest
mostly just declares them so the system can prompt.

- **Fingerprint / biometrics** — handled by **WebAuthn**, which the code already
  uses. Chrome inside a TWA shows the native biometric prompt; no extra Android
  permission is required.
- **Location** — the web app must call `navigator.geolocation`, and the Android
  manifest needs `ACCESS_FINE_LOCATION` (enable "Location" in PWABuilder's Android
  options). The app does **not** use location yet — tell me where you want it and
  I will add the web-side request.
- **Notifications** — Web Push; the service worker already exists. Enable
  notifications in the PWABuilder Android options.
- **Camera / microphone** — same pattern (web API + manifest declaration) if
  needed later.

Once `assetlinks.json` holds the correct values and is served at
`https://<domain>/.well-known/assetlinks.json` with `Content-Type: application/json`,
the TWA is verified and runs without the browser chrome.

---

## Part B — Real backend with Firebase

Steps to create the project and hand over the config:

1. Open **https://console.firebase.google.com** → **Add project** (e.g.
   `hasan-tech-studio`).
2. **Build → Authentication → Get started**, then under **Sign-in method** enable
   **Email/Password**. (Enable **Phone** only if you want real SMS OTP — that
   needs the Blaze plan and reCAPTCHA.)
3. **Project settings (gear) → General → Your apps → Web (`</>`)** → register a web
   app (nickname: `HTS web`).
4. Firebase shows a `firebaseConfig` object. **Send me these 6 values:**
   - `apiKey`
   - `authDomain`
   - `projectId`
   - `storageBucket`
   - `messagingSenderId`
   - `appId`
5. **Do NOT send** the service-account key / private key. The six values above are
   public client config and are safe to ship in the browser bundle — security is
   enforced by Firebase Security Rules and Authorized Domains, not by hiding them.
6. **Authentication → Settings → Authorized domains** → add your Vercel domain.
7. Optional but recommended: configure the **Email templates / SMTP** provider so
   verification and reset emails actually send, and/or **Firestore** if profile
   data should live server-side.

### What I will do once the config arrives

- Add the `firebase` SDK and a `src/firebase.ts` initialised from environment
  variables (`VITE_FIREBASE_*`), with a committed `.env.example`.
- Replace the localStorage `AuthDB` identity layer with **Firebase Auth**
  (email/password), server-managed sessions, and real email/phone verification in
  place of the demo OTP.
- Keep the per-user **app-lock passcode** as a purely local convenience lock (it is
  not an identity mechanism).
- Update the README to drop the "prototype / not production" caveat.
