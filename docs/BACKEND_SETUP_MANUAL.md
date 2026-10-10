# HTS Backend Setup Manual — Start Se Firebase Dobara Add Karna

Ye manual tumhe **start se end tak** le jayega: Firebase project banana, sahi
values nikalna, mujhe bhejna, aur uske baad kya hoga. Har step me **kya, kahan,
kaise, kyu** likha hai.

> Note: Abhi app me **koi backend nahi hai** — login/signup sirf isi browser me
> chalta hai (`src/AuthDB.ts`). Neeche wale steps karne ke baad jab tum values
> bhejoge, tab mai Firebase dobara wire kar dunga.

> ✅ **Status: setup complete** — project `hasan-tech-studio` connected,
> `hts-kappa-ten.vercel.app` authorized. Neeche wale steps record ke liye rakhe
> hain.

---

## Cheezon ki list (pehle ye ready rakho)

| # | Cheez | Kyu chahiye |
|---|-------|-------------|
| 1 | Ek **Google account** (Gmail) | Firebase console isi se khulta hai |
| 2 | Laptop/PC + internet | Firebase console phone se mushkil hota hai |
| 3 | Tumhari **Vercel domain** (agar site deploy hai, jaise `hts.vercel.app`) | Ise "Authorized domains" me dalna padta hai, warna live site par login fail hoga |
| 4 | 10–15 minute | Poora kaam ek baar me ho jayega |

Paise? **Email/password login Firebase ke free plan (Spark) me aata hai.** Card
ki zaroorat nahi. (SMS/OTP phone login me Blaze plan lagta hai — isliye hum wo
**nahi** kar rahe.)

---

## Step 1 — Firebase project banana

**Kya:** Firebase console me naya project banana.
**Kahan:** https://console.firebase.google.com
**Kaise:**

1. Upar wale link par jao, Google account se sign in karo.
2. **"Add project"** (ya "Create a project") par click karo.
3. Project name likho, jaise: `hasan-tech-studio` → **Continue**.
4. "Enable Google Analytics for this project" wala option aayega:
   - Chaho to **ON** rakho (free hai), ya OFF kar do — login par **koi farak nahi**
     padta. → **Continue/Create project**.
5. "Your new project is ready" aaye to **Continue** dabao.

**Kyu:** Project hi wo "dabba" hai jisme tumhare app ke saare users aur login
system rahega. Bina project ke aage kuch nahi hoga.

---

## Step 2 — Email/Password login ON karna

**Kya:** App me user ID-password se login ho sake, ye switch ON karna.
**Kahan:** Firebase console → left side **Build → Authentication**.
**Kaise:**

1. Left menu me **Build → Authentication** kholo → **Get started** dabao.
2. Upar **Sign-in method** tab kholo.
3. List me **Email/Password** par click karo.
4. Pehla switch (**Email/Password → Enable**) **ON** karo → **Save**.
5. Dusra option (**Email link / passwordless**) OFF hi rehne do — hume chahiye nahi.

> ⚠️ **Phone** wala option ON **mat karo** — usme SMS ke paise (Blaze plan) aur
> reCAPTCHA lagta hai. Hum email login hi use karenge.

**Kyu:** Ye switch OFF raha to signup karte hi error aayega
(`operation-not-allowed`). Ye ek baar ON karna hota hai, bas.

---

## Step 3 — Web app register karke 6 values nikalna

**Kya:** Tumhari website ko Firebase project se jodna aur `firebaseConfig` ki
6 values copy karna. **Yahi sabse important step hai.**
**Kahan:** Firebase console → top-left **gear icon (⚙️) → Project settings →
General → Your apps**.
**Kaise:**

1. Gear icon (project ke naam ke paas) → **Project settings**.
2. **General** tab me neeche **"Your apps"** section me **Web icon (`</>`)** par
   click karo.
3. App nickname likho, jaise: `HTS web` → **Register app**.
   (Firebase Hosting wala tick **lagane ki zaroorat nahi** — hum Vercel use karte hain.)
