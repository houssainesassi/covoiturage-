# Production rollout checklist: email code, profile completion, migrations 8-13

**Status: not approved. Nothing here has been run on production.** Each step that changes production is marked **CHANGE** and needs explicit approval first.

Where steps say to stop, stop and leave production as it is. Do not fix forward.

## Agreed decisions (2026-11-08)

- Prefixes 6 and 8 stay accepted for this release.
- The 6-digit OTP, `{{ .Token }}` template and current expiry stay as they are.
- **Confirm email stays off until custom SMTP is configured and tested.**
- Migration 13 stays, but is not applied to production yet.
- All accounts, roles, bookings, trips and profile data are preserved.
- Migration 12 and the vehicle changes must not be overwritten or included by accident. See "Migration 12 and vehicle changes".
- No commit, push, deploy or production change without explicit approval, step by step.

```sh
export REF=<production project ref>
export STAGING_REF=<staging project ref>
export SUPABASE_ACCESS_TOKEN=<personal access token>
export PROD_URL=https://$REF.supabase.co
export PROD_KEY=<production publishable key>
```

## Blockers

| # | Blocker | Clears at |
|---|---------|-----------|
| 1 | Real Supabase Auth, Storage and PostgREST have never run this code. Only a stand-in has. | Step B |
| 2 | Custom SMTP must be set. Built-in email reaches team members only, at 2 messages per hour, so public signups would fail once Confirm email is on. | Step A2 |
| 3 | The live OTP length, expiry and rate limits have not been read. They need a Management API token. | Step A2 |
| 4 | The live migration history has not been read. It needs the database password. | Step C |

## A. Before touching anything (read-only)

### A1. Local checks

```sh
npm run check
npx tsx scripts/db/migration-safety.ts
```

Expected: `npm run check` exits 0 with `0 failed` from the database tests. Migration safety ends with `0 failed`.

### A2. Read the production Auth settings

This sends GET requests only, and prints a fixed list of fields, so the SMTP password and other secrets are never shown. Do not use a raw `curl` of this endpoint: its response includes them.

```sh
PROJECT_REF=$REF EXPECT_CONFIRM_EMAIL=off npx tsx scripts/staging/inspect-project.ts
```

An `UNKNOWN` line means not checked. Read that value in the dashboard.

| Setting | Expected | If not |
|---------|----------|--------|
| `mailer_otp_length` | `6` | Stop. The app accepts exactly 6 digits. Decide before changing anything. |
| `mailer_otp_exp` | Record the value. The Supabase default is `3600` (1 hour). | Do not change it in this rollout. |
| `mailer_autoconfirm` | `true` today | If already `false`, stop: someone has changed Auth. |
| Custom SMTP is configured | `true` | Blocker: set up custom SMTP first (A3). |
| `smtp_max_frequency` | `60` | Above 60, the app's resend button fails with "rate limited" after its 60-second countdown. |
| `rate_limit_email_sent` | At or above expected peak signups per hour, plus resends | Raise it only with approval, after SMTP. |
| `rate_limit_otp`, `rate_limit_verify` | Record the values. See "Rate limits" below. | |

### A3. CHANGE: set up custom SMTP

In **Auth → SMTP Settings**, enter the provider's details. This does not affect signups while Confirm email is off.

Expected: A2 shows custom SMTP configured, and a test message reaches Gmail and Outlook outside spam. Confirm email cannot be turned on until this has passed.

## B. Staging (nothing here touches production)

Follow `supabase/STAGING.md`. All five of its checks must pass, and the email must arrive in Gmail and Outlook, in Arabic and French, outside spam.

**Stop here if anything fails.**

## C. Production database, read-only

Run `inspect-project.ts` from A2 for the recorded history. `supabase migration list` below shows the same thing. **Do not propose or run a repair until both have been read and the result has been reviewed.**

Link the project. This writes only local files.

```sh
npx supabase link --project-ref $REF
npx supabase migration list
```

Expected: `20261107000001` to `...07` appear as applied remotely, and `20261108000008` to `...13` as local only.

If 1-7 show as local only because they were run in the SQL Editor, record them. **This writes to the migration history, so it is a CHANGE:**

```sh
npx supabase migration repair --status applied 20261107000001 20261107000002 20261107000003 20261107000004 20261107000005 20261107000006 20261107000007
```

If any of 8-13 shows as applied, stop.

