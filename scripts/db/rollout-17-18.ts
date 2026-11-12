/**
 * Rehearses the production rollout of migrations 17 then 18 on a throwaway Postgres
 * holding the production schema (migrations 1-7), using the exact check scripts in
 * supabase/rollout-17-18/. Every check must be ok and no row count may change.
 *
 *   npx tsx scripts/db/rollout-17-18.ts
 */
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const root = path.resolve(__dirname, "../..");
const sql = (f: string) => readFileSync(path.join(root, f), "utf8");
const PORT = 55900 + Math.floor(Math.random() * 90);
type Row = { check: string; actual: string; expected: string; ok: boolean | null };
let failed = 0;

async function main() {
  // Under the home cache, not /tmp (a small tmpfs on this machine).
  const pg = new EmbeddedPostgres({ databaseDir: mkdtempSync(path.join(homedir(), ".cache", "wf-rollout-")), user: "postgres", password: "postgres", port: PORT, persistent: false, onLog: () => {}, onError: () => {} });
  await pg.initialise(); await pg.start(); await pg.createDatabase("w");
  const pool = new Pool({ host: "localhost", port: PORT, user: "postgres", password: "postgres", database: "w" });
  pool.on("error", () => {});
  const run = async (label: string, file: string) => {
    const { rows } = await pool.query<Row>(sql(file));
    console.log(`\n${label}`);
    for (const r of rows) {
      if (r.ok === false) failed++;
      console.log(`  ${r.ok === null ? "·" : r.ok ? "✓" : "✗"} ${r.check}: ${r.actual}${r.ok === false ? ` (expected ${r.expected})` : ""}`);
    }
    return new Map(rows.filter((r) => r.ok === null).map((r) => [r.check, r.actual]));
  };
  const same = (a: Map<string, string>, b: Map<string, string>, label: string) => {
    const diff = [...a].filter(([k, v]) => b.get(k) !== v);
    if (diff.length) failed++;
    console.log(`  ${diff.length ? "✗" : "✓"} row counts unchanged ${label}${diff.length ? `: ${JSON.stringify(diff)}` : ""}`);
  };
  try {
    await pool.query(sql("scripts/db/supabase-shim.sql"));
    for (const f of readdirSync(path.join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql") && f < "20261108").sort()) {
      await pool.query(sql(`supabase/migrations/${f}`));
    }
    await pool.query(sql("supabase/seed/demo_history.sql")); // realistic volume: demo trips, bookings, reviews
    // A real member with a phone and a pending booking, on top of the demo data.
    await pool.query(`
      insert into auth.users (id, email, raw_user_meta_data) values
        ('00000000-0000-0000-0000-0000000000d1', 'd@example.com', '{"full_name":"Driver"}'),
        ('00000000-0000-0000-0000-0000000000a1', 'p@example.com', '{"full_name":"Passenger"}');
      update public.profile_private set phone = '+21629111222' where id = '00000000-0000-0000-0000-0000000000d1';`);
    const before = await run("1-preflight.sql (production schema, migrations 1-7)", "supabase/rollout-17-18/1-preflight.sql");
    await pool.query(sql("supabase/migrations/20261111000017_public_driver_phones.sql"));
    console.log("\n  ✓ migration 17 applied");
    const after17 = await run("2-check-after-17.sql", "supabase/rollout-17-18/2-check-after-17.sql");
    same(before, after17, "after 17");
    await pool.query(sql("supabase/migrations/20261111000018_driver_phone_after_booking.sql"));
    console.log("\n  ✓ migration 18 applied");
    const after18 = await run("3-check-after-18.sql", "supabase/rollout-17-18/3-check-after-18.sql");
    same(before, after18, "after 18");
  } catch (e) {
    failed++;
    console.log("✗", (e as Error).message);
  } finally {
    await pool.end(); await pg.stop();
    console.log(failed ? `\n${failed} FAILED` : "\nall checks OK");
    process.exit(failed ? 1 : 0);
  }
}
main();
