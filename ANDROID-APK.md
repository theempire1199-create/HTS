# HASAN TECH STUDIO — Hosting (Vercel) + Android APK Guide

## 0. "This site can't ask for your permission" — notifications error, fix

Ye error tab aata hai jab app **insecure `http://`** par khuli ho (jaise PC ka dev
server phone me LAN IP `http://192.168.x.x:5173` se kholna). Chrome insecure origin
par notification permission prompt **block** kar deta hai — isme app ki koi galti
nahi hai. Bell ab ye khud detect karke seedha wajah batayega.

Fix, koi ek karo:
- **PC par test:** `npm run dev` → `http://localhost:5173` kholo (localhost secure
  hota hai, bell turant kaam karega).
- **Phone par test / final:** neeche §Vercel se deploy karke mile `https://...`
  URL kholo → bell, fingerprint, install — sab chalega.

## Vercel — deploy setup (recommended host)

Repo me `vercel.json` ready hai (build `npm run build`, output `dist/`, `sw.js` ko
`no-cache` taaki updates turant milein). Do tarike:

**A. Dashboard (easy):**
1. Code GitHub/GitLab par push karo.
2. [vercel.com](https://vercel.com) → Add New → Project → repo import karo.
3. Framework preset: **Vite** (Build Command `npm run build`, Output Directory
   `dist` — auto-detect ho jayega), Deploy dabao.
4. Mili `https://<project>.vercel.app` URL phone me kholo — sab live.

**B. CLI:**
```sh
npx vercel        # preview deploy
npx vercel --prod # production deploy
```

Custom domain: Vercel project → Settings → Domains → apna domain add karo
(TWA ke liye apna domain best rehta hai).

The app is **PWA-ready** in this repo (manifest + icons + offline service worker are
already wired; they ship inside `dist/` after `npm run build`). That gives you two
roads to Android — pick one.

## Road 0 — Proper APK bina PC/SDK ke, phone se hi (PWABuilder, recommended)

Acode/phone par APK **compile** karna possible nahi (APK banane ke liye Android SDK +
Gradle chahiye, jo na yahan hai na Acode me). Lekin **PWABuilder.com** wahi kaam
cloud me karta hai — Microsoft ka free tool, same Bubblewrap technology:

1. Phone/PC browser me **pwabuilder.com** kholo → `https://hasantechstudio.vercel.app/` dalo → Start.
2. Score check karega (manifest/icons/SW — sab ready hai) → **Package for Android** dabao.
3. Package name do (e.g. `studio.hasan.tech.twa`), APK download karo.
4. Phone me install karo (pehli baar "unknown apps allow" bolega — Allow kar do).
5. PWABuilder tumhe **SHA-256 fingerprint** dega → usko + package name ko
   `public/.well-known/assetlinks.json` me `PASTE_*` ki jagah likho → dobara deploy
   karo → address-bar gayab, full proper app feel.
6. Play Store par dalna ho to PWABuilder se **AAB** lo (developer account $25 one-time).

> Note: PWABuilder wala APK debug-signed hota hai testing ke liye — perfect daily-use
> ke liye hai; Play Store release ke liye apne keystore se sign karna (PWABuilder
> guide kar deta hai).

## Road 1 — Instant install, no APK file needed (Vercel URL)

1. Upar §Vercel se deploy karo → `https://<project>.vercel.app` milega.
2. Phone ke Chrome me wahi URL kholo → menu (⋮) → **Install app / Add to Home screen**.
3. The app installs like a native app: home-screen icon, splash, standalone window,
   offline support. No Play Store, no APK file needed.

> Tip: Chrome shows the install prompt automatically once the PWA criteria pass
> (HTTPS + manifest + 192/512 icons + service worker — all included here).

## Road 2 — Real downloadable `.apk` via Bubblewrap / TWA (30–60 min one-time setup)

This wraps the same PWA in a Play-Store-grade Android shell (Trusted Web Activity).

### A. Prerequisites (on your machine — this sandbox has none of these)

- Node 18+, JDK 17, Android command-line tools (`sdkmanager`, `build-tools`,
  `platform-tools`) with licences accepted.
- The `dist/` build hosted on a public **HTTPS** domain, e.g.
  `https://hts.example.com` (TWA requires a real origin — `localhost` cannot ship).

### B. Link the app to your domain (required, kills the browser address bar)

Host this file at `https://YOUR-DOMAIN/.well-known/assetlinks.json`:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "studio.hasan.tech.twa",
      "sha256_cert_fingerprints": ["PASTE_SHA256_HERE"]
    }
  }
]
```

### C. Generate + build the APK

```sh
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://YOUR-DOMAIN/manifest.webmanifest
# answer prompts: package name studio.hasan.tech.twa, theme colors as suggested
bubblewrap build
```

Output: `app-release-signed.apk` (+ `.aab` for Play Store). Install the APK directly
on any Android device, or upload the AAB to Play Console.

Get the SHA-256 for step B from your keystore:

```sh
keytool -list -v -keystore android.keystore | grep SHA256
```

### D. Android permissions for the native shell (the 10 accesses)

A TWA needs **no** permissions of its own (Chrome handles camera/biometric/etc. at
runtime over your HTTPS origin). If you wrap with Capacitor/native later, declare
these 10 in `AndroidManifest.xml`:

```xml
<!-- 1. INTERNET: app shell, instant updates, PWA install checks -->
<uses-permission android:name="android.permission.INTERNET" />
<!-- 2. USE_BIOMETRIC: native fingerprint gate (PWA uses WebAuthn instead) -->
<uses-permission android:name="android.permission.USE_BIOMETRIC" />
<!-- 3. VIBRATE: haptic feedback on login/buttons (already used by the app) -->
<uses-permission android:name="android.permission.VIBRATE" />
<!-- 4. POST_NOTIFICATIONS: security alerts, e.g. new-login / code events -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<!-- 5. CAMERA: future avatar capture / QR login -->
<uses-permission android:name="android.permission.CAMERA" />
<!-- 6. READ_MEDIA_IMAGES: pick avatar from gallery -->
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
<!-- 7. ACCESS_COARSE_LOCATION: rough region for the admin activity log -->
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<!-- 8. RECEIVE_BOOT_COMPLETED: re-arm reminders after reboot -->
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
<!-- 9-10. Hardware feature flags (required=false so installs are never blocked) -->
<uses-feature android:name="android.hardware.fingerprint" android:required="false" />
<uses-feature android:name="android.hardware.camera" android:required="false" />
```

Dangerous ones (4–7) are runtime-prompted on Android 6+/13+ — ask only when the
feature is first used, never at install, or users get irritated and deny.

### E. Notes

- The code-gate popup, toasts, and offline shell all work inside the TWA — both need
  the **HTTPS** origin.
- If you ship under a sub-path (e.g. `example.com/hts/`), update `start_url`/`scope`
  in `public/manifest.webmanifest` and the SW `CORE` list in `public/sw.js` first.
  (Vercel root deploys need no change.)
- Bump `CACHE` in `public/sw.js` whenever you ship a breaking shell change so
  devices drop the old offline shell (currently `hts-cache-v2`).

## Road 3 — Proper NATIVE Android app (Kotlin + Compose, repo me ready)

`android-app/` me poora native project likha hai — same screens/flows/theme, same
validations, same PBKDF2, same `119911` gate, BiometricPrompt, channels wali
notifications, 10 permissions manifest me. Yahan (Acode/sandbox) me **compile nahi**
hota — APK ke liye koi ek raasta:

**A. Android Studio (PC):** folder kholo → Gradle sync → Run ▶ → APK. Pehli baar
Studio khud wrapper/SDK sambhal lega.

**B. Bina PC ke — GitHub Actions (recommended):**
1. Ye repo GitHub par push karo.
2. `Actions` tab → **Android APK** workflow khud chalega (push par auto).
3. Kaam khatm par **Artifacts → hts-app-debug** download karo → phone me install.
Har push par naya APK — versionCode badhana ho to `app/build.gradle.kts` dekho.
