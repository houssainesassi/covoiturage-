/**
 * Migration 20 (email sign-up) on throwaway Postgres servers, for both production paths:
 *   chain A: migrations 1-7 (production today) -> 20
 *   chain B: migrations 1-7 -> 17 -> 18 -> 20
 * Each chain: preflight checks, migration 20, post checks (row counts unchanged and
 * existing rows byte-identical), behaviour as anon / authenticated, idempotent
 * re-run, rollback, re-apply. Plus: migration 20 refuses to run on duplicate phones.
 * The full folder chain (1-18 + 20) is covered by `npm run test:db`.
 *
 *   npx tsx scripts/db/migration20.ts
 */
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type PoolClient } from "pg";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { toErrorCode } from "../../src/lib/errors";

const root = path.resolve(__dirname, "../..");
const sql = (f: string) => readFileSync(path.join(root, f), "utf8");
const M17 = "supabase/migrations/20261111000017_public_driver_phones.sql";
const M18 = "supabase/migrations/20261111000018_driver_phone_after_booking.sql";
const M20 = "supabase/migrations/20261113000020_email_signup.sql";
const DOWN20 = "supabase/rollback/20261113000020_email_signup.down.sql";
type Row = { check: string; actual: string; expected: string; ok: boolean | null };

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean, detail?: unknown) {
  if (cond) passed++;
  else failed++;
  console.log(`  ${cond ? "✓" : "✗"} ${name}${cond || detail === undefined ? "" : ` → ${JSON.stringify(detail)}`}`);
}

const U = {
  driver: "00000000-0000-0000-0000-0000000000d1",
  passenger: "00000000-0000-0000-0000-0000000000a1",
  orphan: "00000000-0000-0000-0000-0000000000f1",
  pending: "00000000-0000-0000-0000-0000000000b1",
  dupe: "00000000-0000-0000-0000-0000000000b2",
  direct: "00000000-0000-0000-0000-0000000000b3",
  bad: "00000000-0000-0000-0000-0000000000b4",
  unconfOrphan: "00000000-0000-0000-0000-0000000000b5",
};

async function server(port: number) {
  const pg = new EmbeddedPostgres({ databaseDir: mkdtempSync(path.join(homedir(), ".cache", "wf-m20-")), user: "postgres", password: "postgres", port, persistent: false, onLog: () => {}, onError: () => {} });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("w");
  const pool = new Pool({ host: "localhost", port, user: "postgres", password: "postgres", database: "w", max: 5 });
  pool.on("error", () => {});
  return { pg, pool };
}

async function prodSchema(pool: Pool) {
  await pool.query(sql("scripts/db/supabase-shim.sql"));
  for (const f of readdirSync(path.join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql") && f < "20261108").sort()) {
    await pool.query(sql(`supabase/migrations/${f}`));
  }
  await pool.query(sql("supabase/seed/demo_history.sql"));
  // Existing members as production has them: auto-confirmed (Confirm email off), profile made at sign-up.
  await pool.query(`
    insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
      ('${U.driver}', 'd@example.com', now(), '{"full_name":"Driver","phone":"+21629111222","locale":"ar"}'),
      ('${U.passenger}', 'p@example.com', now(), '{"full_name":"Passenger"}'),
      ('${U.orphan}', 'o@example.com', now(), '{"full_name":"Orphan","phone":"+21655444333","locale":"en"}');
    update public.profile_private set phone = '+21629111222' where id = '${U.driver}';
    -- An account left without a profile (5 such accounts in production).
    delete from public.profiles where id = '${U.orphan}';`);
}

async function as<T>(pool: Pool, who: string | null, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    if (who) {
      await c.query("set local role authenticated");
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: who, role: "authenticated" })]);
    } else await c.query("set local role anon");
    const r = await fn(c);
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}
const err = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return e as { code?: string; message: string }; } };

/** Row counts + a fingerprint of every existing row that must never change. */
async function snapshot(pool: Pool) {
  const tables = ["auth.users", "public.profiles", "public.profile_private", "public.vehicles", "public.trips", "public.bookings", "public.reviews", "public.messages", "public.conversations", "public.notifications"];
  const out: Record<string, string> = {};
  for (const t of tables) {
    const { rows } = await pool.query(`select count(*)::text n, coalesce(md5(string_agg(x::text, '|' order by x::text)), '') h from ${t} x`);
    out[t] = `${rows[0].n}:${rows[0].h}`;
  }
  return out;
}