4. Ab tumhe ek code block dikhega — kuch aisa:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "tumhara-project.firebaseapp.com",
  projectId: "tumhara-project",
  storageBucket: "tumhara-project.firebasestorage.app",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef..."
};
```

5. Ye **6 values** (apiKey, authDomain, projectId, storageBucket,
   messagingSenderId, appId) copy karke **mujhe bhej do** (neeche Step 5 me format hai).

**Kyu:** Ye 6 values tumhari website ko batati hain "tumhara Firebase project
kaun sa hai". Ye **public client identifiers** hain — browser me sabko dikhengi,
isliye inhe chhupane ki tension mat lo. Asli security Firebase Rules aur
Authorized Domains se hoti hai, in values se nahi.

> 🛑 **Kya NAHI bhejna:** "Service account key" / "private key" wali koi file
> (JSON) download karke **kabhi mat bhejna** — wo secret hoti hai aur browser me
> **kabhi nahi** dalni. Hume uski zaroorat bhi nahi hai.

---

## Step 4 — Apni Vercel domain ko allow karna (bahut zaroori)

**Kya:** Apni live site ki domain Firebase me allow-list karna.
**Kahan:** Firebase console → **Build → Authentication → Settings →
Authorized domains**.
**Kaise:**

1. **Authentication → Settings** tab kholo → **Authorized domains** section dekho.
2. `localhost` pehle se hoga (testing ke liye hota hai, rehne do).
3. **Add domain** dabao → apni Vercel domain likho, jaise `hts.vercel.app`
   (sirf domain — `https://` mat lagao) → **Add**.

**Kyu:** Ye step bhool gaye to live site par login karte hi
`auth/unauthorized-domain` error aayega, jabki localhost par sab chalega. Ye
sabse common mistake hai — dhyan se karna.

---

## Step 5 — Mujhe kya bhejna hai (checklist)

Neeche wale format me chat me bhej do:

```
1. apiKey: ...
2. authDomain: ...
3. projectId: ...
4. storageBucket: ...
5. messagingSenderId: ...
6. appId: ...
7. Vercel domain: ... (jaise hts.vercel.app)
```

**Optional (agar chahiye to saath bhej do):**

- 📱 **Android app** banana ho to: **Package ID** (jaise `com.hasantechstudio.app`)
  aur **SHA-256 fingerprint(s)** — ye PWABuilder se milenge
  (detail `docs/ANDROID_SETUP.md` me hai).
- 📧 Verification/reset emails ke liye apna naam/logo text ho to wo.

**Mujhe ye mat bhejna:** service-account JSON, koi password, koi card detail.

---

## Step 6 — Values milne ke baad mai kya karunga

Tumhe kuch nahi karna — ye sab mai karunga, taaki tumhe pata rahe:

1. `firebase` SDK install karunga (`npm install firebase`).
2. `src/firebase.ts` wapas banaunga — values seedhi file me **nahi** likhunga,
   balki environment variables (`VITE_FIREBASE_*`) + `.env.example` file se
   load hongi (safe tarika).
3. `src/AuthDB.ts` ko localStorage se hata kar **Firebase Auth** (email/password)
   par wire karunga: signup, login, session restore, logout.
4. Asli **verification email** aur **password-reset email** chalu ho jayenge.
5. Per-user **6-digit app-lock code** waise ka waisa **local hi rahega** (wo
   identity ka hissa nahi hai).
6. `npm run build` (type-check + production build) pass karke dunga.

---

## Step 7 — Wiring ke baad testing (tum khud check karna)

| # | Test | Sahi result |
|---|------|-------------|
| 1 | Naya account signup | "Check your email" wala message + inbox me verification mail |
| 2 | Bina verify login | Re-verify screen dikhe |
| 3 | Link khol kar "I'VE VERIFIED" | Dashboard khul jaye |
| 4 | Galat password | "Email or password is incorrect" error |
| 5 | Page reload | Login bana rahe (session restore) |
| 6 | Set access code → logout → wapas | 6-digit code mange |
| 7 | Fingerprint button (support wale phone par) | Sensor prompt aaye |

Koi step fail ho to **exact error message + kaun se test number par** — mujhe
bhej dena, mai theek kar dunga.

---

## Aam galtiyan (bach ke rehna)

| Galti | Nuksaan |
|-------|---------|
| Step 2 me Email/Password ON karna bhool gaye | Signup par `operation-not-allowed` error |
| Step 4 me domain add karna bhool gaye | Live site par `unauthorized-domain`, localhost par sab sahi |
| Service-account key bhej di / kahin paste kar di | Secret leak — turant Firebase me key delete/rotate karni padegi |
| Galat project ki values bhej di | Login kaam hi nahi karega — `projectId` dhyan se match karo |
| Phone login ON kar diya | Bina Blaze plan ke error, paise ka jhanjhat — rehne do |
