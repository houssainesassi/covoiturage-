# Phone-only sign-up: plan (not implemented, awaiting approval)

Status 2026-11-11: **nothing below is built or changed.** No auth code, no Supabase
setting, no migration was touched.

## Current implementation (inspected)

| Piece | Today |
|---|---|
| Sign-up (`src/actions/auth.ts` `registerAction`, `components/auth/forms.tsx`) | One form: name, **email**, phone, password, terms. `supabase.auth.signUp({ email, password, data: { full_name, phone, locale } })`. The phone is a plain profile field, **never verified**. |
| Login (`loginAction`) | `signInWithPassword({ email, password })`. Email only. |
| Forgot password | `resetPasswordForEmail`. Email only. |
| Google / other OAuth | None in the code, all off in Supabase. |
| Booking → sign-in | Guest booking button goes to `/auth/login?next=/trips/<id>?seats=N`; `next` survives login, sign-up and `/auth/complete-profile`, so the ride and seat count are kept. |
| DB trigger `handle_new_user` (live, migration 1) | Creates `profiles` + `profile_private` on **insert** into `auth.users`, phone copied from sign-up metadata. Does not need an email. |
| Booking rules (live, migration 7) | `request_booking` checks the user is active; it has **no** "verified account" check. |
| Live Supabase Auth (public settings) | Email provider on, `mailer_autoconfirm: true`; **Phone provider off**; `sms_provider: twilio` but not enabled/configured. |

Reusable code: commit **777c38e** already built a phone sign-up method
(`signUp({ phone, password })` + `verifyOtp({ type: 'sms' })`, `/auth/verify`,
login by phone, password reset by SMS). It was later removed (264844e). Its auth
parts can be restored instead of written from scratch.

## Changes needed (after your approval)

### Supabase (you, in the dashboard)
1. **SMS provider:** Auth → Providers → **Phone** → enable, choose Twilio (or Vonage /
   MessageBird / Textlocal), enter its credentials. Twilio needs a number or
   Messaging Service able to send to **+216**.
2. **Phone confirmations ON** (`phone_autoconfirm` must stay `false`), OTP length 6,
   expiry 5-10 min.
3. **Rate limits / abuse:** Auth → Rate Limits → SMS sent per hour (start low, e.g. 30);
   enable **CAPTCHA** (hCaptcha or Turnstile) for sign-up: SMS pumping fraud costs real money.
4. **Block email sign-up for new users, keep email login for existing ones.** Do **not**
   disable the Email provider (that locks out the existing email accounts). Instead, a
   *Before User Created* auth hook that rejects sign-ups without a `+216` phone.

### Database (new migration, small, works on the live schema)
- Before-User-Created hook function: allow only `phone ~ '^\+216[2-9][0-9]{7}$'` and no email.
- `request_booking` / trip publish: refuse when the caller's `auth.users.phone_confirmed_at`
  is null **and** `email_confirmed_at` is null (keeps existing email users working).
  Defense in depth: Supabase already refuses password login for an unconfirmed phone.
- `handle_new_user`: also take `new.phone` when the metadata phone is missing.
- Tests in `scripts/db/test.ts`, plus a rollback file.
- Do **not** reuse migration 15 as is: it is coupled to migrations 8 and 10, which are not live.

### App code (restore from 777c38e, trimmed to phone only)
- `registerAction`: phone + password + name + terms, **no email field**;
  `signUp({ phone, password, options: { data: { full_name, phone, locale } } })`,
  then redirect to `/auth/verify?phone=…&next=…` (the `next` booking link is carried along).
- `/auth/verify` page + `verify-otp-form`: `verifyOtp({ phone, token, type: 'sms' })`,
  resend button with cooldown; on success → `/auth/complete-profile?next=…` → back to the ride.
  A wrong or expired code shows an error and does not sign in.
- `loginAction`: one field "phone or email" (phone for new accounts, email for the
  existing ones); unconfirmed phone at login → resend code + `/auth/verify`.
- Forgot password: phone → `signInWithOtp({ phone, shouldCreateUser: false })` + code,
  then `/auth/reset-password`; email accounts keep the email reset.
- Error codes / strings in `lib/errors.ts` and the 3 dictionaries.
- Existing users: they have an email and **no** auth phone, so they **cannot** log in by phone
  until they add one. Option (decision needed): "add and verify your phone" in settings
  (`updateUser({ phone })` + `type: 'phone_change'`).

### Tests
- Stand-in browser test (as for 777c38e): new user books → sign-up by phone → wrong code
  rejected → right code → profile → back on the ride with seats kept → booking → popup.
- **One real test on production** with your own phone (real SMS, real cost), then delete
  the test account.

## Decisions needed from you
1. SMS provider and who pays (Twilio to Tunisia is roughly a few tenths of a USD per SMS; check current pricing).
2. Existing email accounts: keep email login only, or add "verify your phone" for them?
3. CAPTCHA on sign-up: yes/no (recommended yes).