```sh
npx supabase db push --dry-run
```

Expected: exactly the six files `20261108000008` to `20261108000013`.

In the SQL Editor, run each statement in `supabase/preflight.sql` and **save the results**.

| Result | Expected |
|--------|----------|
| 1 Summary | Save it. Step E compares against it. |
| 2 No profile | Note the rows. Migration 11 restores confirmed ones. |
| 3 Incomplete users | Save it. Expect about 12 of the 16 real users, with `no_avatar` (2026-11-08 figures). They can browse, and are asked for a photo when they publish or book. |
| 4 Triggers | No rows. Any row: stop. |
| 5 Phone rule | `CHECK (... '^\+216[2-9][0-9]{7}$' ...)`. Anything else: stop. |
| 6 Reasons | Save the count. |

Result 3 is also the first real proof that the `postgres` role can read `storage.objects`. If it errors, stop: `is_profile_complete` depends on that access.

Take a backup: **Database → Backups** must show a recent one. Note the time.

## D. Production rollout (each step needs approval)

**D1. CHANGE: deploy the app first.** Commit and push the approved changes to the branch Vercel deploys to production. Stage files by name, never with `git add -A`, and check `git diff --cached --stat` against the agreed list.

Expected: the Vercel deployment is Ready, and `/`, `/search` and `/auth/login` open. Until D2 finishes, the profile check fails open and suspended users see no reason text. Publishing a vehicle without brand, type or color fails until migration 12 applies, so go to D2 straight away.

**D2. CHANGE: apply the migrations.**

```sh
npx supabase db push
```

Expected: six migrations applied, no errors. Run `npx supabase migration list` again: 1-13 applied on both sides.

**D3. Verify the migrations.** Run each statement in `supabase/postflight.sql`, then:

```sh
curl -s -H "apikey: $PROD_KEY" "$PROD_URL/rest/v1/profiles?select=suspended_reason&limit=0"
```

| Check | Expected |
|-------|----------|
| Postflight 1 | Same as preflight 1, except the two "without" counts may fall to 0 |
| Postflight 2 | All `true`, `triggers` = 5 |
| Postflight 3 | Equals preflight 6 |
| Postflight 4 | The `[2-9]` rule |
| curl | JSON with `"code":"42703"` (column does not exist). A `[]` or HTTP 200 means reasons are still public: stop. |

As an admin, open `/admin/users` and check that suspended users still show their reason.

**D4. CHANGE: paste the email template.** In **Auth → Email Templates → Confirm signup**, paste `supabase/templates/confirm-signup.html`. Do not touch OTP length or expiry.

**D5. CHANGE: turn on Confirm email.** Only after A3 has passed. In **Auth → Providers → Email**. Do not change anything else on that page.

```sh
curl -s -H "apikey: $PROD_KEY" "$PROD_URL/auth/v1/settings" | jq .mailer_autoconfirm
```

Expected: `false`.

**D6. Real signup on production.** Use an address you own, in a browser:

| Action | Expected |
|--------|----------|
| Register | Goes to `/auth/verify`, with 6 boxes |
| Email | Arrives within a minute, with a 6-digit code and no link |
| Wrong code | Error, stays on the page |
| Correct code | Goes to `/auth/complete-profile` |
| Photo and save | Opens the app |
| Existing account login | Works, with no code asked, and its bookings are listed |
| Admin login | `/admin` opens |
| New user at `/admin` | Goes to `/dashboard` |

Delete the test user afterwards.

**D7. Watch for 24 hours.** In **Logs → Auth**, look for `429`, `over_email_send_rate_limit` and `Error sending confirmation email`. In Vercel, look for `[auth] signup skipped email verification`.

## Rollback

Use the smallest step that fixes the problem.

| Problem | Action |
|---------|--------|
| Emails not arriving, or signup failing | Turn **Confirm email** off. New users are auto-confirmed. No data changes. |
| App bug | Turn **Confirm email** off first, because the old app has no page for entering a code. Then Vercel → **Instant Rollback**. Suspended users see no reason text on the old app. |
| A migration causes an outage | Follow `supabase/rollback/README.md` in order. Reverting 13 makes suspension reasons public again. |
| Data damage | Restore the backup from step C. This loses everything since then, so it is the last resort. |

## Review results

### OTP settings

