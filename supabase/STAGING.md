# Staging environment

> **Superseded (2026-11-12)** for sign-up: email codes and SMS are not used. Current runbook: `supabase/rollout-20/README.md`.

Staging is a second, separate Supabase project plus a Vercel preview connected to it. Nothing here touches production. The scripts refuse to change the project in `.env.local`.

## 1. Create it (you do this)

1. Create a new Supabase project, for example `wasalni-staging`. Do not branch or copy production: no real user data belongs here.
2. Create a personal access token, under **Account → Access Tokens**. Use a short expiry, and revoke it when testing ends.
3. Set up custom SMTP in **Auth → SMTP Settings**. A sandbox sender is fine. Staging needs its own test of this before production Confirm email can be considered.

## 2. Keep the values in `.env.staging`

`.gitignore` already covers this file. Do not paste its values into chat or commit them.

```sh
PROJECT_REF=<staging ref>
SUPABASE_ACCESS_TOKEN=<token>
STAGING_SUPABASE_URL=https://<staging ref>.supabase.co
STAGING_SUPABASE_KEY=<staging publishable key>
STAGING_SECRET_KEY=<staging secret key>
STAGING_DB_URL=<staging connection string, with its password>
BASE_URL=https://<staging preview>
TEST_EMAIL=<new address, inbox you can read>
ADMIN_EMAIL=<staging admin>
ADMIN_PASSWORD=<password>
EXISTING_EMAIL=<staging account with no photo>
EXISTING_PASSWORD=<password>
CHROME_PATH=<path to chrome>
```

Load it in each terminal:

```sh
set -a; . ./.env.staging; set +a
```

## 3. Build a realistic "before" state

Stop at migration 7, so existing-account checks mean something. In a clean staging project, apply from a temporary copy, so the project's migration files are never moved:

```sh
mkdir -p /tmp/wasalni-before/supabase/migrations
cp supabase/migrations/20261107* /tmp/wasalni-before/supabase/migrations/
npx supabase db push --db-url "$STAGING_DB_URL" --workdir /tmp/wasalni-before
```

Confirm email should still be off here.

Create the existing account (register it in the app, or in **Auth → Users**). Give it no photo, and a booking on another user's ride.

## 4. Apply the rollout to staging

```sh
npx supabase db push --db-url "$STAGING_DB_URL" --dry-run   # expect 20261108000008 to ...13
npx supabase db push --db-url "$STAGING_DB_URL"
```

Then in the staging dashboard: paste `supabase/templates/confirm-signup.html` into **Confirm signup**, check Email OTP Length is 8, turn on **Confirm email**, and set one user's role to admin in the SQL Editor:

```sql
update public.profiles set role = 'admin' where id = '<user uuid>';
```

Deploy a Vercel preview with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` set to the staging values, **for the Preview environment only**. Add the preview's `/auth/callback` to staging's Redirect URLs.

Deploying a preview needs the code on a pushed branch or `vercel deploy` from this folder. That is your decision, because it means pushing or uploading uncommitted work.

## 5. Run the checks, in this order

| Step | Command | Pass means |
|------|---------|-----------|
| Settings and history (read-only) | `EXPECT_CONFIRM_EMAIL=on npx tsx scripts/staging/inspect-project.ts` | `No failures`, and no `UNKNOWN` you have not checked by hand |
| Auth, OTP, PostgREST, Storage | `npx tsx scripts/e2e/otp-real-auth.ts` | `All real Auth checks passed` |
| Browser path | `npx tsx scripts/e2e/ui-rollout.ts` | `0 failed` (use a new `TEST_EMAIL`) |
| Migration 13, rollback, RLS | `npx tsx scripts/staging/migration13-check.ts` | `0 failed` |
| Local data rules | `npx tsx scripts/db/migration-safety.ts` | `0 failed` |

Both e2e scripts create a user at `TEST_EMAIL`, so each needs its own address. `otp-real-auth.ts` needs the code typed in, and has an optional step for an expired code.

## 6. Clean up

Delete the test users in **Auth → Users**, and revoke the access token.