async function checks(pool: Pool, file: string) {
  const { rows } = await pool.query<Row>(sql(file));
  for (const r of rows.filter((r) => r.ok !== null)) ok(`${path.basename(file)}: ${r.check}`, r.ok === true, r.actual);
  return rows;
}

const has = async (pool: Pool, table: string, id: string) => (await pool.query(`select 1 from ${table} where id = $1`, [id])).rowCount === 1;
const phoneOf = async (pool: Pool, id: string) => (await pool.query(`select phone from public.profile_private where id = $1`, [id])).rows[0]?.phone ?? null;

async function behaviour(pool: Pool, chain: string) {
  console.log(`\n[${chain}] behaviour after migration 20`);
  // Sign-up with Confirm email on: the account exists, unconfirmed.
  await pool.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'new@example.com', '{"full_name":"  Nouveau  ","phone":"+21698765432","locale":"ar"}')`, [U.pending]);
  ok("unconfirmed sign-up: no profile row", !(await has(pool, "public.profiles", U.pending)));
  ok("unconfirmed sign-up: no private row (phone stays in auth metadata)", !(await has(pool, "public.profile_private", U.pending)));
  ok("unconfirmed account cannot repair itself", (await as(pool, U.pending, (c) => c.query("select public.ensure_my_profile() r"))).rows[0].r === false);
  ok("…and still has no profile", !(await has(pool, "public.profiles", U.pending)));
  await pool.query(`update auth.users set email_confirmed_at = now() where id = $1`, [U.pending]);
  const p = (await pool.query(`select full_name, preferred_locale::text l from public.profiles where id = $1`, [U.pending])).rows[0];
  ok("confirmation by link creates the profile (trimmed name, locale)", p?.full_name === "Nouveau" && p?.l === "ar", p);
  ok("confirmation copies the sign-up phone to profile_private", (await phoneOf(pool, U.pending)) === "+21698765432");
  await pool.query(`update auth.users set email_confirmed_at = now() + interval '1 minute' where id = $1`, [U.pending]);
  ok("a later update of auth.users changes nothing", (await phoneOf(pool, U.pending)) === "+21698765432");

  // Duplicate phone at confirmation: account kept, number left empty.
  await pool.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'dupe@example.com', '{"full_name":"Dupe","phone":"+21629111222"}')`, [U.dupe]);
  const e1 = await err(pool.query(`update auth.users set email_confirmed_at = now() where id = $1`, [U.dupe]));
  ok("duplicate number never blocks the confirmation", e1 === null, e1?.message);
  ok("duplicate number: profile created, phone left empty", (await has(pool, "public.profiles", U.dupe)) && (await phoneOf(pool, U.dupe)) === null);
  ok("duplicate number: the existing owner keeps it", (await phoneOf(pool, U.driver)) === "+21629111222");

  // Accounts created already confirmed (dashboard / admin API), and invalid numbers.
  await pool.query(`insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ($1, 'direct@example.com', now(), '{"full_name":"Direct","phone":"+21650000001"}')`, [U.direct]);
  ok("account created confirmed: profile at insert", (await phoneOf(pool, U.direct)) === "+21650000001");
  await pool.query(`insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ($1, 'bad@example.com', now(), '{"full_name":"Bad","phone":"0612","locale":"xx"}')`, [U.bad]);
  const bad = (await pool.query(`select preferred_locale::text l from public.profiles where id = $1`, [U.bad])).rows[0];
  ok("invalid number dropped, invalid locale → fr", (await phoneOf(pool, U.bad)) === null && bad?.l === "fr");

  // One account per number, as a member through the API (RLS + column grants).
  const e2 = await err(as(pool, U.passenger, (c) => c.query(`update public.profile_private set phone = '+21629111222' where id = $1`, [U.passenger])));
  ok("member cannot take a number used by another account (23505)", e2?.code === "23505", e2);
  ok("…and the app shows it as phone_taken", toErrorCode(e2 as never) === "phone_taken", toErrorCode(e2 as never));
  const e3 = await err(as(pool, U.passenger, (c) => c.query(`update public.profile_private set phone = '+21622333444' where id = $1`, [U.passenger])));
  ok("member can set a free number", e3 === null && (await phoneOf(pool, U.passenger)) === "+21622333444", e3?.message);
  const e4 = await err(as(pool, U.passenger, (c) => c.query(`update public.profile_private set phone = null where id = $1`, [U.passenger])));
  const e5 = await err(as(pool, U.dupe, (c) => c.query(`update public.profile_private set phone = null where id = $1`, [U.dupe])));
  ok("several accounts may have no number (partial index)", e4 === null && e5 === null, e4?.message ?? e5?.message);
  ok("the check constraint still rejects a bad format", (await err(as(pool, U.passenger, (c) => c.query(`update public.profile_private set phone = '+21612345678' where id = $1`, [U.passenger]))))?.code === "23514");
  const n = await as(pool, U.passenger, (c) => c.query(`update public.profile_private set phone = '+21622000000' where id = $1`, [U.driver]));
  ok("RLS: a member cannot change someone else's number", n.rowCount === 0 && (await phoneOf(pool, U.driver)) === "+21629111222");
  const r = await as(pool, U.passenger, (c) => c.query(`select id from public.profile_private`));
  ok("RLS: a member reads only their own private row", r.rows.length === 1 && r.rows[0].id === U.passenger, r.rows);
  ok("guests cannot read profile_private", (await err(as(pool, null, (c) => c.query(`select 1 from public.profile_private`))))?.code === "42501");

  // Self-repair of accounts without a profile.
  const before = await phoneOf(pool, U.orphan);
  const rep = await as(pool, U.orphan, (c) => c.query("select public.ensure_my_profile() r"));
  const o = (await pool.query(`select full_name, preferred_locale::text l from public.profiles where id = $1`, [U.orphan])).rows[0];
  ok("orphan account: ensure_my_profile() creates the profile", rep.rows[0].r === true && o?.full_name === "Orphan" && o?.l === "en", { before, o });
  ok("orphan account: phone from sign-up details", (await phoneOf(pool, U.orphan)) === "+21655444333");
  await pool.query(`update public.profiles set full_name = 'Edited' where id = $1`, [U.orphan]);
  await as(pool, U.orphan, (c) => c.query("select public.ensure_my_profile()"));
  ok("ensure_my_profile() never overwrites (second call)", (await pool.query(`select full_name from public.profiles where id = $1`, [U.orphan])).rows[0].full_name === "Edited");
  ok("ensure_my_profile() for a complete account: true, nothing changed", (await as(pool, U.driver, (c) => c.query("select public.ensure_my_profile() r"))).rows[0].r === true && (await phoneOf(pool, U.driver)) === "+21629111222");
  ok("guests cannot run ensure_my_profile()", (await err(as(pool, null, (c) => c.query("select public.ensure_my_profile()"))))?.code === "42501");
  ok("members cannot run create_profile_rows()", (await err(as(pool, U.passenger, (c) => c.query(`select public.create_profile_rows('${U.passenger}', '{}')`))))?.code === "42501");
  ok("members cannot run handle_new_user()", (await err(as(pool, U.passenger, (c) => c.query("select public.handle_new_user()"))))?.code !== undefined);
  // Unconfirmed account without a profile and an unknown id: nothing created.
  await pool.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'u@example.com', '{"full_name":"U"}')`, [U.unconfOrphan]);
  ok("unknown user id: ensure_my_profile() is false", (await as(pool, "00000000-0000-0000-0000-00000000dead", (c) => c.query("select public.ensure_my_profile() r"))).rows[0].r === false);

  if (chain.includes("17")) {
    // Migration 17: changing the number withdraws the consent to show it.
    // (an earlier step cleared this member's number; set_my_phone_public needs one)
    await as(pool, U.passenger, (c) => c.query(`update public.profile_private set phone = '+21622333444' where id = $1`, [U.passenger]));
    await as(pool, U.passenger, (c) => c.query("select public.set_my_phone_public(true)"));
    await as(pool, U.passenger, (c) => c.query(`update public.profile_private set phone = '+21622333445' where id = $1`, [U.passenger]));
    const pp = (await pool.query(`select phone_public from public.profile_private where id = $1`, [U.passenger])).rows[0];
    ok("migration 17 still resets 'show my number' when the number changes", pp?.phone_public === false, pp);
  }
}

async function chain(port: number, name: string, extra: string[]) {
  console.log(`\n=== ${name}`);
  const { pg, pool } = await server(port);
  try {
    await prodSchema(pool);
    for (const f of extra) await pool.query(sql(f));
    const pre = await checks(pool, "supabase/rollout-20/1-preflight.sql");
    const s0 = await snapshot(pool);
    await pool.query(sql(M20));
    ok("migration 20 applied (self-check passed)", true);
    const post = await checks(pool, "supabase/rollout-20/2-check-after-20.sql");
    const counts = (rows: Row[]) => Object.fromEntries(rows.filter((r) => r.check.startsWith("rows:")).map((r) => [r.check, r.actual]));
    const a = counts(pre), b = counts(post);
    ok("row counts identical before/after (check scripts)", Object.keys(b).every((k) => a[k] === b[k]), { a, b });
    const s1 = await snapshot(pool);
    const changed = Object.keys(s0).filter((k) => s0[k] !== s1[k]);
    ok("every existing row byte-identical after migration 20", changed.length === 0, changed);
    const e = await err(pool.query(sql(M20)));
    ok("migration 20 can run twice", e === null, e?.message);
    await behaviour(pool, name);

    console.log(`\n[${name}] rollback`);
    const s2 = await snapshot(pool);
    await pool.query(sql(DOWN20));
    const s3 = await snapshot(pool);
    ok("rollback deletes or rewrites no row", Object.keys(s2).every((k) => s2[k] === s3[k]));
    ok("rollback removes ensure_my_profile and the unique index", (await pool.query(`select to_regprocedure('public.ensure_my_profile()') f, to_regclass('public.profile_private_phone_key') i`)).rows.every((r) => r.f === null && r.i === null));
    await pool.query(`insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000c1', 'after@example.com', '{"full_name":"After"}')`);
    ok("after rollback: profile created at sign-up again (migration 1 behaviour)", await has(pool, "public.profiles", "00000000-0000-0000-0000-0000000000c1"));
    const e2 = await err(pool.query(sql(M20)));
    ok("migration 20 re-applies after rollback", e2 === null, e2?.message);
  } catch (e) {
    ok(`${name}: no unexpected error`, false, (e as Error).message);
  } finally {
    await pool.end();
    await pg.stop();
  }
}

