# Email sign-up rollout (migration 20 + Confirm email)

Email + password, mandatory confirmation link, phone = required unverified profile field.
No SMS, no Phone provider, no hook. Migrations 8, 19 and unrelated ones (9-16) are **not** part of this.

Status: code and migration ready, tested locally only (see "Tested so far"). **Nothing has run on production.**
Every production step below is marked **PROD — needs approval**: stop after each and wait.

## Order

| Step | Where | What |
|---|---|---|
| S1 | staging | create the project (you) |
| S2 | staging | schema: 1-7, 17, 18, 20 |
| S3 | staging | Auth settings, SMTP, templates, URLs |
| S4 | staging | app preview on the staging env |
| S5 | staging | tests: script + manual inbox checks. **All must pass.** |
| P1 | **PROD — needs approval** | backup |
| P2 | **PROD — needs approval** | migrations 17 then 18 (`supabase/rollout-17-18/README.md`) |
| P3 | **PROD — needs approval** | `1-preflight.sql` (read-only) |
| P4 | **PROD — needs approval** | migration 20, then `2-check-after-20.sql` |
| P5 | **PROD — needs approval** | SMTP + templates + URLs (Confirm email still OFF) and one real reset email |
| P6 | **PROD — needs approval** | Confirm email ON, then deploy the app right away |
| P7 | **PROD — needs approval** | one real sign-up test, then delete that test account |

## S1. Staging project

New Supabase project (e.g. `waselni-staging`), empty: never a copy of production data.
Keep its URL, publishable key and secret key in `.env.staging` (git-ignored). Do not paste keys in chat.

## S2. Schema (SQL editor of the staging project, one file per run, in this order)

1. `supabase/migrations/20261107000001_schema.sql` … `20261107000007_demo_data.sql` (1 to 7)
2. `supabase/migrations/20261111000017_public_driver_phones.sql`
3. `supabase/migrations/20261111000018_driver_phone_after_booking.sql`
4. `supabase/rollout-20/1-preflight.sql`: every `ok` true
5. `supabase/migrations/20261113000020_email_signup.sql`
6. `supabase/rollout-20/2-check-after-20.sql`: every `ok` true

Expected the first time: migration 20 creates the trigger `on_auth_user_email_confirmed` on `auth.users`.
If the SQL editor refuses ("must be owner of table users"), stop and report it: the migration is not
applied (it runs in one transaction) and we need another way.

## S3. Auth configuration (staging dashboard; the same values are used in P5/P6)

