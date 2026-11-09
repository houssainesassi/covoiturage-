/**
 * STAGING ONLY. Tests suspended_reason privacy through the real API, then rolls
 * migration 13 back and applies it again. It changes the staging schema and creates
 * three test users, which it deletes at the end. It refuses the project in .env.local.
 *
 * Migration 13 must already be applied (supabase db push on staging).
 *
 *   STAGING_SUPABASE_URL=https://<ref>.supabase.co STAGING_SUPABASE_KEY=<publishable key> \
 *   STAGING_SECRET_KEY=<secret key> STAGING_DB_URL=<connection string with the password> \
 *   npx tsx scripts/staging/migration13-check.ts
 *
 * The rollback runs as plain SQL, so the staging migration history stays as it was.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";

const URL_ = process.env.STAGING_SUPABASE_URL?.trim().replace(/\/$/, "") ?? "";
const KEY = process.env.STAGING_SUPABASE_KEY ?? "";
const SECRET = process.env.STAGING_SECRET_KEY ?? "";
const DB = process.env.STAGING_DB_URL ?? "";
const LOCAL = process.env.ALLOW_LOCAL_STANDIN === "1";
const root = path.resolve(__dirname, "../..");
const UP = path.join(root, "supabase/migrations/20261108000013_private_suspension_reason.sql");
const DOWN = path.join(root, "supabase/rollback/20261108000013_private_suspension_reason.down.sql");
const REASON = "Staging test reason";
const NO_COLUMN = ["42703", "PGRST204"];

const refuse = (message: string): never => {
  console.error(`Refusing to run: ${message}`);
  process.exit(2);
};
const refOf = (url: string) => url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/i)?.[1] ?? "";

function checkTarget() {
  if (!URL_ || !KEY || !SECRET || !DB) refuse("set STAGING_SUPABASE_URL, STAGING_SUPABASE_KEY, STAGING_SECRET_KEY and STAGING_DB_URL.");
  const file = existsSync(path.join(root, ".env.local")) ? readFileSync(path.join(root, ".env.local"), "utf8") : "";
  const liveUrl = file.match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)?.[1]?.trim().replace(/\/$/, "") ?? "";
  const liveRef = refOf(liveUrl);
  if (liveUrl && liveUrl === URL_) refuse("STAGING_SUPABASE_URL is the project in .env.local.");
  const liveKey = file.match(/^NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=(.*)$/m)?.[1]?.trim();
  if ((liveRef && DB.includes(liveRef)) || (liveKey && KEY === liveKey)) refuse("the database or key belongs to the project in .env.local.");
  if (LOCAL) {
    if (!/127\.0\.0\.1|localhost/.test(URL_) || !/127\.0\.0\.1|localhost/.test(DB)) refuse("ALLOW_LOCAL_STANDIN only works with local addresses.");
    return;
  }
  const ref = refOf(URL_);
  if (!ref) refuse("STAGING_SUPABASE_URL is not a Supabase project URL.");
  // Both direct (db.<ref>.supabase.co) and pooler (postgres.<ref>@…) strings name the project.
  if (!DB.includes(ref)) refuse("STAGING_DB_URL does not belong to the project in STAGING_SUPABASE_URL.");
}

let failed = 0;
let passed = 0;
function ok(name: string, cond: boolean, detail?: unknown) {
  if (cond) passed++;
  else failed++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`, cond ? "" : detail ?? "");
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const PASSWORD = `M13-${crypto.randomUUID()}`;
const stamp = Date.now();

async function main() {
  checkTarget();
  const pool = new Pool({ connectionString: DB, ssl: LOCAL ? undefined : { rejectUnauthorized: false }, max: 2 });
  pool.on("error", () => {});
  const service = createClient(URL_, SECRET, options);
  const guest = createClient(URL_, KEY, options);
  const created: string[] = [];
  let rolledBack = false;

  const hasColumn = async (table: string) =>
    (await pool.query("select 1 from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = 'suspended_reason'", [table])).rowCount === 1;
  if (!(await hasColumn("profile_private")) || (await hasColumn("profiles"))) {
    await pool.end();
    refuse("migration 13 is not applied on this project.");
  }

  const newUser = async (name: string, phone: string) => {
    const email = `wasalni.m13.${stamp}.${name}@example.com`;
    const { data, error } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: `M13 ${name}`, phone, locale: "fr" } });
    if (error || !data.user) throw new Error(`could not create the ${name} user: ${error?.message}`);
    created.push(data.user.id);
    const client = createClient(URL_, KEY, options);
    const signedIn = await client.auth.signInWithPassword({ email, password: PASSWORD });
    if (signedIn.error) throw new Error(`could not sign in the ${name} user: ${signedIn.error.message}`);
    return { id: data.user.id, email, client };
  };

  /** PostgREST reloads its schema shortly after DDL. */
  const waitForSchema = async (columnVisible: boolean) => {
    for (let i = 0; i < 30; i++) {
      const { error } = await guest.from("profiles").select("suspended_reason" as never).limit(0);
      if (Boolean(error) !== columnVisible) return;
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error("the API did not pick up the schema change within 60 seconds");
  };

  const reasonVia = async (client: SupabaseClient, id: string) => client.from("profile_private").select("suspended_reason").eq("id", id);

  try {
    const admin = await newUser("admin", "+21622000101");
    const target = await newUser("target", "+21622000102");
    const other = await newUser("other", "+21622000103");
    await pool.query("update public.profiles set role = 'admin' where id = $1", [admin.id]);

    const suspended = await admin.client.rpc("admin_set_user_status", { p_user_id: target.id, p_status: "suspended", p_reason: REASON });
    ok("an admin can suspend with a reason", !suspended.error, suspended.error?.message);

    const privacyChecks = async (label: string) => {
      console.log(`\n${label}`);
      const read = await guest.from("profiles").select("suspended_reason" as never).limit(1);
      ok("guests cannot select the reason from profiles", NO_COLUMN.includes(read.error?.code ?? ""), read.error?.code ?? "readable");
      const filter = await guest.from("profiles").select("id").filter("suspended_reason", "ilike", "*Staging*");
      ok("guests cannot search by the reason", NO_COLUMN.includes(filter.error?.code ?? ""), filter.error?.code ?? "searchable");
      const star = await guest.from("profiles").select("*").eq("id", target.id).maybeSingle();
      ok("select * does not include the reason", !star.error && !!star.data && !("suspended_reason" in star.data) && !JSON.stringify(star.data).includes(REASON), star.error?.message);
      const priv = await reasonVia(guest, target.id);
      ok("guests cannot read profile_private", !!priv.error, priv.data);
      const listAsGuest = await guest.rpc("admin_list_users", { p_search: target.email });
      ok("guests cannot call admin_list_users", !!listAsGuest.error, listAsGuest.data);
      const gql = await fetch(`${URL_}/graphql/v1`, { method: "POST", headers: { apikey: KEY, "content-type": "application/json" }, body: JSON.stringify({ query: '{ __type(name: "profiles") { fields { name } } }' }) });
      const gqlBody = gql.ok ? await gql.text() : "";
      if (gql.ok) ok("GraphQL does not offer the reason", !gqlBody.includes("suspended_reason"));
      else console.log(`SKIP  GraphQL not available (HTTP ${gql.status})`);

      const otherRead = await reasonVia(other.client, target.id);
      ok("another user gets no row from profile_private", !otherRead.error && otherRead.data?.length === 0, otherRead.data);
      const otherList = await other.client.rpc("admin_list_users", { p_search: target.email });
      ok("another user cannot call admin_list_users", !!otherList.error, otherList.data);
      const otherSet = await other.client.rpc("admin_set_user_status", { p_user_id: target.id, p_status: "active" });
      ok("another user cannot change a status", !!otherSet.error, "accepted");

      const own = await reasonVia(target.client, target.id);
      ok("the suspended user can read their own reason", own.data?.[0]?.suspended_reason === REASON, own.data ?? own.error?.message);
      const ownWrite = await target.client.from("profile_private").update({ suspended_reason: null } as never).eq("id", target.id);
      ok("the suspended user cannot change their reason", ownWrite.error?.code === "42501", ownWrite.error?.code ?? "accepted");

      const direct = await reasonVia(admin.client, target.id);
      ok("an admin can read the reason", direct.data?.[0]?.suspended_reason === REASON, direct.data ?? direct.error?.message);
      const listed = await admin.client.rpc("admin_list_users", { p_search: target.email });
      ok("admin_list_users returns the reason", listed.data?.[0]?.suspended_reason === REASON, listed.data ?? listed.error?.message);
    };

    await privacyChecks("With migration 13");

    console.log("\nRollback");
    await pool.query(readFileSync(DOWN, "utf8"));
    rolledBack = true;
    await waitForSchema(true);
    const restored = await pool.query("select suspended_reason r, status::text s from public.profiles where id = $1", [target.id]);
    ok("the reason returns to profiles", restored.rows[0]?.r === REASON, restored.rows[0]);
    ok("the user stays suspended", restored.rows[0]?.s === "suspended", restored.rows[0]);
    ok("the private column is removed", !(await hasColumn("profile_private")));
    const listedDown = await admin.client.rpc("admin_list_users", { p_search: target.email });
    ok("admin_list_users works after the rollback", listedDown.data?.[0]?.suspended_reason === REASON, listedDown.data ?? listedDown.error?.message);

    console.log("\nApplying migration 13 again");
    await pool.query(readFileSync(UP, "utf8"));
    rolledBack = false;
    await waitForSchema(false);
    await privacyChecks("After re-applying");

    console.log("\nReactivation");
    const active = await admin.client.rpc("admin_set_user_status", { p_user_id: target.id, p_status: "active" });
    ok("an admin can reactivate", !active.error, active.error?.message);
    const cleared = await reasonVia(target.client, target.id);
    ok("reactivation clears the reason", cleared.data?.[0]?.suspended_reason === null, cleared.data ?? cleared.error?.message);
  } finally {
    // Never leave staging rolled back, or test users behind.
    if (rolledBack) await pool.query(readFileSync(UP, "utf8")).then(() => console.log("Re-applied migration 13 after a failure."));
    for (const id of created) {
      const { error } = await service.auth.admin.deleteUser(id);
      ok(`test user ${id} removed`, !error, error?.message);
    }
    await pool.end();
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e: Error) => {
  console.error(`Stopped: ${e.message}`);
  process.exit(1);
});
