# HASAN TECH STUDIO — Identity

## Run locally

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. For a production bundle, run `npm run build`; `npm run preview` serves that bundle locally.

Signup and login metadata is stored in this browser (password-free) and can be read via the helpers in `src/LoginDetails.ts` and `src/SignupDetails.ts`.

## Available flows

- Create an account, verify the demo code, and sign in.
- Sign in with the registered email or contact number and password.
- Reset a password after verifying a recovery code.
- Restore the current session on reload and sign out.

Verification codes appear on the verification screen because this project has no email or SMS provider configured. Account records and sessions are stored in this browser; passwords are salted and hashed with PBKDF2 before storage. This makes the screens usable as a local prototype, but it is not a production authentication service. Production use needs a server-side identity provider, server-managed sessions, and a configured email/SMS delivery service.