async function duplicates(port: number) {
  console.log("\n=== migration 20 on a database with a duplicate phone");
  const { pg, pool } = await server(port);
  try {
    await prodSchema(pool);
    await pool.query(`update public.profile_private set phone = '+21629111222' where id = $1`, [U.passenger]);
    const pre = await pool.query<Row>(sql("supabase/rollout-20/1-preflight.sql"));
    ok("preflight flags the duplicate (ok = false)", pre.rows.find((r) => r.check.startsWith("no phone number shared"))?.ok === false);
    const before = await pool.query(`select pg_get_functiondef('public.handle_new_user()'::regprocedure) d`);
    const e = await err(pool.query(sql(M20)));
    ok("migration 20 refuses to run", /migration 20 stopped/.test(e?.message ?? ""), e?.message);
    const after = await pool.query(`select pg_get_functiondef('public.handle_new_user()'::regprocedure) d, to_regclass('public.profile_private_phone_key') i, to_regprocedure('public.ensure_my_profile()') f`);
    ok("…and changed nothing (function, index, RPC)", after.rows[0].d === before.rows[0].d && after.rows[0].i === null && after.rows[0].f === null);
  } finally {
    await pool.end();
    await pg.stop();
  }
}

async function main() {
  const base = 56100 + Math.floor(Math.random() * 300);
  await chain(base, "chain A: 1-7 → 20", []);
  await chain(base + 1, "chain B: 1-7 → 17 → 18 → 20", [M17, M18]);
  await duplicates(base + 2);
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main();
