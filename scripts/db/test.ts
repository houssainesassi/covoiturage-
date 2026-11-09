/**
 * Database integration tests.
 *
 * Boots a throwaway real PostgreSQL server (embedded-postgres), applies a small
 * Supabase emulation layer plus every migration in supabase/migrations, then
 * exercises the booking engine, concurrency guarantees, RLS and privileges as
 * the `anon` / `authenticated` roles exactly like PostgREST would.
 *
 *   npm run test:db
 */
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type PoolClient } from "pg";
import { readdirSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { TN_PHONE_REGEX, normalizeTunisianPhone } from "../../src/lib/phone";
import { vehicleSchema } from "../../src/lib/validation";

const root = path.resolve(__dirname, "../..");
const PORT = 54329 + Math.floor(Math.random() * 500);

let passed = 0;
let failed = 0;
const failures: string[] = [];

function ok(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  ✗ ${name}`, detail ?? "");
  }
}

async function main() {
  const dir = mkdtempSync(path.join(tmpdir(), "wasalni-pg-"));
  const pg = new EmbeddedPostgres({
    databaseDir: dir,
    user: "postgres",
    password: "postgres",
    port: PORT,
    persistent: false,
    onLog: () => {},
    onError: () => {},
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("wasalni");

  const pool = new Pool({
    host: "localhost",
    port: PORT,
    user: "postgres",
    password: "postgres",
    database: "wasalni",
    max: 30,
  });
  pool.on("error", () => {}); // idle clients are terminated when the server stops

  try {
    await run(pool);
  } finally {
    await pool.end();
    await pg.stop();
    rmSync(dir, { recursive: true, force: true });
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) {
    console.log("Failures:\n - " + failures.join("\n - "));
    process.exit(1);
  }
}

type Actor = string | "anon" | "service";

/** Runs `fn` in a transaction impersonating a Supabase API role. */
async function as<T>(pool: Pool, actor: Actor, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    if (actor === "anon") {
      await c.query("set local role anon");
    } else if (actor === "service") {
      await c.query("set local role service_role");
    } else {
      await c.query("set local role authenticated");
      await c.query("select set_config('request.jwt.claim.sub', $1, true)", [actor]);
      await c.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: actor, role: "authenticated" }),
      ]);
    }
    const res = await fn(c);
    await c.query("commit");
    return res;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** Expects a statement to fail; returns the error message. */
async function fails(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "__no_error__";
  } catch (e) {
    return (e as Error).message;
  }
}

let phoneSeq = 0;

/** Signs a user up; by default also completes the mandatory profile (avatar + phone). */
async function createUser(pool: Pool, email: string, name: string, phone?: string, { complete = true } = {}) {
  const r = await pool.query(
    "insert into auth.users (email, raw_user_meta_data, email_confirmed_at) values ($1, $2, now()) returning id",
    [email, JSON.stringify({ full_name: name, phone, locale: "fr" })],
  );
  const id = r.rows[0].id as string;
  if (complete) {
    await pool.query("update public.profiles set avatar_path = id::text || '/avatar.jpg' where id = $1", [id]);
    await pool.query("insert into storage.objects (bucket_id, name, owner) values ('avatars', $1 || '/avatar.jpg', $1::uuid)", [id]);
    await pool.query("update public.profile_private set phone = coalesce(phone, $2) where id = $1", [id, `+2169${String(++phoneSeq).padStart(7, "0")}`]);
    // Same as a completed SMS code: Auth confirms the profile number.
    await pool.query(
      "update auth.users u set phone = substr(pp.phone, 2), phone_confirmed_at = now() from public.profile_private pp where pp.id = u.id and u.id = $1",
      [id],
    );
  }
  return id;
}

async function loc(pool: Pool, slug: string) {
  const r = await pool.query("select id, lat, lng from public.locations where slug = $1", [slug]);
  return r.rows[0] as { id: string; lat: number; lng: number };
}

async function publishTrip(
  pool: Pool,
  driver: string,
  opts: { seats?: number; price?: number; vehicle?: string | null; from?: string; to?: string; autoAccept?: boolean; inHours?: number } = {},
) {
  const from = await loc(pool, opts.from ?? "el-fahs");
  const to = await loc(pool, opts.to ?? "tunis");
  return as(pool, driver, async (c) => {
    const r = await c.query(
      `insert into public.trips (driver_id, vehicle_id, origin_id, destination_id, origin_address, destination_address,
        origin_lat, origin_lng, destination_lat, destination_lng, departure_at, seats_total, price_per_seat, auto_accept)
       values ($1,$2,$3,$4,'Station louage El Fahs','Bab Saadoun',$5,$6,$7,$8, now() + make_interval(hours => $9), $10, $11, $12)
       returning id`,
      [driver, opts.vehicle ?? null, from.id, to.id, from.lat, from.lng, to.lat, to.lng,
       opts.inHours ?? 48, opts.seats ?? 3, opts.price ?? 12.5, opts.autoAccept ?? false],
    );
    return r.rows[0].id as string;
  });
}

const book = (pool: Pool, user: string, trip: string, seats = 1) =>
  as(pool, user, (c) => c.query("select public.request_booking($1, $2, 'Bonjour') as id", [trip, seats])).then(
    (r) => r.rows[0].id as string,
  );

const seatsLeft = async (pool: Pool, trip: string) =>
  (await pool.query("select seats_available from public.trips where id = $1", [trip])).rows[0].seats_available as number;

async function run(pool: Pool) {
  console.log("Applying Supabase shim + migrations…");
  await pool.query(readFileSync(path.join(root, "scripts/db/supabase-shim.sql"), "utf8"));
  const migDir = path.join(root, "supabase/migrations");
  for (const f of readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort()) {
    try {
      await pool.query(readFileSync(path.join(migDir, f), "utf8"));
      console.log(`  applied ${f}`);
    } catch (e) {
      console.error(`  FAILED ${f}: ${(e as Error).message}`);
      throw e;
    }
  }

  // -------------------------------------------------------------------------
  console.log("\nReference data");
  const nLoc = (await pool.query("select count(*)::int n from public.locations")).rows[0].n;
  const nGov = (await pool.query("select count(*)::int n from public.governorates")).rows[0].n;
  ok("24 governorates seeded", nGov === 24, nGov);
  ok("locations seeded (>100)", nLoc > 100, nLoc);
  const govWithoutCity = (await pool.query(
    "select count(*)::int n from public.governorates g where not exists (select 1 from public.locations l where l.governorate_code = g.code and l.is_capital)",
  )).rows[0].n;
  ok("every governorate has a capital city", govWithoutCity === 0, govWithoutCity);

  // -------------------------------------------------------------------------
  console.log("\nAccounts & profiles");
  const driver = await createUser(pool, "driver@test.tn", "Sami Driver", "+21622123456");
  const p1 = await createUser(pool, "p1@test.tn", "Amel P1", "+21655111222");
  const p2 = await createUser(pool, "p2@test.tn", "Youssef P2");
  const admin = await createUser(pool, "admin@test.tn", "Admin");
  const badPhone = await createUser(pool, "bad@test.tn", "Bad Phone", "12345", { complete: false });
  ok("profile auto-created on signup", (await pool.query("select 1 from public.profiles where id=$1", [driver])).rowCount === 1);
  ok("valid Tunisian phone stored privately",
    (await pool.query("select phone from public.profile_private where id=$1", [driver])).rows[0].phone === "+21622123456");
  ok("invalid phone discarded",
    (await pool.query("select phone from public.profile_private where id=$1", [badPhone])).rows[0].phone === null);

  let e = await fails(as(pool, p1, (c) => c.query("update public.profiles set role='admin' where id=$1", [p1])));
  ok("user cannot promote self to admin", /permission denied/.test(e), e);
  e = await fails(as(pool, p1, (c) => c.query("update public.profiles set rating_avg=5 where id=$1", [p1])));
  ok("user cannot forge rating", /permission denied/.test(e), e);
  await as(pool, p1, (c) => c.query("update public.profiles set full_name='Amel B.', bio='Étudiante' where id=$1", [p1]));
  ok("user can edit own descriptive profile", (await pool.query("select full_name from public.profiles where id=$1", [p1])).rows[0].full_name === "Amel B.");
  const upd = await as(pool, p2, (c) => c.query("update public.profiles set full_name='hacked' where id=$1", [p1]));
  ok("user cannot edit someone else's profile", upd.rowCount === 0);
  const priv = await as(pool, p2, (c) => c.query("select phone from public.profile_private where id=$1", [p1]));
  ok("user cannot read someone else's phone", priv.rowCount === 0);
  e = await fails(as(pool, "anon", (c) => c.query("select * from public.profile_private")));
  ok("anon cannot read private profiles", /permission denied/.test(e), e);
  e = await fails(as(pool, p1, (c) => c.query("update public.profiles set avatar_path=$2 where id=$1", [p1, `${p2}/x.png`])));
  ok("avatar path must be in own folder", /violates check constraint/.test(e), e);
  e = await fails(as(pool, p1, (c) => c.query("update public.profile_private set phone='+33612345678' where id=$1", [p1])));
  ok("non-Tunisian phone rejected", /violates check constraint/.test(e), e);

  await pool.query("update public.profiles set role='admin' where id=$1", [admin]);

  // -------------------------------------------------------------------------
  console.log("\nVehicles");
  const vehicle = await as(pool, driver, (c) =>
    c.query(
      `insert into public.vehicles (owner_id, type, brand, model, color, year, seats, plate_number, photo_paths)
       values ($1,'sedan','Peugeot','301','Blanc',2019,4,'215 تونس 1234', array[$2]) returning id`,
      [driver, `${driver}/car.jpg`],
    ),
  ).then((r) => r.rows[0].id as string);
  ok("driver can add a vehicle", !!vehicle);
  e = await fails(as(pool, driver, (c) =>
    c.query(`insert into public.vehicles (owner_id, brand, model, color, seats, photo_paths) values ($1,'Kia','Rio','Noir',4, array[$2])`, [driver, `${p1}/x.jpg`])));
  ok("vehicle photo must be in own folder", /invalid_photo_path/.test(e), e);
  e = await fails(as(pool, p1, (c) =>
    c.query(`insert into public.vehicles (owner_id, brand, model, color, seats) values ($1,'Kia','Rio','Noir',4)`, [driver])));
  ok("cannot create a vehicle for another user", /row-level security/.test(e), e);
  e = await fails(as(pool, "anon", (c) => c.query("select plate_number from public.vehicles")));
  ok("plate number hidden from public", /permission denied/.test(e), e);
  const blankForm = vehicleSchema.safeParse({ type: "", model: "301", seats: "4" });
  ok("the form accepts a vehicle with no type, brand or color", blankForm.success && blankForm.data.type === null && blankForm.data.brand === null && blankForm.data.color === null, blankForm);
  ok("the form still requires a model", !vehicleSchema.safeParse({ type: "", model: "  ", seats: "4" }).success);
  const bareVehicle = (await as(pool, driver, (c) => c.query("insert into public.vehicles (owner_id, type, brand, model, color, seats) values ($1, null, null, '301', null, 4) returning id", [driver]))).rows[0].id as string;
  const bareTrip = await publishTrip(pool, driver, { vehicle: bareVehicle });
  const bareSearch = await as(pool, "anon", (c) => c.query("select vehicle_brand, vehicle_model from public.search_trips(null, null, null, 1, null, null, null, null, 'departure', 50, 0) where id = $1", [bareTrip]));
  ok("a ride with a bare vehicle appears in search", bareSearch.rows[0]?.vehicle_brand === null && bareSearch.rows[0]?.vehicle_model === "301", bareSearch.rows);
  await pool.query("delete from public.trips where id = $1", [bareTrip]);
  await pool.query("delete from public.vehicles where id = $1", [bareVehicle]);
  e = await fails(as(pool, driver, (c) => c.query("insert into public.vehicles (owner_id, brand, model, seats) values ($1, '   ', '301', 4)", [driver])));
  ok("a blank brand is stored as null, not spaces", /check constraint/.test(e), e);
  const pub = await as(pool, "anon", (c) => c.query("select brand, model from public.vehicles where id=$1", [vehicle]));
  ok("public vehicle info readable", pub.rows[0]?.brand === "Peugeot");
  const mine = await as(pool, driver, (c) => c.query("select plate_number from public.get_my_vehicles()"));
  ok("owner reads own plate via get_my_vehicles()", mine.rows[0]?.plate_number === "215 تونس 1234");

  // -------------------------------------------------------------------------
  console.log("\nTrip publishing");
  const trip = await publishTrip(pool, driver, { seats: 3, price: 12.5, vehicle });
  ok("driver publishes trip", !!trip);
  ok("seats_available initialised server-side", (await seatsLeft(pool, trip)) === 3);
  e = await fails(as(pool, driver, (c) => c.query("update public.trips set seats_available = 99 where id=$1", [trip])));
  ok("client cannot write seats_available", /permission denied/.test(e), e);
  e = await fails(as(pool, driver, (c) => c.query("update public.trips set status='completed' where id=$1", [trip])));
  ok("client cannot write trip status", /permission denied/.test(e), e);
  e = await fails(publishTrip(pool, driver, { seats: 6, vehicle }));
  ok("seats cannot exceed vehicle capacity", /seats_exceed_vehicle/.test(e), e);
  e = await fails(publishTrip(pool, driver, { inHours: -2 }));
  ok("departure in the past rejected", /departure_in_past/.test(e), e);
  e = await fails(publishTrip(pool, driver, { from: "tunis", to: "tunis" }));
  ok("origin must differ from destination", /trips_distinct_cities/.test(e), e);
  e = await fails(publishTrip(pool, driver, { vehicle: (await pool.query("insert into public.vehicles (owner_id, brand, model, color, seats) values ($1,'Kia','Rio','Noir',4) returning id", [p1])).rows[0].id }));
  ok("cannot use someone else's vehicle", /invalid_vehicle/.test(e), e);
  const updOther = await as(pool, p1, (c) => c.query("update public.trips set price_per_seat=1 where id=$1", [trip]));
  ok("other users cannot edit the trip", updOther.rowCount === 0);
  e = await fails(as(pool, driver, (c) => c.query("update public.trips set price_per_seat=9999 where id=$1", [trip])));
  ok("price is bounded server-side", /check constraint/.test(e), e);

  // -------------------------------------------------------------------------
  console.log("\nBooking rules");
  e = await fails(book(pool, driver, trip));
  ok("driver cannot book own trip", /cannot_book_own_trip/.test(e), e);
  e = await fails(book(pool, p1, trip, 0));
  ok("seat count validated", /invalid_seats/.test(e), e);
  const b1 = await book(pool, p1, trip, 2);
  ok("passenger requests 2 seats (pending)",
    (await pool.query("select status, total_price from public.bookings where id=$1", [b1])).rows[0].status === "pending");
  ok("seats held immediately", (await seatsLeft(pool, trip)) === 1);
  ok("price snapshot computed server-side",
    Number((await pool.query("select total_price from public.bookings where id=$1", [b1])).rows[0].total_price) === 25);
  e = await fails(book(pool, p1, trip, 1));
  ok("duplicate active booking rejected", /duplicate_booking/.test(e), e);
  e = await fails(book(pool, p2, trip, 2));
  ok("cannot book more than available seats", /not_enough_seats/.test(e), e);
  e = await fails(as(pool, p1, (c) => c.query("insert into public.bookings (trip_id, passenger_id, seats, price_per_seat) values ($1,$2,1,0)", [trip, p1])));
  ok("direct booking insert blocked (no free rides)", /permission denied/.test(e), e);
  e = await fails(as(pool, p1, (c) => c.query("update public.bookings set status='confirmed' where id=$1", [b1])));
  ok("passenger cannot self-confirm", /permission denied/.test(e), e);
  e = await fails(as(pool, p2, (c) => c.query("select public.respond_booking($1, true)", [b1])));
  ok("only the driver can accept", /forbidden/.test(e), e);
  ok("driver notified of request",
    (await pool.query("select count(*)::int n from public.notifications where user_id=$1 and type='booking_request'", [driver])).rows[0].n === 1);

  const seenByP2 = await as(pool, p2, (c) => c.query("select * from public.bookings where id=$1", [b1]));
  ok("other passengers cannot see the booking", seenByP2.rowCount === 0);
  const seenByDriver = await as(pool, driver, (c) => c.query("select * from public.bookings where id=$1", [b1]));
  ok("driver sees booking on own trip", seenByDriver.rowCount === 1);
  e = await fails(as(pool, "anon", (c) => c.query("select * from public.bookings")));
  ok("anon cannot read bookings", /permission denied/.test(e), e);

  await as(pool, driver, (c) => c.query("select public.respond_booking($1, false)", [b1]));
  ok("reject restores seats", (await seatsLeft(pool, trip)) === 3);
  ok("passenger notified of rejection",
    (await pool.query("select count(*)::int n from public.notifications where user_id=$1 and type='booking_rejected'", [p1])).rows[0].n === 1);
  e = await fails(as(pool, driver, (c) => c.query("select public.respond_booking($1, true)", [b1])));
  ok("cannot accept a rejected booking", /booking_not_pending/.test(e), e);

  const b2 = await book(pool, p1, trip, 1);
  await as(pool, driver, (c) => c.query("select public.respond_booking($1, true)", [b2]));
  ok("driver accepts → confirmed",
    (await pool.query("select status from public.bookings where id=$1", [b2])).rows[0].status === "confirmed");
  ok("confirmed seats stay held", (await seatsLeft(pool, trip)) === 2);

  const contactsP1 = await as(pool, p1, (c) => c.query("select * from public.get_trip_contacts($1)", [trip]));
  ok("confirmed passenger sees driver phone + plate",
    contactsP1.rows[0]?.phone === "+21622123456" && contactsP1.rows[0]?.plate_number === "215 تونس 1234");
  const contactsP2 = await as(pool, p2, (c) => c.query("select * from public.get_trip_contacts($1)", [trip]));
  ok("non-participant sees no contacts", contactsP2.rowCount === 0);
  const contactsD = await as(pool, driver, (c) => c.query("select * from public.get_trip_contacts($1)", [trip]));
  ok("driver sees confirmed passenger phone", contactsD.rows[0]?.phone === "+21655111222");

  const b3 = await book(pool, p2, trip, 2);
  ok("trip now full", (await seatsLeft(pool, trip)) === 0);
  e = await fails(as(pool, p2, (c) => c.query("select public.cancel_booking($1, 'x')", [b2])));
  ok("cannot cancel someone else's booking", /forbidden/.test(e), e);
  await as(pool, p2, (c) => c.query("select public.cancel_booking($1, 'Changement de programme')", [b3]));
  ok("cancellation restores seats", (await seatsLeft(pool, trip)) === 2);
  e = await fails(as(pool, p2, (c) => c.query("select public.cancel_booking($1, null)", [b3])));
  ok("cannot cancel twice", /booking_not_active/.test(e), e);
  ok("driver notified of cancellation",
    (await pool.query("select count(*)::int n from public.notifications where user_id=$1 and type='booking_cancelled'", [driver])).rows[0].n === 1);

  // -------------------------------------------------------------------------
  console.log("\nTrip edits");
  e = await fails(as(pool, driver, (c) => c.query("update public.trips set seats_total=0 where id=$1", [trip])));
  ok("seats_total ≥ 1", /check constraint|seats_below_booked/.test(e), e);
  // 1 seat is booked (b2). Reduce to 1 total => available 0.
  await as(pool, driver, (c) => c.query("update public.trips set seats_total=1 where id=$1", [trip]));
  ok("reducing seats recomputes availability", (await seatsLeft(pool, trip)) === 0);
  await as(pool, driver, (c) => c.query("update public.trips set seats_total=4 where id=$1", [trip]));
  ok("increasing seats recomputes availability", (await seatsLeft(pool, trip)) === 3);
  const tunisSousse = await loc(pool, "sousse");
  e = await fails(as(pool, driver, (c) => c.query("update public.trips set destination_id=$2 where id=$1", [trip, tunisSousse.id])));
  ok("route locked once seats are booked", /route_locked/.test(e), e);
  await as(pool, driver, (c) => c.query("update public.trips set departure_at = departure_at + interval '1 hour' where id=$1", [trip]));
  ok("time change notifies passengers",
    (await pool.query("select count(*)::int n from public.notifications where user_id=$1 and type='trip_updated'", [p1])).rows[0].n === 1);

  // -------------------------------------------------------------------------
  console.log("\nConcurrency (real parallel transactions)");
  const hot = await publishTrip(pool, driver, { seats: 3, price: 15 });
  const crowd: string[] = [];
  for (let i = 0; i < 20; i++) crowd.push(await createUser(pool, `crowd${i}@test.tn`, `Crowd ${i}`));
  const results = await Promise.allSettled(crowd.map((u) => book(pool, u, hot, 1)));
  const okCount = results.filter((r) => r.status === "fulfilled").length;
  const reasons = new Set(results.filter((r) => r.status === "rejected").map((r) => (r as PromiseRejectedResult).reason.message));
  ok("20 simultaneous requests for 3 seats → exactly 3 succeed", okCount === 3, { okCount, reasons: [...reasons] });
  ok("losers get not_enough_seats", reasons.size === 1 && reasons.has("not_enough_seats"), [...reasons]);
  ok("seats_available never negative", (await seatsLeft(pool, hot)) === 0);
  const held = (await pool.query("select coalesce(sum(seats),0)::int n from public.bookings where trip_id=$1 and status in ('pending','confirmed')", [hot])).rows[0].n;
  ok("held seats == seats_total", held === 3, held);

  const hot2 = await publishTrip(pool, driver, { seats: 4, price: 15 });
  const same = await Promise.allSettled(Array.from({ length: 8 }, () => book(pool, p2, hot2, 1)));
  ok("same passenger double-submits 8× → 1 booking", same.filter((r) => r.status === "fulfilled").length === 1);
  ok("seat accounting intact after double-submit", (await seatsLeft(pool, hot2)) === 3);

  const hot3 = await publishTrip(pool, driver, { seats: 2, price: 15 });
  const holders = await Promise.all(crowd.slice(0, 2).map((u) => book(pool, u, hot3, 1)));
  const mixed = await Promise.allSettled([
    as(pool, crowd[0], (c) => c.query("select public.cancel_booking($1, null)", [holders[0]])),
    ...crowd.slice(5, 10).map((u) => book(pool, u, hot3, 1)),
  ]);
  const extra = mixed.slice(1).filter((r) => r.status === "fulfilled").length;
  ok("cancel + concurrent bookings: at most the freed seat is taken", extra <= 1 && (await seatsLeft(pool, hot3)) === 1 - extra, { extra });

  // -------------------------------------------------------------------------
  console.log("\nAuto-accept");
  const instant = await publishTrip(pool, driver, { seats: 2, autoAccept: true });
  const bi = await book(pool, p2, instant, 1);
  ok("auto-accept trips confirm instantly",
    (await pool.query("select status from public.bookings where id=$1", [bi])).rows[0].status === "confirmed");

  // -------------------------------------------------------------------------
  console.log("\nMessaging");
  const conv = await as(pool, p1, (c) => c.query("select public.start_conversation($1) as id", [trip])).then((r) => r.rows[0].id as string);
  ok("passenger opens conversation", !!conv);
  await as(pool, p1, (c) => c.query("insert into public.messages (conversation_id, sender_id, body) values ($1,$2,'Salam, où est le point de rendez-vous ?')", [conv, p1]));
  ok("message updates conversation preview",
    (await pool.query("select last_message_preview from public.conversations where id=$1", [conv])).rows[0].last_message_preview.startsWith("Salam"));
  ok("recipient gets new_message notification",
    (await pool.query("select count(*)::int n from public.notifications where user_id=$1 and type='new_message'", [driver])).rows[0].n === 1);
  await as(pool, p1, (c) => c.query("insert into public.messages (conversation_id, sender_id, body) values ($1,$2,'Merci')", [conv, p1]));
  ok("notifications are coalesced per conversation",
    (await pool.query("select count(*)::int n from public.notifications where user_id=$1 and type='new_message'", [driver])).rows[0].n === 1);
  const unread = await as(pool, driver, (c) => c.query("select public.unread_message_count() n"));
  ok("unread count = 2", unread.rows[0].n === 2, unread.rows[0]);
  await as(pool, driver, (c) => c.query("select public.mark_conversation_read($1)", [conv]));
  ok("mark read clears unread",
    (await as(pool, driver, (c) => c.query("select public.unread_message_count() n"))).rows[0].n === 0);
  const spy = await as(pool, p2, (c) => c.query("select * from public.messages where conversation_id=$1", [conv]));
  ok("outsider cannot read conversation", spy.rowCount === 0);
  e = await fails(as(pool, p2, (c) => c.query("insert into public.messages (conversation_id, sender_id, body) values ($1,$2,'spam')", [conv, p2])));
  ok("outsider cannot post in conversation", /row-level security/.test(e), e);
  e = await fails(as(pool, p1, (c) => c.query("insert into public.messages (conversation_id, sender_id, body) values ($1,$2,'fake')", [conv, driver])));
  ok("cannot impersonate sender", /row-level security/.test(e), e);
  e = await fails(as(pool, driver, (c) => c.query("select public.start_conversation($1, $2)", [trip, crowd[15]])));
  ok("driver cannot cold-message non-passengers", /forbidden/.test(e), e);
  e = await fails(as(pool, p1, (c) => c.query("update public.messages set body='edited'")));
  ok("messages are immutable for users", /permission denied/.test(e), e);

  // -------------------------------------------------------------------------
  console.log("\nSearch");
  const elFahs = await loc(pool, "el-fahs");
  const tunis = await loc(pool, "tunis");
  const ariana = await loc(pool, "ariana");
  const s = await as(pool, "anon", (c) =>
    c.query("select * from public.search_trips($1, $2, null, 1, null, null, null, null, 'price', 10, 0)", [elFahs.id, tunis.id]));
  ok("anon can search trips", s.rowCount! > 0, s.rowCount);
  ok("search returns total_count", Number(s.rows[0]?.total_count) >= s.rowCount!);
  ok("search sorted by price", s.rows.every((r, i, a) => i === 0 || Number(a[i - 1].price_per_seat) <= Number(r.price_per_seat)));
  const near = await as(pool, "anon", (c) =>
    c.query("select * from public.search_trips($1, $2, null, 1, null, null, null, null, 'departure', 10, 0, 20)", [elFahs.id, ariana.id]));
  ok("radius search: Tunis trips match a search for nearby Ariana", near.rowCount! > 0);
  const full = await as(pool, "anon", (c) =>
    c.query("select id from public.search_trips($1, $2, null, 1, null, null, null, null, 'departure', 50, 0)", [elFahs.id, tunis.id]));
  ok("full trips hidden from search", !full.rows.some((r) => r.id === hot));
  const cheap = await as(pool, "anon", (c) =>
    c.query("select id from public.search_trips($1, $2, null, 1, 13, null, null, null, 'departure', 50, 0)", [elFahs.id, tunis.id]));
  ok("max price filter", cheap.rows.length > 0 && !cheap.rows.some((r) => r.id === hot2));
  const page2 = await as(pool, "anon", (c) =>
    c.query("select id from public.search_trips($1, $2, null, 1, null, null, null, null, 'departure', 1, 1)", [elFahs.id, tunis.id]));
  ok("pagination via limit/offset", page2.rowCount === 1);

  // -------------------------------------------------------------------------
  console.log("\nCompletion & reviews");
  e = await fails(as(pool, driver, (c) => c.query("select public.complete_trip($1)", [trip])));
  ok("cannot complete before departure", /trip_not_departed/.test(e), e);
  e = await fails(as(pool, p1, (c) => c.query("select public.submit_review($1,$2,5,'Top')", [trip, driver])));
  ok("cannot review before completion", /trip_not_completed/.test(e), e);
  // Simulate time passing (bypass the edit trigger as the DB owner).
  await pool.query("set session_replication_role = replica; update public.trips set departure_at = now() - interval '2 hours' where id = $1; set session_replication_role = origin;".replace("$1", `'${trip}'`));
  await as(pool, driver, (c) => c.query("select public.complete_trip($1)", [trip]));
  ok("confirmed booking → completed",
    (await pool.query("select status from public.bookings where id=$1", [b2])).rows[0].status === "completed");
  ok("trip counters updated",
    (await pool.query("select trips_taken from public.profiles where id=$1", [p1])).rows[0].trips_taken === 1);
  await as(pool, p1, (c) => c.query("select public.submit_review($1,$2,5,'Conducteur ponctuel et prudent')", [trip, driver]));
  ok("passenger rates driver → average updated",
    Number((await pool.query("select rating_avg from public.profiles where id=$1", [driver])).rows[0].rating_avg) === 5);
  e = await fails(as(pool, p1, (c) => c.query("select public.submit_review($1,$2,1,'again')", [trip, driver])));
  ok("duplicate review rejected", /duplicate_review/.test(e), e);
  e = await fails(as(pool, p2, (c) => c.query("select public.submit_review($1,$2,1,'troll')", [trip, driver])));
  ok("non-participant (cancelled) cannot review", /not_participant/.test(e), e);
  await as(pool, driver, (c) => c.query("select public.submit_review($1,$2,4,null)", [trip, p1]));
  ok("driver rates passenger",
    Number((await pool.query("select rating_avg from public.profiles where id=$1", [p1])).rows[0].rating_avg) === 4);
  e = await fails(as(pool, driver, (c) => c.query("select public.submit_review($1,$2,4,null)", [trip, p2])));
  ok("driver cannot rate a non-completed passenger", /not_participant/.test(e), e);
  e = await fails(as(pool, p1, (c) => c.query("insert into public.reviews (trip_id, reviewer_id, reviewee_id, reviewee_role, rating) values ($1,$2,$3,'driver',1)", [trip, p1, driver])));
  ok("reviews cannot be inserted directly", /permission denied/.test(e), e);
  const pr = await as(pool, p1, (c) => c.query("select * from public.pending_reviews()"));
  ok("pending_reviews excludes done reviews", pr.rowCount === 0, pr.rows);
  e = await fails(as(pool, driver, (c) => c.query("update public.trips set price_per_seat = 5 where id=$1", [trip])));
  ok("completed trips are not editable", /trip_not_editable/.test(e), e);

  // -------------------------------------------------------------------------
  console.log("\nTrip cancellation by driver");
  const tc = await publishTrip(pool, driver, { seats: 3 });
  const tcb = await book(pool, p2, tc, 1);
  await as(pool, driver, (c) => c.query("select public.cancel_trip($1, 'Panne')", [tc]));
  ok("trip cancel cascades to bookings",
    (await pool.query("select status from public.bookings where id=$1", [tcb])).rows[0].status === "cancelled");
  ok("passengers notified of trip cancellation",
    (await pool.query("select count(*)::int n from public.notifications where user_id=$1 and type='trip_cancelled'", [p2])).rows[0].n === 1);
  e = await fails(book(pool, p1, tc, 1));
  ok("cancelled trip not bookable", /trip_not_bookable/.test(e), e);
  const hiddenCancelled = await as(pool, "anon", (c) => c.query("select id from public.trips where id=$1", [tc]));
  ok("cancelled trip hidden from public", hiddenCancelled.rowCount === 0);
  const passengerSeesCancelled = await as(pool, p2, (c) => c.query("select id from public.trips where id=$1", [tc]));
  ok("booked passenger still sees cancelled trip", passengerSeesCancelled.rowCount === 1);

  // -------------------------------------------------------------------------
  console.log("\nReports & administration");
  await as(pool, p1, (c) => c.query("insert into public.reports (reporter_id, reported_user_id, reason, details) values ($1,$2,'harassment','Messages insistants')", [p1, p2]));
  ok("user files a report", (await pool.query("select count(*)::int n from public.reports")).rows[0].n === 1);
  const reportsSeen = await as(pool, p2, (c) => c.query("select * from public.reports"));
  ok("reported user cannot see reports about them", reportsSeen.rowCount === 0);
  e = await fails(as(pool, p1, (c) => c.query("select public.admin_stats()")));
  ok("non-admin cannot call admin functions", /forbidden/.test(e), e);
  const stats = await as(pool, admin, (c) => c.query("select public.admin_stats() s"));
  ok("admin gets platform stats", stats.rows[0].s.users_total >= 25, stats.rows[0].s.users_total);
  const users = await as(pool, admin, (c) => c.query("select * from public.admin_list_users('test.tn', null, null, 10, 0)"));
  ok("admin lists users with email", users.rows[0]?.email?.endsWith("@test.tn"));
  const adminReports = await as(pool, admin, (c) => c.query("select id from public.reports"));
  ok("admin sees all reports", adminReports.rowCount === 1);
  await as(pool, admin, (c) => c.query("select public.admin_update_report($1,'resolved','Averti')", [adminReports.rows[0].id]));
  ok("admin resolves report", (await pool.query("select status from public.reports")).rows[0].status === "resolved");

  const p2Trip = await publishTrip(pool, p2, { seats: 2 });
  const p1OnP2 = await book(pool, p1, p2Trip, 1);
  await as(pool, admin, (c) => c.query("select public.admin_set_user_status($1,'suspended','Harcèlement')", [p2]));
  ok("suspension cancels the user's trips",
    (await pool.query("select status from public.trips where id=$1", [p2Trip])).rows[0].status === "cancelled");
  ok("…and frees passengers' bookings",
    (await pool.query("select status from public.bookings where id=$1", [p1OnP2])).rows[0].status === "cancelled");
  e = await fails(as(pool, "anon", (c) => c.query("select suspended_reason from public.profiles")));
  ok("guests cannot read a suspension reason", /does not exist/.test(e), e);
  e = await fails(as(pool, p1, (c) => c.query("select suspended_reason from public.profiles")));
  ok("other users cannot read it from profiles", /does not exist/.test(e), e);
  const otherReason = await as(pool, p1, (c) => c.query("select suspended_reason from public.profile_private where id = $1", [p2]));
  ok("other users cannot read it from profile_private", otherReason.rowCount === 0, otherReason.rows);
  const ownReason = await as(pool, p2, (c) => c.query("select suspended_reason from public.profile_private where id = $1", [p2]));
  ok("the suspended user can read their own reason", ownReason.rows[0]?.suspended_reason === "Harcèlement", ownReason.rows);
  e = await fails(as(pool, p2, (c) => c.query("update public.profile_private set suspended_reason = null where id = $1", [p2])));
  ok("the suspended user cannot change their reason", /permission denied/.test(e), e);
  const adminReason = await as(pool, admin, (c) => c.query("select suspended_reason from public.admin_list_users('p2@test.tn')"));
  ok("admins still see the reason", adminReason.rows[0]?.suspended_reason === "Harcèlement", adminReason.rows);
  e = await fails(book(pool, p2, hot2, 1));
  ok("suspended user cannot book", /account_suspended|duplicate_booking/.test(e), e);
  e = await fails(publishTrip(pool, p2));
  ok("suspended user cannot publish", /row-level security|account_suspended/.test(e), e);
  e = await fails(as(pool, admin, (c) => c.query("select public.admin_set_user_status($1,'suspended',null)", [admin])));
  ok("admin cannot suspend self", /cannot_moderate_self/.test(e), e);
  await as(pool, admin, (c) => c.query("select public.admin_set_user_status($1,'active',null)", [p2]));
  ok("admin reactivates account", (await pool.query("select status from public.profiles where id=$1", [p2])).rows[0].status === "active");
  ok("reactivation clears the reason", (await pool.query("select suspended_reason from public.profile_private where id=$1", [p2])).rows[0].suspended_reason === null);
  const msgId = (await pool.query("select id from public.messages limit 1")).rows[0].id;
  await as(pool, admin, (c) => c.query("select public.admin_set_message_hidden($1, true)", [msgId]));
  const hiddenMsg = await as(pool, driver, (c) => c.query("select id from public.messages where id=$1", [msgId]));
  ok("hidden message removed from conversation", hiddenMsg.rowCount === 0);
  ok("admin actions audited", (await pool.query("select count(*)::int n from public.admin_actions")).rows[0].n >= 4);

  // -------------------------------------------------------------------------
  console.log("\nScheduled jobs");
  const soon = await publishTrip(pool, driver, { seats: 2, inHours: 3 });
  const sb = await book(pool, p1, soon, 1);
  await as(pool, driver, (c) => c.query("select public.respond_booking($1, true)", [sb]));
  const reminded = await as(pool, "service", (c) => c.query("select public.send_trip_reminders() n"));
  ok("reminders sent for trips within 24h", reminded.rows[0].n >= 1);
  ok("passenger received trip_reminder",
    (await pool.query("select count(*)::int n from public.notifications where user_id=$1 and type='trip_reminder'", [p1])).rows[0].n === 1);
  const again = await as(pool, "service", (c) => c.query("select public.send_trip_reminders() n"));
  ok("reminders are sent only once", again.rows[0].n === 0);
  e = await fails(as(pool, p1, (c) => c.query("select public.send_trip_reminders()")));
  ok("users cannot trigger jobs", /permission denied/.test(e), e);
  await pool.query(`set session_replication_role = replica; update public.trips set departure_at = now() - interval '13 hours' where id = '${soon}'; set session_replication_role = origin;`);
  const completed = await as(pool, "service", (c) => c.query("select public.complete_past_trips() n"));
  ok("past trips auto-complete", completed.rows[0].n >= 1);
  ok("auto-completed booking marked completed",
    (await pool.query("select status from public.bookings where id=$1", [sb])).rows[0].status === "completed");

  // -------------------------------------------------------------------------
  console.log("\nNotifications & storage policies");
  const others = await as(pool, p1, (c) => c.query("select * from public.notifications where user_id <> $1", [p1]));
  ok("users only see their own notifications", others.rowCount === 0);
  e = await fails(as(pool, p1, (c) => c.query("insert into public.notifications (user_id, type) values ($1,'trip_cancelled')", [p2])));
  ok("users cannot forge notifications", /permission denied/.test(e), e);
  await as(pool, p1, (c) => c.query("update public.notifications set read_at = now() where user_id=$1", [p1]));
  ok("user marks notifications read",
    (await pool.query("select count(*)::int n from public.notifications where user_id=$1 and read_at is null", [p1])).rows[0].n === 0);
  await as(pool, p1, (c) => c.query("insert into storage.objects (bucket_id, name, owner) values ('avatars', $1, $2)", [`${p1}/avatar.webp`, p1]));
  ok("user uploads into own folder", true);
  e = await fails(as(pool, p1, (c) => c.query("insert into storage.objects (bucket_id, name, owner) values ('avatars', $1, $2)", [`${p2}/evil.webp`, p1])));
  ok("user cannot upload into another user's folder", /row-level security/.test(e), e);
  const bucket = (await pool.query("select file_size_limit, allowed_mime_types from storage.buckets where id='avatars'")).rows[0];
  ok("avatar bucket restricts size & type", bucket.file_size_limit === "2097152" && bucket.allowed_mime_types.includes("image/webp"), bucket);
  // -------------------------------------------------------------------------
  console.log("\nProfile completion & driver phone privacy");
  const fresh = await createUser(pool, "fresh@test.tn", "Nour Fresh", "+21698765432", { complete: false });
  const noName = await createUser(pool, "noname@test.tn", "", "+21698765433", { complete: false });
  const isComplete = async (u: string) => (await as(pool, u, (c) => c.query("select public.my_profile_complete() v"))).rows[0].v as boolean;
  ok("new account without avatar is incomplete", (await isComplete(fresh)) === false);
  e = await fails(publishTrip(pool, fresh));
  ok("incomplete profile cannot publish a ride", /profile_incomplete/.test(e), e);
  const openTrip = await publishTrip(pool, driver, { seats: 3 });
  e = await fails(book(pool, fresh, openTrip, 1));
  ok("incomplete profile cannot book a seat", /profile_incomplete/.test(e), e);
  e = await fails(as(pool, fresh, (c) => c.query("update public.profiles set avatar_path = 'someone-else/x.jpg' where id = $1", [fresh])));
  ok("avatar must live in the user's own folder", /check constraint|violates/.test(e), e);
  await as(pool, fresh, (c) => c.query("update public.profiles set avatar_path = $1 || '/me.jpg' where id = $1::uuid", [fresh]));
  ok("an avatar path with no uploaded file does not count", (await isComplete(fresh)) === false);
  e = await fails(publishTrip(pool, fresh));
  ok("a fake avatar path cannot be used to publish", /profile_incomplete/.test(e), e);
  e = await fails(book(pool, fresh, openTrip, 1));
  ok("a fake avatar path cannot be used to book", /profile_incomplete/.test(e), e);
  await as(pool, fresh, (c) => c.query("insert into storage.objects (bucket_id, name, owner) values ('avatars', $1 || '/me.jpg', $1::uuid)", [fresh]));
  ok("avatar + name + phone completes the profile", (await isComplete(fresh)) === true);
  e = await fails(publishTrip(pool, fresh));
  ok("a complete profile with an unverified phone cannot publish", /phone_unverified/.test(e), e);
  e = await fails(book(pool, fresh, openTrip, 1));
  ok("a complete profile with an unverified phone cannot book", /phone_unverified/.test(e), e);
  await pool.query("update auth.users set phone = '21698765432', phone_confirmed_at = now() where id = $1", [fresh]);
  ok("completed profile can publish a ride", typeof (await publishTrip(pool, fresh)) === "string");
  await as(pool, fresh, (c) => c.query("delete from storage.objects where bucket_id = 'avatars' and name = $1 || '/me.jpg'", [fresh]));
  e = await fails(publishTrip(pool, fresh));
  ok("deleting the avatar file makes the profile incomplete again", /profile_incomplete/.test(e), e);
  await as(pool, fresh, (c) => c.query("insert into storage.objects (bucket_id, name, owner) values ('avatars', $1 || '/me.jpg', $1::uuid)", [fresh]));
  await as(pool, noName, (c) => c.query("update public.profiles set avatar_path = $1 || '/me.jpg' where id = $1::uuid", [noName]));
  await as(pool, noName, (c) => c.query("insert into storage.objects (bucket_id, name, owner) values ('avatars', $1 || '/me.jpg', $1::uuid)", [noName]));
  ok("empty name keeps the profile incomplete", (await isComplete(noName)) === false);
  e = await fails(as(pool, fresh, (c) => c.query("update public.profiles set avatar_path = null where id = $1", [fresh])));
  ok("avatar cannot be removed once set", /avatar_required/.test(e), e);
  e = await fails(as(pool, fresh, (c) => c.query("update public.profile_private set phone = null where id = $1", [fresh])));
  ok("phone cannot be removed once set", /phone_required/.test(e), e);
  e = await fails(as(pool, fresh, (c) => c.query("update public.profile_private set phone = '+33612345678' where id = $1", [fresh])));
  ok("non-Tunisian phone rejected by constraint", /check constraint/.test(e), e);
  ok("no bulk driver phone lookup exists", (await pool.query("select to_regprocedure('public.get_driver_phones(uuid[])') r")).rows[0].r === null);
  e = await fails(as(pool, "anon", (c) => c.query("select * from public.get_trip_contacts($1)", [openTrip])));
  ok("guests cannot request trip contacts", /permission denied/.test(e), e);
  const contactsFor = async (u: string, t: string) => (await as(pool, u, (c) => c.query("select phone, role from public.get_trip_contacts($1)", [t]))).rows;
  ok("a signed-in stranger gets no driver phone", (await contactsFor(p2, openTrip)).length === 0);
  const phoneBooking = await book(pool, fresh, openTrip, 1);
  ok("a pending passenger gets no driver phone", (await contactsFor(fresh, openTrip)).length === 0);
  await as(pool, driver, (c) => c.query("select public.respond_booking($1, true)", [phoneBooking]));
  const accepted = await contactsFor(fresh, openTrip);
  ok("an accepted passenger gets the driver phone", accepted.length === 1 && accepted[0].role === "driver" && accepted[0].phone === "+21622123456", accepted);
  await as(pool, fresh, (c) => c.query("select public.cancel_booking($1, null)", [phoneBooking]));
  ok("cancelling the booking removes phone access", (await contactsFor(fresh, openTrip)).length === 0);
  const directRead = await as(pool, p2, (c) => c.query("select phone from public.profile_private where id = $1", [driver]));
  ok("a driver's phone cannot be read directly", directRead.rowCount === 0, directRead.rows);

  // -------------------------------------------------------------------------
  console.log("\nPhone verification (SMS code)");
  const verified = async (u: string) => (await pool.query("select public.is_phone_verified($1) v", [u])).rows[0].v as boolean;
  const smsUser = await createUser(pool, "sms@test.tn", "Sms User", "+21620111222");
  ok("a confirmed number that matches the profile counts as verified", (await verified(smsUser)) === true);
  await as(pool, smsUser, (c) => c.query("update public.profile_private set phone = '+21620999888' where id = $1", [smsUser]));
  ok("changing the profile number needs a new code", (await verified(smsUser)) === false);
  e = await fails(publishTrip(pool, smsUser));
  ok("an unverified new number cannot publish", /phone_unverified/.test(e), e);
  // What Supabase Auth writes when verifyOtp({ type: 'phone_change' }) succeeds.
  await pool.query("update auth.users set phone = '21620999888', phone_confirmed_at = now() where id = $1", [smsUser]);
  ok("a verified code makes the new number the profile number", (await pool.query("select phone from public.profile_private where id = $1", [smsUser])).rows[0].phone === "+21620999888");
  ok("and the user is verified again", (await verified(smsUser)) === true);
  ok("and can publish again", typeof (await publishTrip(pool, smsUser)) === "string");
  const unconfirmed = await createUser(pool, "unconf@test.tn", "Unconfirmed", "+21620333444");
  await pool.query("update auth.users set phone = null, phone_confirmed_at = null where id = $1", [unconfirmed]);
  ok("a number without a confirmed code is not verified", (await verified(unconfirmed)) === false);
  e = await fails(pool.query("update auth.users set phone = '21620999888', phone_confirmed_at = now() where id = $1", [unconfirmed]));
  ok("a number verified on one account cannot be verified on another", /unique|duplicate/.test(e), e);
  ok("the other account keeps its own profile number", (await pool.query("select phone from public.profile_private where id = $1", [unconfirmed])).rows[0].phone === "+21620333444");
  await pool.query("update auth.users set phone = '33612345678', phone_confirmed_at = now() where id = $1", [unconfirmed]);
  ok("a confirmed non-Tunisian number is never copied to the profile", (await pool.query("select phone from public.profile_private where id = $1", [unconfirmed])).rows[0].phone === "+21620333444" && (await verified(unconfirmed)) === false);
  e = await fails(as(pool, smsUser, (c) => c.query("select public.is_phone_verified($1)", [smsUser])));
  ok("users cannot call is_phone_verified directly", /permission denied/.test(e), e);
  const hook = async (user: object) => (await pool.query("select public.hook_before_user_created($1::jsonb) r", [JSON.stringify({ metadata: {}, user })])).rows[0].r;
  ok("the signup hook refuses a phone-only signup", (await hook({ phone: "21620111222", email: "" })).error?.http_code === 403);
  ok("the signup hook refuses a signup with no email field", (await hook({ phone: "21620111222" })).error?.http_code === 403);
  ok("the signup hook allows an email signup", JSON.stringify(await hook({ email: "new@test.tn", phone: "" })) === "{}");
  e = await fails(as(pool, "anon", (c) => c.query("select public.hook_before_user_created('{}'::jsonb)")));
  ok("guests cannot call the signup hook", /permission denied/.test(e), e);
  ok("Auth can call the signup hook", (await pool.query("select has_function_privilege('supabase_auth_admin', 'public.hook_before_user_created(jsonb)', 'execute') v")).rows[0].v === true);

  const samePhone = ["22 123 456", "+216 22 123 456", "00216 22 123 456", "216 22 123 456", "22-123-456"];
  ok("every accepted input format is stored the same way", samePhone.every((v) => normalizeTunisianPhone(v) === "+21622123456"), samePhone.map(normalizeTunisianPhone));
  ok("mistyped numbers are rejected", ["2212345", "221234567", "12 345 678", "+33612345678", "+21612345678", "abc"].every((v) => normalizeTunisianPhone(v) === null));
  const phoneCases = [..."0123456789"].map((n) => `+216${n}1234567`).concat(["+2162123456", "+216212345678", "21621234567", "+33612345678"]);
  const mismatches: string[] = [];
  for (const candidate of phoneCases) {
    const dbAccepts = (await fails(as(pool, fresh, (c) => c.query("update public.profile_private set phone = $2 where id = $1", [fresh, candidate])))) === "__no_error__";
    if (dbAccepts !== TN_PHONE_REGEX.test(candidate)) mismatches.push(candidate);
  }
  ok("database and app agree on every phone number tested", mismatches.length === 0, mismatches);
  for (const kept of ["+21660123456", "+21680123456"]) {
    e = await fails(as(pool, fresh, (c) => c.query("update public.profile_private set phone = $2 where id = $1", [fresh, kept])));
    ok(`${kept.slice(0, 5)}${kept[5]}x numbers are not rejected, in the database or the app`, e === "__no_error__" && TN_PHONE_REGEX.test(kept), e);
  }
  await as(pool, fresh, (c) => c.query("update public.profile_private set phone = $2 where id = $1", [fresh, "+21698765499"]));
  ok("owner can change their phone (stored in E.164)", (await pool.query("select phone from public.profile_private where id = $1", [fresh])).rows[0].phone === "+21698765499");
  e = await fails(as(pool, "anon", (c) => c.query("select phone from public.profile_private")));
  ok("guests still cannot read profile_private", /permission denied/.test(e), e);
  e = await fails(as(pool, p1, (c) => c.query("select public.is_profile_complete($1)", [driver])));
  ok("is_profile_complete is internal only", /permission denied/.test(e), e);
  e = await fails(as(pool, "anon", (c) => c.query("select public.my_profile_complete()")));
  ok("guests cannot call my_profile_complete", /permission denied/.test(e), e);

  // -------------------------------------------------------------------------
  console.log("\nHistorical demo data");
  const seed = readFileSync(path.join(root, "supabase/seed/demo_history.sql"), "utf8");
  const realTrips = (await pool.query("select count(*)::int n from public.trips where not is_demo")).rows[0].n;
  await pool.query(seed);
  const c1 = (await pool.query("select (select count(*) from public.trips where is_demo)::int t, (select count(*) from public.bookings where is_demo)::int b, (select count(*) from public.reviews where is_demo)::int r, (select count(*) from public.profiles where is_demo)::int p")).rows[0];
  ok("seed creates 50–100 demo trips", c1.t >= 50 && c1.t <= 100, c1);
  ok("seed creates bookings and reviews", c1.b > 50 && c1.r > 30, c1);
  await pool.query(seed);
  const c2 = (await pool.query("select (select count(*) from public.trips where is_demo)::int t, (select count(*) from public.bookings where is_demo)::int b, (select count(*) from public.reviews where is_demo)::int r")).rows[0];
  ok("seed is idempotent (re-run adds nothing)", c2.t === c1.t && c2.b === c1.b && c2.r === c1.r, { c1, c2 });
  ok("all demo trips are in the past", (await pool.query("select count(*)::int n from public.trips where is_demo and departure_at >= now()")).rows[0].n === 0);
  ok("no demo trip is scheduled", (await pool.query("select count(*)::int n from public.trips where is_demo and status = 'scheduled'")).rows[0].n === 0);
  ok("demo profiles have no auth account", (await pool.query("select count(*)::int n from public.profiles p join auth.users u on u.id = p.id where p.is_demo")).rows[0].n === 0);
  ok("demo profiles have no phone numbers", (await pool.query("select count(*)::int n from public.profile_private pp join public.profiles p on p.id = pp.id where p.is_demo")).rows[0].n === 0);
  ok("demo trips only use demo people", (await pool.query("select count(*)::int n from public.bookings b join public.profiles p on p.id = b.passenger_id where b.is_demo and not p.is_demo")).rows[0].n === 0);
  ok("seat accounting consistent", (await pool.query("select count(*)::int n from public.trips t where is_demo and status = 'completed' and seats_available <> seats_total - coalesce((select sum(seats) from public.bookings b where b.trip_id = t.id and b.status = 'completed'),0)")).rows[0].n === 0);
  ok("demo driver ratings computed", (await pool.query("select count(*)::int n from public.profiles where is_demo and rating_count > 0")).rows[0].n > 5);
  const demoSearch = await as(pool, "anon", (c) => c.query("select count(*)::int n from public.search_trips(null, null, null, 1, null, null, null, null, 'departure', 50, 0) s join public.trips t on t.id = s.id where t.is_demo"));
  ok("demo trips never appear in search", demoSearch.rows[0].n === 0);
  const demoTrip = (await pool.query("select id from public.trips where is_demo and status = 'completed' limit 1")).rows[0].id;
  e = await fails(book(pool, p1, demoTrip, 1));
  ok("demo trips cannot be booked", /trip_not_bookable/.test(e), e);
  e = await fails(as(pool, p1, (c) => c.query("update public.profiles set is_demo = true where id = $1", [p1])));
  ok("users cannot flag themselves as demo", /permission denied/.test(e), e);
  e = await fails(as(pool, driver, (c) => c.query("insert into public.trips (driver_id, origin_id, destination_id, origin_address, destination_address, origin_lat, origin_lng, destination_lat, destination_lng, departure_at, seats_total, price_per_seat, is_demo) values ($1,$2,$3,'a','b',36.8,10.1,36.4,9.9, now() - interval '1 day', 3, 5, true)", [driver, tunis.id, elFahs.id])));
  ok("users cannot create demo trips", /permission denied/.test(e), e);
  e = await fails(pool.query("insert into public.profiles (id, full_name) values (gen_random_uuid(), 'ghost')"));
  ok("real profiles still require an auth user", /profile_requires_auth_user/.test(e), e);
  const demoDriver = (await pool.query("select id from public.profiles where is_demo limit 1")).rows[0].id;
  e = await fails(pool.query("insert into public.trips (driver_id, origin_id, destination_id, origin_address, destination_address, origin_lat, origin_lng, destination_lat, destination_lng, departure_at, seats_total, seats_available, price_per_seat, status, is_demo) values ($1,$2,$3,'a','b',36.8,10.1,36.4,9.9, now() + interval '2 days', 3, 3, 5, 'completed', true)", [demoDriver, tunis.id, elFahs.id]));
  ok("demo trips cannot be in the future", /demo_must_be_past/.test(e), e);
  const adminUsers = await as(pool, admin, (c) => c.query("select count(*)::int n from public.admin_list_users(null, null, null, 100, 0) where is_demo"));
  ok("admin sees demo profiles flagged", adminUsers.rows[0].n > 0);
  await pool.query("delete from auth.users where id = $1", [badPhone]);
  ok("deleting an auth user still removes the profile", (await pool.query("select count(*)::int n from public.profiles where id = $1", [badPhone])).rows[0].n === 0);
  await pool.query(readFileSync(path.join(root, "supabase/seed/demo_cleanup.sql"), "utf8"));
  ok("cleanup removes all demo data", (await pool.query("select (select count(*) from public.trips where is_demo) + (select count(*) from public.profiles where is_demo) n")).rows[0].n === "0");
  ok("cleanup leaves real trips untouched", (await pool.query("select count(*)::int n from public.trips where not is_demo")).rows[0].n === realTrips);

  console.log("\nEmail verification");
  const pending = (await pool.query(
    "insert into auth.users (email, raw_user_meta_data) values ('pending@test.tn', $1) returning id",
    [JSON.stringify({ full_name: "Pending User", phone: "+21622333444", locale: "ar" })],
  )).rows[0].id as string;
  const rowsFor = async (id: string) => (await pool.query("select p.full_name, p.preferred_locale::text locale, p.role::text, pp.phone from public.profiles p left join public.profile_private pp on pp.id = p.id where p.id = $1", [id])).rows;
  ok("no profile before the email is verified", (await rowsFor(pending)).length === 0);
  await pool.query("update auth.users set last_sign_in_at = now() where id = $1", [pending]);
  ok("unrelated user updates create no profile", (await rowsFor(pending)).length === 0);
  await pool.query("update auth.users set email_confirmed_at = now() where id = $1", [pending]);
  const created = await rowsFor(pending);
  ok("verification creates the profile from signup data", created.length === 1 && created[0].full_name === "Pending User" && created[0].locale === "ar" && created[0].phone === "+21622333444", created);
  await as(pool, pending, (c) => c.query("insert into storage.objects (bucket_id, name, owner) values ('avatars', $1 || '/me.jpg', $1::uuid)", [pending]));
  ok("a newly verified user can upload an avatar", true);
  await as(pool, pending, (c) => c.query("update public.profiles set avatar_path = $1 || '/me.jpg' where id = $1::uuid", [pending]));
  ok("avatar completes a new profile and keeps signup data", (await isComplete(pending)) === true && (await rowsFor(pending))[0].full_name === "Pending User");
  const badMeta = (await pool.query(
    "insert into auth.users (email, raw_user_meta_data) values ('badmeta@test.tn', $1) returning id",
    [JSON.stringify({ full_name: "Bad Meta", phone: "+21610123456", locale: "xx" })],
  )).rows[0].id as string;
  await pool.query("update auth.users set email_confirmed_at = now() where id = $1", [badMeta]);
  const badRows = await rowsFor(badMeta);
  ok("invalid signup data cannot abort the confirmation", badRows.length === 1 && badRows[0].phone === null && badRows[0].locale === "fr", badRows);
  await pool.query("update public.profiles set full_name = 'Renamed' where id = $1", [admin]);
  await pool.query("update auth.users set email_confirmed_at = null where id = $1", [admin]);
  await pool.query("update auth.users set email_confirmed_at = now() where id = $1", [admin]);
  const kept = await rowsFor(admin);
  ok("re-confirming never overwrites a profile or role", kept[0].full_name === "Renamed" && kept[0].role === "admin", kept);
}


main().catch((err) => {
  console.error(err);
  process.exit(1);
});