No code or template sets OTP length or expiry. The app requires exactly 6 digits, the template uses `{{ .Token }}`, and no text promises a time limit. `OTP_WINDOW_MS` in `src/actions/auth.ts` is a rate-limit window, not an expiry. Keep the expiry as it is: expired codes show the normal "incorrect or expired" message, and users can request a new one.

### Rate limits

Supabase's documented defaults:

| Limit | Default | Scope |
|-------|---------|-------|
| Emails sent | 2 per hour with built-in email; higher and configurable with custom SMTP | Project |
| Signup, resend | 30 per 5 minutes | IP |
| Verifying a code | 30 per 5 minutes | IP |
| New code for the same user | One per 60 seconds, which matches the app's 60-second countdown | User |
| OTP expiry | 1 hour | |

App limits in `src/actions/auth.ts`, per 10 minutes: register 8, verify 20, resend 10 per IP, and verify 10 per address.

Risks to accept or fix, none of which block rollout on their own:

1. **All users may share one IP limit at Supabase.** Signup and verify run in server actions, so Supabase sees Vercel's address, not the user's. Forwarding the real address needs the secret key and `security_sb_forwarded_for_enabled`, and the app uses the publishable key for these calls. Expect a shared 30 per 5 minutes across all users, which is fine at this size. If D7 shows 429s, raise `rate_limit_otp` and `rate_limit_verify`.
2. **The app's limits are per server instance.** They live in memory, so on Vercel they are best-effort. The per-address limit can also be bypassed by calling Supabase directly with the public key. Real protection against guessing is Supabase's IP limit and the expiry. At defaults that is about 360 guesses per IP per hour against 1,000,000 codes, or 0.036% per code.
3. **Shared mobile IPs.** Many users on one carrier address could hit the limit of 8 registrations per 10 minutes on one instance. Watch for complaints at launch.

### Phone prefixes

The rule stays at first digit 2-9, as in production today. The earlier local restriction was removed from the code, migrations and tests.

