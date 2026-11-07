# Wasalni — Covoiturage Tunisie (El Fahs · Zaghouan · Tunisia)

Carpooling platform for Tunisia: guests browse and search freely; an account is required only to
book, publish a ride, send messages and leave reviews. Interface in **Arabic (RTL), French and English**.

**Stack:** Next.js 16 (App Router, Server Actions, `proxy.ts`) · React 19 · TypeScript strict ·
Supabase (Postgres, Auth, Storage, Realtime) · Tailwind CSS 4 · Leaflet + OpenStreetMap (OSRM routing) · Vercel.

## Features
- Search with city autocomplete (Arabic/French/English, accent-insensitive), 20 km radius matching, date,
  seats, max price, departure time, driver rating, sort, pagination.
- Trip page: OSM map with driving route, driver profile & preferences, vehicle, co-passengers, booking.
- Booking: request → driver accepts/rejects → confirmed/cancelled/completed. Seats are reserved
  atomically in Postgres (`request_booking`, row lock) — no overbooking, no self-booking, no duplicates.
  Driver phone & plate revealed only after confirmation. Cash payment to the driver.
- Driver dashboard: publish/edit/cancel rides (map pickup points, OSRM distance, price suggestion),
  requests, passengers, completion, vehicles with photos, earnings.
- Passenger dashboard: bookings, cancellation until departure, reviews.
- Realtime chat with read receipts, realtime notification bell, notification center.
- Reviews (both directions, completed trips only, one per trip/person).
- Reports & moderation; admin dashboard (stats, users suspend/activate/roles, trips, bookings,
  reports, review/message hiding, audit log). Admin rights are checked inside Postgres.
- Optional fictional historical demo data, clearly labelled and isolated from real listings.
- Reminders 24 h before departure and auto-completion of past trips (pg_cron or `/api/cron`).

## Setup
1. `npm install`
2. Copy `.env.example` to `.env.local` and fill the values.
3. Apply the database migrations in order (`supabase/migrations/*.sql`):
   - Supabase CLI: `supabase link --project-ref <ref> && supabase db push`, or
   - Dashboard → SQL Editor: run each file in order.
4. `npm run dev` → http://localhost:3000

### Supabase dashboard configuration
- **Auth → URL Configuration:** Site URL = your domain; add `https://<domain>/auth/callback` (and
  `http://localhost:3000/auth/callback`) to Redirect URLs.
- **Auth → SMTP:** configure a custom SMTP provider for production email volume.
- **Database → Extensions:** enable `pg_cron` (then re-run migration 6) — otherwise set `CRON_SECRET`
  and `SUPABASE_SECRET_KEY` so Vercel Cron calls `/api/cron`.
- **Create the first admin** (SQL Editor): `update public.profiles set role = 'admin' where id = '<user uuid>';`

## Historical demo data (optional, for testing)
`supabase/seed/demo_history.sql` adds ~80 fictional **past** rides (Tunis ↔ El Fahs, Zaghouan, Nabeul,
Hammamet, Sousse, Sfax, Kairouan, Bizerte, Monastir; Zaghouan ↔ El Fahs; El Fahs ↔ Sousse; Nabeul ↔ Sousse)
with bookings and reviews from the last ~6 months.
- Every row has `is_demo = true`; demo profiles have **no auth account and no phone number** and cannot sign in.
- Demo rides are `completed`/`cancelled` and in the past: never searchable, never bookable (enforced in Postgres).
- Shown with a **DEMO · example** badge on ride pages, profiles, reviews and admin tables.
- Re-running the seed inserts nothing new (deterministic ids). Remove it all with `supabase/seed/demo_cleanup.sql`.

Run in the SQL Editor **after** migration 7: paste `demo_history.sql`, execute.

## Deploy (Vercel)
Import the repository, add the environment variables from `.env.example`, deploy.
`vercel.json` schedules `/api/cron` daily (Hobby limit); pg_cron runs every 15–30 min if enabled.

## Tests
| Command | What it checks |
| --- | --- |
| `npm run typecheck` | TypeScript strict |
| `npm run lint` | ESLint (Next + React Compiler rules) |
| `npm run test:db` | 152 DB integration tests on a real embedded Postgres: booking rules, 20 concurrent bookings for 3 seats, cancellations, RLS/privileges, messaging, reviews, admin, jobs |
| `npm run build` | Production build |
| `BASE_URL=http://127.0.0.1:3000 CHROME_PATH=<chromium> npx tsx scripts/e2e/smoke.ts` | Browser checks: search, filters, auth guards, form errors, RTL, mobile layout |

## Security notes
- RLS on every table, column-level grants (users cannot write `role`, `status`, ratings, seat counts,
  booking status or prices); all seat/booking/review/admin operations are `SECURITY DEFINER`
  functions that re-validate the caller.
- Phone numbers live in `profile_private`; plate numbers are not readable by the public.
- Storage uploads restricted to `<bucket>/<user-id>/…`, image types only, 2–5 MB limits.
- Rate limits in Postgres (bookings, trips, messages, reports) and per-IP limits on auth actions.
- The secret key is only used server-side in `/api/cron`.
