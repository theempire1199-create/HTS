# HTS — Android app setup

This document covers packaging the PWA as an installable Android app.
Auth backend: Firebase Authentication (project `hasan-tech-studio`).

---

## Turn the PWA into an Android app (PWABuilder / TWA)

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

## Backend (connected)

Auth runs on Firebase Authentication (email/password) with server-managed
sessions and real verification / password-reset emails. The web config loads
from `VITE_FIREBASE_*` env vars (see `.env.example`). The per-user **app-lock
passcode** stays a purely local convenience lock (it is not an identity
mechanism).