[INT decision Coll/Reg/2024/08](https://intt.tn/upload/files/D%C3%A9cision%20Coll-Reg-2024-08%20de%20l%E2%80%99Instance%20Nationale%20des%20T%C3%A9l%C3%A9communications%20en%20date%20du%2010%20juillet%202024%2C%20portant%20fixation%20de%20nouvelles%20r%C3%A8gles%20de%20gestion%20du%20Plan%20National%20de%20Num%C3%A9rotation-min.pdf) (10 July 2024) lists: mobile 2, 4, 5, 9; fixed 3, 7; value-added services 8; special services 1; **6 reserved for future use**. The [2015 INT notice to the ITU](https://www.itu.int/dms_pub/itu-t/oth/02/02/T02020000D50002PDFF.pdf) agrees on 8.

**Decided: both stay accepted for this release.** That decision is over two years old, and it also describes a shortage of mobile numbers. Range 6 is the reserve, so it may open. Before ever narrowing the rule, ask INT (contact@intt.tn) for the current status.

### `suspended_reason`

It was readable by anyone holding the public key: `profiles` allows `select` for `anon` with `using (true)`. On the live project, the column is selectable by anon (checked with `limit=0`, so no rows were read). This stays true until migration 13 is applied.

Migration 13 moves it to `profile_private`. Owners and admins can read it, users cannot change it, and existing reasons are kept. A column move was chosen over column-level grants because `select("*")` on `profiles` would fail for the old app under column grants, which would make an app rollback an outage.

### `profiles.role` and `profiles.status`

Both are readable with the public key, row by row, so `role=eq.admin` lists admins and `status=eq.suspended` lists suspended users. Neither gives any power: only functions can change them, and server checks read the database.

| Column | Who needs it publicly | Recommendation |
|--------|----------------------|----------------|
| `role` | Nobody. It is used for the user's own session and on the admin reports page. The public just learns who to target. | Restrict it, in a separate change after this release. |
| `status` | The public profile's "suspended" badge (`src/app/users/[id]/page.tsx`). The trip page also selects it but never uses it. | Product decision. Keep it while the badge stays, or remove the badge and restrict both together. |

Why not now: Postgres column grants would make `select("*")` on `profiles` fail, including `getProfile()` on every signed-in page, so a mistake or an app rollback would be an outage. Own-row access also needs a new function, since column grants cannot depend on the row. That is a riskier change than migration 13, and should have its own staging run. Moving the columns is worse still: `is_admin()`, `is_active_user()` and many functions read them.

### Migration 12 and vehicle changes

**Origin:** `patch_vehicle.py` in another session (`1f52474d`), applied 2026-11-08 at 21:15. It makes vehicle type, brand and color optional.

**Review result: no defect found.** Existing values are kept, the length checks still apply, and every place that shows these fields handles null. `get_trip_contacts` reads only the plate. Migration 13 applies, rolls back and re-applies without 12, and 12 applies after it, so they can ship separately.

Two things to know:

- **Code and migration 12 must ship together.** New code without the migration fails when a driver leaves a field blank. Without the code, the migration alone is harmless.
- **Rollback writes placeholders.** Blank vehicles get type `other`, brand `-` and color `-`, and keep them if 12 is applied again.

Whether to ship it is a decision, because it was not part of this rollout's scope.

| Files | Contents |
|-------|----------|
| `supabase/migrations/20261108000012_*`, `supabase/rollback/20261108000012_*`, `src/actions/vehicles.ts`, `src/app/dashboard/vehicles/page.tsx`, `src/components/vehicles/vehicle-form.tsx`, `src/components/trips/trip-form.tsx`, `src/lib/validation.ts`, `src/lib/names.ts` | Vehicle change only |
| `src/actions/trips.ts`, `src/lib/queries.ts`, `src/lib/supabase/database.types.ts`, `src/app/trips/[id]/page.tsx`, `scripts/db/test.ts`, `scripts/db/migration-safety.ts`, `supabase/rollback/README.md` | Mixed with other work. Excluding the vehicle change needs these split hunk by hunk, then retesting. |

### Existing users

Tested on a throwaway PostgreSQL copy of the real migrations, with awkward legacy accounts: `scripts/db/migration-safety.ts`, and `scripts/e2e/ui-rollout.ts` on a stand-in. Accounts, roles, trips, bookings and chosen values are unchanged through apply, re-apply, rollback and re-apply. Incomplete users keep their existing bookings, can browse, and can complete their profile. Migration 11 fills in only blank values.

**Not yet tested against real production data.** Steps B, C and D3 cover that.

## Email-or-phone verification (migrations 14 and 15)

**Status: not approved, not applied.** At sign-up the user chooses how to verify the account:

| Method | Supabase calls | Signs in with |
|--------|----------------|---------------|
| Email | `signUp({ email, password })`, then `verifyOtp({ type: 'email' })` with the 6-digit email code | email + password |
| Phone | `signUp({ phone, password })`, then `verifyOtp({ type: 'sms' })` with the 6-digit SMS code | +216 number + password |

The phone number is asked in both forms. Either verified email or verified phone is enough to publish and book (migration 15, `account_unverified`). A phone account resets its password through `signInWithOtp({ phone, shouldCreateUser: false })` and an SMS code. Existing accounts all have a confirmed email, so they count as verified and keep working without any new step.

`signInWithOtp` is not used for sign-up: with `shouldCreateUser` it makes passwordless accounts, and it silently signs in an existing user instead of reporting a duplicate.

### Supabase settings (each one is a **CHANGE**)

| Where | Setting | Value |
|-------|---------|-------|
| Auth → Providers → Phone | Enable phone provider | on |
| same | SMS provider | Twilio, Twilio Verify, MessageBird, Vonage or Textlocal, with that provider's credentials. Check that it delivers to Tunisian (+216) numbers. |
| same | Enable phone confirmations | on (otherwise numbers are accepted with no SMS, and the app reports `sms_send_failed`) |
| same | SMS OTP length / expiry | 6 digits / 300 s (`SMS_CODE_TTL_SECONDS` in `src/lib/phone.ts`) |
| same | SMS message | `Wasalni : votre code est {{ .Code }}` |
| Auth → Rate limits | SMS sent per hour | Expected sign-ups and resets per hour, plus margin. The app also caps 5 SMS per number per hour. |
| Auth → Hooks → Before User Created | Postgres function `public.hook_before_user_created` | Refuses sign-ups that have neither an email nor a +216 number (blocks SMS pumping to foreign numbers). Test the payload on staging first. |
| Auth → Providers → Email | Confirm email, custom SMTP, template | As in A3, D4 and D5 above |
| Auth → Bot and Abuse Protection | CAPTCHA | Recommended once phone sign-ups are open; needs app work, not done. |

Until the Phone provider is configured, choosing the phone method fails with "Impossible d'envoyer le SMS". Do not deploy before the SMS provider works.

### Sign-up guard

The app reads Supabase's public `/auth/v1/settings` before every sign-up. A method is offered only if its provider is on **and** Supabase would not auto-confirm it (`mailer_autoconfirm` / `phone_autoconfirm` false); otherwise it shows "Momentanément indisponible". If Auth still returns a session at sign-up, the user is signed out and refused. If the settings can't be read, sign-up is closed.

Live on 2026-11-09: `mailer_autoconfirm: true`, phone provider off. **Deploying now closes sign-up on both methods** until the steps below are done. Existing users still log in.

The guard covers the app only. Anyone can call the Supabase Auth API directly, so the dashboard settings are what actually enforce verification.

### Runbook (each step after R0 is a CHANGE and needs approval)

| # | Where | Exact action | Check before going on |
|---|-------|--------------|-----------------------|
| R0 | Local | `npm run check` and `npx tsx scripts/db/migration-safety.ts` | 0 failed |
| R1 | Supabase → Database → Backups | Take or confirm a backup; run `supabase/preflight.sql` (section C) | Counts recorded |
| R2 | Auth → SMTP Settings | Custom SMTP on: host, port 587, user, password, sender `no-reply@<domain>`, name `Wasalni`; minimum interval 60 s | Test email reaches Gmail and Outlook, not spam |
| R3 | Twilio console | Messaging Geo Permissions: **Tunisia only**. Fraud Guard / SMS pumping protection on. Spend alert set. | Test SMS from Twilio to your SIM |
| R4 | Auth → Providers → Phone | Enable Phone provider; SMS provider Twilio (Account SID, Auth Token, Messaging Service SID); **Enable phone confirmations on**; SMS OTP expiry 300; OTP length 6; message `Wasalni : votre code est {{ .Code }}`; **Test phone numbers: none** | `curl …/auth/v1/settings`: `external.phone` true, `phone_autoconfirm` false |
| R5 | Auth → Rate Limits | SMS per hour: 30 to start (caps the cost of abuse). Emails per hour: what your SMTP plan allows. Leave verify and sign-up limits at defaults. | Values saved |
| R6 | Auth → URL Configuration | Site URL = production domain; redirect URLs include `https://<domain>/auth/callback` | |
| R7 | Vercel | Deploy the approved commits. Sign-up shows both methods unavailable until R9. | `/`, `/auth/login`, existing user login + bookings OK |
| R8 | Database | `npx supabase db push` (migrations 8 to 15 in order; decide on 12 and 13 first, see below). Then `supabase/postflight.sql`. | `npx supabase migration list`: all applied; postflight as in D3 |
| R9 | Auth → Email Templates → Confirm signup | Paste `supabase/templates/confirm-signup.html` | |
| R10 | Auth → Providers → Email | **Confirm email on.** Email OTP length 6. Keep expiry. | `mailer_autoconfirm` false; register page shows both methods |
| R11 | Auth → Hooks → Before User Created | Postgres function `public.hook_before_user_created`, enabled | Phone sign-up with `+33…` via API is refused 403; +216 and email accepted |
| R12 | Production, your own SIM and inbox | Full test list in "6. How to test" (phone sign-up, wrong code, correct code, login by number, reset by SMS, duplicate number; same for email; existing user books) | All pass; delete test accounts |
| R13 | Logs | 24 h: Auth logs for 429, `sms_send_failed`, `over_sms_send_rate_limit`; Vercel for `[auth]` lines; Twilio spend | No anomalies |

Order matters: the app goes out before the migrations (R7 before R8) because the old app cannot handle the new database checks. Migrations 14 and 15 go out together: with 14 alone, users without an SMS-verified phone cannot book.

Undecided before R8: migration 12 (optional vehicle details) and migration 13 (private suspension reason) were "kept but not applied" on 2026-11-08. `db push` applies every pending file, so either approve them or run 8-11 and 14-15 by hand in the SQL editor in that order.

Rollback: if email or SMS delivery fails, turning Confirm email or phone confirmations off closes that sign-up method in the app (the guard). Existing users keep logging in. An older app version has no guard, so before a Vercel Instant Rollback, decide whether sign-up without codes is acceptable for that time. Database: `supabase/rollback/` in reverse order (15 first).
