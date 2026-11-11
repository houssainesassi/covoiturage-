/**
 * Proves migration 18 applies on the LIVE schema (migrations 1-7 only, as probed on
 * 2026-11-11), behaves as intended, and rolls back cleanly. Throwaway embedded Postgres.
 *
 *   npx tsx scripts/db/migration18-on-live.ts
 */
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { readdirSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(__dirname, "../..");
const PORT = 55100 + Math.floor(Math.random() * 400);
let failed = 0;
const ok = (n: string, c: boolean, d?: unknown) => { console.log(`  ${c ? "✓" : "✗"} ${n}`, c ? "" : d ?? ""); if (!c) failed++; };

async function main() {
  const dir = mkdtempSync(path.join(tmpdir(), "wasalni-m18-"));
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "postgres", port: PORT, persistent: false, onLog: () => {}, onError: () => {} });
  await pg.initialise(); await pg.start(); await pg.createDatabase("w");
  const pool = new Pool({ host: "localhost", port: PORT, user: "postgres", password: "postgres", database: "w" });
  pool.on("error", () => {});
  const sql = (f: string) => readFileSync(path.join(root, f), "utf8");
  try {
    await pool.query(sql("scripts/db/supabase-shim.sql"));
    const live = readdirSync(path.join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort().filter((f) => f < "20261108");
    for (const f of live) await pool.query(sql(`supabase/migrations/${f}`));
    console.log(`Applied live schema: ${live.join(", ")}`);

    const as = async (uid: string, q: string, a: unknown[]) => {
      const c = await pool.connect();
      try {
        await c.query("begin"); await c.query("set local role authenticated");
        await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated" })]);
        await c.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
        const r = await c.query(q, a); await c.query("commit"); return r.rows;
      } catch (e) { await c.query("rollback"); throw e; } finally { c.release(); }
    };
    const user = async (email: string, phone: string) => {
      const id = (await pool.query("insert into auth.users (email, raw_user_meta_data, email_confirmed_at) values ($1,$2,now()) returning id", [email, JSON.stringify({ full_name: email.split("@")[0], phone })])).rows[0].id as string;
      await pool.query("insert into public.profile_private (id, phone) values ($1,$2) on conflict (id) do update set phone = excluded.phone", [id, phone]);
      return id;
    };
    const driver = await user("driver@example.test", "+21622123456");
    const pax = await user("pax@example.test", "+21655000111");
    const stranger = await user("stranger@example.test", "+21655000222");
    const l = (await pool.query("select id, lat, lng from public.locations where slug in ('el-fahs','tunis') order by slug")).rows;
    const trip = (await as(driver, `insert into public.trips (driver_id, origin_id, destination_id, origin_address, destination_address, origin_lat, origin_lng, destination_lat, destination_lng, departure_at, seats_total, price_per_seat, auto_accept)
      values ($1,$2,$3,'Station louage El Fahs','Bab Saadoun',$4,$5,$6,$7, now() + interval '2 days', 3, 10, false) returning id`, [driver, l[0].id, l[1].id, l[0].lat, l[0].lng, l[1].lat, l[1].lng]))[0].id as string;
    const contacts = (u: string) => as(u, "select phone, role from public.get_trip_contacts($1)", [trip]);
    const booking = (await as(pax, "select public.request_booking($1, 1, null) as id", [trip]))[0].id as string;
    const status = async () => (await pool.query("select status from public.bookings where id = $1", [booking])).rows[0].status;

    console.log("Before migration 18 (current production)");
    ok("pending passenger gets NO driver phone", (await contacts(pax)).length === 0);

    await pool.query(sql("supabase/migrations/20261111000018_driver_phone_after_booking.sql"));
    console.log("After migration 18");
    const c = await contacts(pax);
    ok("pending passenger gets the driver's real phone", c.length === 1 && c[0].phone === "+21622123456" && c[0].role === "driver", c);
    ok("booking is still pending (not auto-confirmed)", (await status()) === "pending");
    ok("stranger gets nothing", (await contacts(stranger)).length === 0);
    ok("driver does not see pending passenger's phone", (await contacts(driver)).length === 0);
    const anonErr = await pool.query("select has_function_privilege('anon', 'public.get_trip_contacts(uuid)', 'execute') as x");
    ok("anon cannot execute", anonErr.rows[0].x === false);
    await pool.query(sql("supabase/migrations/20261111000018_driver_phone_after_booking.sql"));
    ok("re-running migration 18 is harmless", (await contacts(pax)).length === 1);
    await as(pax, "select public.cancel_booking($1, null)", [booking]).catch(async () => { await pool.query("update public.bookings set status = 'cancelled' where id = $1", [booking]); });
    ok("cancelled booking loses the phone", (await contacts(pax)).length === 0);

    await pool.query(sql("supabase/rollback/20261111000018_driver_phone_after_booking.down.sql"));
    const b2 = (await as(stranger, "select public.request_booking($1, 1, null) as id", [trip]))[0].id;
    console.log("After rollback");
    ok("pending passenger gets no phone again", (await contacts(stranger)).length === 0, b2);
  } finally {
    await pool.end(); await pg.stop(); rmSync(dir, { recursive: true, force: true });
  }
  console.log(failed ? `\n${failed} FAILED` : "\nAll checks passed");
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