| Setting | Value |
|---|---|
| Authentication → Sign In / Providers → Email | enabled; **Confirm email ON**; Secure email change ON; minimum password length 8 |
| Phone provider | **OFF** |
| SMTP Settings | custom SMTP (Resend), sender `no-reply@<your domain>`, name `Waselni Fahs`; domain verified in Resend (SPF + DKIM, DMARC recommended) |
| Rate limits → emails per hour | about 100 (built-in sender: 2/h, unusable) |
| Email: minimum interval between emails | 60 s (the app's resend countdown) |
| Email OTP expiration | 3600 s (default; link valid 1 h) |
| URL Configuration → Site URL | the app URL for this environment (staging: the preview URL) |
| URL Configuration → Redirect URLs | `<app>/auth/confirm`, `<app>/auth/callback`, `<app>/**` |
| Email templates | Confirm signup = `supabase/templates/confirm-signup.html`; Reset password = `reset-password.html`; Change email address = `change-email.html` |
| Hooks | none |

Subjects: `Waselni Fahs: أكّد الإيمايل / Confirmez votre e-mail`, `Waselni Fahs: كلمة السرّ / Mot de passe`,
`Waselni Fahs: تبديل الإيمايل / Changement d'e-mail`.

The templates link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=…`. That page only shows
a button; the token is used when it is pressed. So links work on any device, and mail scanners
(Outlook Safe Links) that open links do not use them up.

## S4. App on staging

Vercel preview (or `next build && next start`) with:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = staging values,
`NEXT_PUBLIC_SITE_URL` = the preview URL (same as the staging Site URL).

## S5. Staging tests (all must pass before any PROD step)

Automated, real Supabase Auth (creates and deletes its own users on staging; refuses the production ref):

```sh
STAGING_SUPABASE_URL=… STAGING_SECRET_KEY=… APP_URL=<preview URL> node scripts/e2e/email-auth-staging.mjs
```

Manual, real inbox (`E2E_INBOX=you+wf1@gmail.com` with the command above sends one real sign-up email):

- [ ] Gmail, Outlook/Hotmail, Yahoo: confirmation email arrives within 2 minutes, **not in spam**, sender name right, Arabic + French readable
- [ ] Link opened on the phone (Gmail app, in-app browser) after signing up on a computer → button → profile step
- [ ] Resend: the button waits 60 s; a second email arrives; the older link still works once, then says "already used"
- [ ] Link older than 1 hour → "invalid or expired" + resend
- [ ] Login before confirming → "confirm your email" screen with resend; no second account in Auth → Users
- [ ] Forgot password: email arrives, link on another device, new password, all devices signed out, old password refused
- [ ] Email change: both addresses get a link; the change happens only after both
- [ ] Same phone on a second account → profile step asks for another number ("already used")
- [ ] A signed-in session from before the switch keeps working
- [ ] Pages in ar / fr / en, at phone width

## P1-P7 (production): not before S5 passes, and each one only after approval

- **P1** Backup as in `supabase/rollout-17-18/README.md` step 0.
- **P2** Migrations 17 then 18 as in that runbook.
- **P3** Run `1-preflight.sql`. Every `ok` must be true; keep the `rows:` values.
  `no phone number shared` false → stop: duplicates are resolved by hand with the owners, never by deleting accounts.
- **P4** Run migration 20, then `2-check-after-20.sql`: every `ok` true, every `rows:` value equal to P3.
- **P5** SMTP, templates, URLs and rate limits as in S3, with the production URL. **Confirm email stays OFF.**
  Then request a password reset for an account you own: the email must arrive and the link must work.
  From here on, reset and email-change emails of existing members use the new templates. `origin/mai`
  (af8b191) already has an `/auth/confirm` route that accepts these links, but the deployed commit is not
  known from here: open `<prod>/auth/confirm?token_hash=x&type=recovery` first. It must redirect to
  `/auth/error`; a 404 means the deployed app is older, and it must be updated before changing the templates.
- **P6** Turn **Confirm email ON**, then deploy this app version immediately. Until the deploy, sign-up from
  the old app shows "check your email" and the new links still work (`/auth/confirm` is in this version).
  The new app refuses sign-up whenever Confirm email is OFF.
- **P7** One real sign-up with an address you own, through to the profile step. Delete that test account afterwards.

## Rollback

1. Confirm email OFF (sign-up then shows "temporarily unavailable" in the new app: roll the app back too).
2. Redeploy the previous app version.
3. `supabase/rollback/20261113000020_email_signup.down.sql` (deletes no row; profiles created meanwhile stay).
4. Templates back to the default if the old app is restored.

## Existing accounts and sessions

- Nothing deletes, recreates or rewrites users, trips, bookings, reviews or messages.
- Existing accounts were auto-confirmed (Confirm email was off): they stay verified and keep their password.
- Sessions survive: no JWT secret, signing key or cookie change. Only a password **reset** signs that account out everywhere.
- Accounts with no profile row get one from their own sign-up details on their next visit to the profile step (`ensure_my_profile()`).

## Tested so far (local only)

- `npx tsx scripts/db/migration20.ts`: both production chains (1-7 → 20 and 1-7 → 17 → 18 → 20), the check
  scripts, unchanged rows, behaviour, rollback and re-apply; refusal on duplicate phones.
- `npm run test:db`: every migration in the folder (1-18 + 20).
- Browser test of the app against a mock Auth server (not in the repo): sign-up, unconfirmed login,
  resend + limits, cross-device confirmation, scanner-safe links, recovery with global sign-out, two-step email change.
- Not tested: real Supabase Auth, real email delivery, the `auth.users` trigger permission on the hosted project.
