/**
 * Migration safety test for 8 to 13, on a throwaway PostgreSQL server.
 * Builds a database at migration 7 with awkward legacy accounts, then applies,
 * re-applies, rolls back and re-applies the migrations, checking no data is lost.
 *
 *   npx tsx scripts/db/migration-safety.ts
 */
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { readdirSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(__dirname, "../..");
const migDir = path.join(root, "supabase/migrations");
const rollbackDir = path.join(root, "supabase/rollback");
const PORT = 55000 + Math.floor(Math.random() * 500);
const NEW_VERSIONS = /^202611080000(08|09|10|11|12|13)_/;

let failed = 0;
let passed = 0;
function ok(name: string, cond: boolean, detail?: unknown) {
  if (cond) passed++;
  else failed++;
  console.log(`${cond ? "  ✓" : "  ✗"} ${name}`, cond ? "" : detail ?? "");
}

const allFiles = readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();
const newFiles = allFiles.filter((f) => NEW_VERSIONS.test(f));

async function run(pool: Pool) {
  const sql = (file: string) => readFileSync(file, "utf8");
  const one = async (q: string, params: unknown[] = []) => (await pool.query(q, params)).rows[0];
  const applyNew = async () => {
    for (const f of newFiles) await pool.query(sql(path.join(migDir, f)));
  };

  console.log("Migration files");
  ok("8 to 13 are all present, in order", newFiles.length === 6 && newFiles.join() === [...newFiles].sort().join(), newFiles);
  ok("they are the last migrations", allFiles.slice(-6).join() === newFiles.join(), allFiles);

  console.log("Building a database at migration 7");
  await pool.query(sql(path.join(root, "scripts/db/supabase-shim.sql")));
  for (const f of allFiles.filter((f) => !NEW_VERSIONS.test(f))) await pool.query(sql(path.join(migDir, f)));

  const signup = async (email: string, meta: object, confirmed = true) =>
    (await one(
      `insert into auth.users (email, raw_user_meta_data, email_confirmed_at) values ($1, $2, ${confirmed ? "now()" : "null"}) returning id`,
      [email, JSON.stringify(meta)],
    )).id as string;

  const complete = await signup("complete@t.tn", { full_name: "Complete Driver", phone: "+21622000001", locale: "ar" });
  await pool.query("update public.profiles set avatar_path = id::text || '/a.jpg', role = 'admin' where id = $1", [complete]);
  await pool.query("insert into storage.objects (bucket_id, name, owner) values ('avatars', $1 || '/a.jpg', $1::uuid)", [complete]);

  const passenger = await signup("passenger@t.tn", { full_name: "No Avatar Passenger", phone: "+21655000002" });
  const metaPhoneOnly = await signup("metaphone@t.tn", { full_name: "Meta Phone", phone: "+21655000003" });
  await pool.query("update public.profile_private set phone = null where id = $1", [metaPhoneOnly]);
  const blankName = await signup("blank@t.tn", { full_name: "Signup Name", phone: "+21655000004" });
  await pool.query("update public.profiles set full_name = '' where id = $1", [blankName]);
  const noProfile = await signup("noprofile@t.tn", { full_name: "Lost Profile", phone: "+21655000005", locale: "en" });
  await pool.query("delete from public.profiles where id = $1", [noProfile]);
  const noPrivate = await signup("noprivate@t.tn", { full_name: "No Private", phone: "+21655000006" });
  await pool.query("delete from public.profile_private where id = $1", [noPrivate]);
  const oldPhone = await signup("oldphone@t.tn", { full_name: "Old Rule Phone", phone: "+21680123456" });
  const unconfirmed = await signup("unconfirmed@t.tn", { full_name: "Never Confirmed", phone: "+21655000008" }, false);
  const unconfirmedGone = await signup("gone@t.tn", { full_name: "Unconfirmed No Row" }, false);
  await pool.query("delete from public.profiles where id = $1", [unconfirmedGone]);
  const fakeAvatar = await signup("fake@t.tn", { full_name: "Fake Avatar", phone: "+21655000009" });
  await pool.query("update public.profiles set avatar_path = id::text || '/missing.jpg' where id = $1", [fakeAvatar]);
  const keepsOwn = await signup("keeps@t.tn", { full_name: "Signup Value", phone: "+21655000010" });
  await pool.query("update public.profiles set full_name = 'Chosen Later' where id = $1", [keepsOwn]);
  await pool.query("update public.profile_private set phone = '+21655999999' where id = $1", [keepsOwn]);

  const suspended = await signup("suspended@t.tn", { full_name: "Suspended", phone: "+21655000013" });
  await pool.query("update public.profiles set status = 'suspended', suspended_reason = 'Fraude' where id = $1", [suspended]);
  const suspendedNoPrivate = await signup("suspended2@t.tn", { full_name: "Suspended Two", phone: "+21655000014" });
  await pool.query("update public.profiles set status = 'suspended', suspended_reason = 'Spam' where id = $1", [suspendedNoPrivate]);
  await pool.query("delete from public.profile_private where id = $1", [suspendedNoPrivate]);
  const sixPhone = await signup("sixphone@t.tn", { full_name: "Six Prefix", phone: "+21660123456" });

  const from = await one("select id, lat, lng from public.locations where slug = 'el-fahs'");
  const to = await one("select id, lat, lng from public.locations where slug = 'tunis'");
  const trip = (await one(
    `insert into public.trips (driver_id, origin_id, destination_id, origin_address, destination_address, origin_lat, origin_lng, destination_lat, destination_lng, departure_at, seats_total, price_per_seat)
     values ($1,$2,$3,'Station louage El Fahs','Bab Saadoun',$4,$5,$6,$7, now() + interval '2 days', 3, 10) returning id`,
    [complete, from.id, to.id, from.lat, from.lng, to.lat, to.lng],
  )).id as string;
  const booking = (await one(
    "insert into public.bookings (trip_id, passenger_id, seats, price_per_seat, status) values ($1,$2,1,10,'confirmed') returning id",
    [trip, passenger],
  )).id as string;

  const snapshot = async () => {
    const r = await one(`select
      (select count(*)::int from public.trips where not is_demo) trips,
      (select count(*)::int from public.bookings where not is_demo) bookings,
      (select status::text from public.bookings where id = '${booking}') booking_status,
      (select role::text from public.profiles where id = '${complete}') role,
      (select phone from public.profile_private where id = '${keepsOwn}') kept_phone,
      (select full_name from public.profiles where id = '${keepsOwn}') kept_name,
      (select phone from public.profile_private where id = '${oldPhone}') old_phone,
      (select phone from public.profile_private where id = '${sixPhone}') six_phone,
      (select status::text from public.profiles where id = '${suspended}') suspended_status`);
    return JSON.stringify(r);
  };
  const before = await snapshot();
  await pool.query(sql(path.join(root, "supabase/preflight.sql")));
  ok("the preflight report runs on a pre-migration database and changes nothing", (await snapshot()) === before);
  const triggerCount = async () => Number((await one(`select count(*) n from pg_trigger where not tgisinternal and tgname in (
    'trips_b_require_complete_profile','bookings_require_complete_profile','profiles_keep_avatar','profile_private_keep_phone','on_auth_user_email_confirmed')`)).n);

  // An environment that ran the earlier draft of migration 8.
  await pool.query(`create function public.get_driver_phones(p_driver_ids uuid[]) returns table (driver_id uuid, phone text)
    language sql as $$ select id, phone from public.profile_private $$`);

  console.log("First apply");
  await applyNew();
  ok("adds exactly five triggers", (await triggerCount()) === 5, await triggerCount());
  const report = await pool.query(sql(path.join(root, "supabase/postflight.sql"))) as unknown as { rows: Record<string, unknown>[] }[];
  ok("the postflight report confirms the migrations", report[1].rows[0].public_column_gone === true && report[1].rows[0].private_column_added === true && report[1].rows[0].triggers === 5 && report[1].rows[0].bulk_phone_lookup_gone === true, report[1].rows[0]);
  ok("the postflight report counts the moved reasons", Number(report[2].rows[0].reasons_preserved) === 2, report[2].rows[0]);
  ok("removes the bulk phone lookup", (await one("select to_regprocedure('public.get_driver_phones(uuid[])') r")).r === null);
  ok("trips, bookings, roles and user-chosen values are unchanged", (await snapshot()) === before, { before, after: await snapshot() });

  const profile = async (id: string) => one(
    "select p.full_name, p.preferred_locale::text locale, pp.phone, public.is_profile_complete(p.id) complete from public.profiles p left join public.profile_private pp on pp.id = p.id where p.id = $1", [id]);
  ok("a complete legacy user stays complete", (await profile(complete)).complete === true);
  ok("a legacy user without an avatar becomes incomplete", (await profile(passenger)).complete === false);
  ok("a missing phone is recovered from signup data", (await profile(metaPhoneOnly)).phone === "+21655000003");
  ok("a blank name is recovered from signup data", (await profile(blankName)).full_name === "Signup Name");
  const restored = await profile(noProfile);
  ok("a confirmed user with no profile gets one", restored?.full_name === "Lost Profile" && restored.phone === "+21655000005" && restored.locale === "en", restored);
  ok("a missing private row is recreated", (await profile(noPrivate)).phone === "+21655000006");
  const legacyInvalid = await profile(oldPhone);
  ok("an existing 8x number is kept", legacyInvalid.phone === "+21680123456", legacyInvalid);
  ok("an existing 6x number is kept", (await profile(sixPhone)).phone === "+21660123456");
  ok("an avatar path with no file does not complete the profile", (await profile(fakeAvatar)).complete === false);
  ok("backfill does not overwrite later changes", (await profile(keepsOwn)).phone === "+21655999999" && (await profile(keepsOwn)).full_name === "Chosen Later");
  ok("an unconfirmed user's existing row is left alone", (await one("select count(*)::int n from public.profiles where id = $1", [unconfirmed])).n === 1);
  ok("an unconfirmed user gets no new profile", (await one("select count(*)::int n from public.profiles where id = $1", [unconfirmedGone])).n === 0);

  const oldVehicle = (await one("insert into public.vehicles (owner_id, type, brand, model, color, seats) values ($1, 'suv', 'Kia', 'Sportage', 'Noir', 4) returning id", [complete])).id as string;
  const bareVehicle = (await one("insert into public.vehicles (owner_id, model, seats) values ($1, '301', 4) returning id", [complete])).id as string;
  const bare = await one("select type, brand, color from public.vehicles where id = $1", [bareVehicle]);
  ok("a vehicle can be saved with no type, brand or color", bare.type === null && bare.brand === null && bare.color === null, bare);

  console.log("Existing users completing their profile");
  const addAvatar = async (id: string) => {
    await pool.query("insert into storage.objects (bucket_id, name, owner) values ('avatars', $1 || '/new.jpg', $1::uuid)", [id]);
    await pool.query("update public.profiles set avatar_path = $1 || '/new.jpg' where id = $1::uuid", [id]);
  };
  const bookAs = (id: string) => pool.query("insert into public.bookings (trip_id, passenger_id, seats, price_per_seat, status) values ($1,$2,1,10,'confirmed')", [trip, id]).then(() => "booked", (e) => e.message as string);
  ok("an incomplete user is refused a new booking", (await bookAs(blankName)) === "profile_incomplete");
  ok("an incomplete user's existing booking stays confirmed", (await one("select status::text s from public.bookings where id = $1", [booking])).s === "confirmed");
  await addAvatar(blankName);
  ok("adding a photo completes a user whose name and phone were recovered", (await profile(blankName)).complete === true);
  ok("that user can now book", (await bookAs(blankName)) === "booked");
  await addAvatar(passenger);
  ok("a passenger with a booking can complete their profile", (await profile(passenger)).complete === true);
  ok("completing it leaves their booking unchanged", (await one("select status::text s, passenger_id::text p from public.bookings where id = $1", [booking])).s === "confirmed");
  await addAvatar(oldPhone);
  ok("an 8x number can complete a profile", (await profile(oldPhone)).complete === true);
  await addAvatar(sixPhone);
  ok("a 6x number can complete a profile", (await profile(sixPhone)).complete === true);
  await addAvatar(metaPhoneOnly);
  await pool.query("update public.profile_private set phone = '+21655000033' where id = $1", [metaPhoneOnly]);
  ok("a user can still change their number", (await profile(metaPhoneOnly)).phone === "+21655000033" && (await profile(metaPhoneOnly)).complete === true);
  ok("a number outside 2-9 is still refused", await pool.query("update public.profile_private set phone = '+21610123456' where id = $1", [metaPhoneOnly]).then(() => false, () => true));
  ok("the admin keeps their role", (await one("select role::text r from public.profiles where id = $1", [complete])).r === "admin");
  ok("the admin keeps a complete profile", (await profile(complete)).complete === true);

  console.log("Suspension reason");
  const hasColumn = async (table: string) => (await one("select count(*)::int n from information_schema.columns where table_schema='public' and table_name=$1 and column_name='suspended_reason'", [table])).n === 1;
  const privateReason = async (id: string) => (await one("select suspended_reason r from public.profile_private where id = $1", [id]))?.r;
  ok("the column is gone from the public table", !(await hasColumn("profiles")));
  ok("reasons were moved to the private table", (await privateReason(suspended)) === "Fraude");
  ok("a user with no private row keeps their reason", (await privateReason(suspendedNoPrivate)) === "Spam");
  ok("suspended users stay suspended", (await one("select status::text s from public.profiles where id = $1", [suspendedNoPrivate])).s === "suspended");
  const asAdmin = async (q: string, params: unknown[] = []) => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: complete, role: "authenticated" })]);
      const r = await c.query(q, params);
      await c.query("commit");
      return r.rows;
    } finally {
      c.release();
    }
  };
  const listedReason = async (email: string) => (await asAdmin("select suspended_reason r from public.admin_list_users($1)", [email]))[0]?.r;
  ok("the admin list shows the reason", (await listedReason("suspended@t.tn")) === "Fraude");

  console.log("Applying a second time by mistake");
  const applied = await snapshot();
  await applyNew();
  ok("runs without error and adds no duplicate triggers", (await triggerCount()) === 5, await triggerCount());
  ok("changes no data", (await snapshot()) === applied, { applied, after: await snapshot() });

  const pending = await signup("pending@t.tn", { full_name: "Pending", phone: "+21655000011" }, false);
  ok("a new unverified signup has no profile", (await one("select count(*)::int n from public.profiles where id = $1", [pending])).n === 0);

  console.log("Rollback (13, 12, 10, 9, 8)");
  const beforeRollback = await snapshot();
  for (const v of ["20261108000013_private_suspension_reason", "20261108000012_optional_vehicle_details", "20261108000010_email_verification", "20261108000009_driver_phone_access", "20261108000008_profile_completion"]) {
    await pool.query(sql(path.join(rollbackDir, `${v}.down.sql`)));
  }
  ok("removes the migration 8 triggers and functions", (await triggerCount()) === 1 && (await one("select to_regprocedure('public.is_profile_complete(uuid)') r")).r === null, await triggerCount());
  ok("keeps all data", (await snapshot()) === beforeRollback, { beforeRollback, after: await snapshot() });
  const publicReason = async (id: string) => (await one("select suspended_reason r from public.profiles where id = $1", [id])).r;
  ok("restores suspension reasons", (await publicReason(suspended)) === "Fraude" && (await publicReason(suspendedNoPrivate)) === "Spam" && !(await hasColumn("profile_private")));
  ok("the restored admin list still works", (await listedReason("suspended@t.tn")) === "Fraude");
  await asAdmin("select public.admin_set_user_status($1, 'suspended', 'Rolled back')", [keepsOwn]);
  ok("the restored suspend action still works", (await publicReason(keepsOwn)) === "Rolled back");
  const vehicleAfter = await one("select type::text, brand, color from public.vehicles where id = $1", [oldVehicle]);
  ok("keeps real vehicle details", vehicleAfter.type === "suv" && vehicleAfter.brand === "Kia" && vehicleAfter.color === "Noir", vehicleAfter);
  const bareAfter = await one("select type::text, brand, color from public.vehicles where id = $1", [bareVehicle]);
  ok("keeps blank vehicles, with a placeholder", bareAfter.type === "other" && bareAfter.brand === "-" && bareAfter.color === "-", bareAfter);
  ok("keeps uploaded avatars", (await one("select count(*)::int n from public.profiles where id = $1 and avatar_path is not null", [complete])).n === 1);
  await pool.query("update auth.users set email_confirmed_at = now() where id = $1", [pending]);
  ok("a signup that was pending still gets its profile on confirmation", (await one("select count(*)::int n from public.profiles where id = $1", [pending])).n === 1);
  const afterRollback = await signup("afterrollback@t.tn", { full_name: "After Rollback", phone: "+21655000012" }, false);
  ok("signup creates a profile immediately again", (await one("select count(*)::int n from public.profiles where id = $1", [afterRollback])).n === 1);
  ok("6x and 8x numbers are accepted after a rollback too", (await pool.query("update public.profile_private set phone = '+21680123456' where id = $1", [afterRollback])).rowCount === 1);

  console.log("Re-applying after rollback");
  const beforeReapply = await snapshot();
  await applyNew();
  ok("restores the five triggers", (await triggerCount()) === 5, await triggerCount());
  ok("keeps all data", (await snapshot()) === beforeReapply, { beforeReapply, after: await snapshot() });
  ok("a complete user is still complete", (await profile(complete)).complete === true);
  ok("moves the reasons back to the private table", !(await hasColumn("profiles")) && (await privateReason(suspended)) === "Fraude" && (await privateReason(keepsOwn)) === "Rolled back");
  await asAdmin("select public.admin_set_user_status($1, 'active', null)", [keepsOwn]);
  ok("reactivating clears the reason", (await privateReason(keepsOwn)) === null);
}

async function main() {
  const dir = mkdtempSync(path.join(tmpdir(), "wasalni-migrations-"));
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "postgres", port: PORT, persistent: false, onLog: () => {}, onError: () => {} });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("wasalni");
  const pool = new Pool({ host: "localhost", port: PORT, user: "postgres", password: "postgres", database: "wasalni" });
  pool.on("error", () => {});
  try {
    await run(pool);
  } finally {
    await pool.end();
    await pg.stop();
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
