# Applying migration 18 in production

**What it does:** a passenger sees the driver's phone number as soon as they book,
even while the booking is still `pending`. It changes only `public.get_trip_contacts`
(one word: `'pending'` added to the passenger check). It does **not** change any
booking status, table, or data.

**Safe on the live database as it is today (migrations 1-7 only).** Migrations 8-17
are not needed for it. Checked with `npx tsx scripts/db/migration18-on-live.ts`
(migrations 1-7 + 18 on a throwaway Postgres: 9/9 checks, including rollback).

## Steps (Supabase dashboard, about 2 minutes)

1. Open the project **nstawljljfyjhgpxuwkg** → **SQL Editor** → **New query**.
2. **Before** (optional, to save the current version):

   ```sql
   select pg_get_functiondef('public.get_trip_contacts(uuid)'::regprocedure);
   ```

   It should contain `status in ('confirmed', 'completed')` twice and no `'pending'`.
3. Paste the whole file `supabase/migrations/20261111000018_driver_phone_after_booking.sql`
   and click **Run**. Expected result: `Success. No rows returned`.
4. **Check:**

   ```sql
   select position('''pending''' in pg_get_functiondef('public.get_trip_contacts(uuid)'::regprocedure)) > 0 as has_pending,
          has_function_privilege('anon', 'public.get_trip_contacts(uuid)', 'execute') as anon_can_run,
          has_function_privilege('authenticated', 'public.get_trip_contacts(uuid)', 'execute') as users_can_run;
   ```

   Expected: `has_pending = true`, `anon_can_run = false`, `users_can_run = true`.
5. **Real test in the app:** with a real passenger account, book a ride that does
   **not** accept automatically. The popup "Booking sent!" must show the driver's
   number, and in **Table Editor → bookings** that booking must still be `pending`.

## Rollback

Run `supabase/rollback/20261111000018_driver_phone_after_booking.down.sql` in the
SQL Editor. It restores exactly the current production function (number only for
confirmed or completed bookings).

## Notes

- Running the file twice is harmless (`create or replace`).
- Accepted trade-off: anyone who sends a booking request sees that driver's number,
  even if the driver then declines. Access ends when the booking is rejected or cancelled.
- The app code for this (commits af8b191 + 49762cf) works with or without the
  migration: without it, a pending booking's popup says "no number, send a message".
