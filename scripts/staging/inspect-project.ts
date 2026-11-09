/**
 * Read-only report on a Supabase project's Auth settings and migration history.
 * It sends GET requests only, and prints only the fields named below, so SMTP
 * passwords, API keys and hook secrets in the response are never shown.
 *
 *   PROJECT_REF=<ref> SUPABASE_ACCESS_TOKEN=<token> EXPECT_CONFIRM_EMAIL=on|off \
 *   npx tsx scripts/staging/inspect-project.ts
 *
 * EXPECT_CONFIRM_EMAIL: `on` for staging, `off` for production until the rollout reaches it.
 * It proposes no changes: any migration repair is a separate decision.
 */
import { readdirSync } from "node:fs";
import path from "node:path";

const REF = process.env.PROJECT_REF?.trim() ?? "";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN?.trim() ?? "";
const EXPECT_CONFIRM = process.env.EXPECT_CONFIRM_EMAIL;
const API = (process.env.SUPABASE_API_URL ?? "https://api.supabase.com").replace(/\/$/, "");

if (!/^[a-z0-9]+$/i.test(REF) || !TOKEN || !["on", "off"].includes(EXPECT_CONFIRM ?? "")) {
  console.error("Set PROJECT_REF, SUPABASE_ACCESS_TOKEN and EXPECT_CONFIRM_EMAIL=on|off.");
  process.exit(2);
}
// The token is only ever sent to Supabase, or to a local test server.
if (API !== "https://api.supabase.com" && !/^http:\/\/127\.0\.0\.1:\d+$/.test(API)) {
  console.error("SUPABASE_API_URL must be https://api.supabase.com.");
  process.exit(2);
}

type Result = "PASS" | "FAIL" | "UNKNOWN" | "INFO";
let failed = 0;
function line(result: Result, name: string, value?: unknown) {
  if (result === "FAIL") failed++;
  console.log(`${result.padEnd(8)}${name}${value === undefined ? "" : `: ${String(value)}`}`);
}
/** Expected value check. A missing field is UNKNOWN, never a pass. */
function expect(name: string, value: unknown, good: (v: never) => boolean) {
  if (value === undefined || value === null) return line("UNKNOWN", name, "not returned");
  line(good(value as never) ? "PASS" : "FAIL", name, value);
}

const get = (route: string) => fetch(`${API}${route}`, { method: "GET", headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" } });

async function auth() {
  console.log("Auth settings");
  const res = await get(`/v1/projects/${REF}/config/auth`);
  // Bodies of failed requests are not printed: only the status.
  if (!res.ok) {
    line("FAIL", "read Auth settings", `HTTP ${res.status}`);
    return;
  }
  const c = (await res.json()) as Record<string, unknown>;
  const num = (v: unknown) => Number(v);

  expect("Email OTP length is 6", c.mailer_otp_length, (v) => num(v) === 6);
  line(c.mailer_otp_exp == null ? "UNKNOWN" : "INFO", "Email OTP expiry in seconds (record it, do not change it)", c.mailer_otp_exp ?? "not returned");
  expect(`Confirm email is ${EXPECT_CONFIRM}`, c.mailer_autoconfirm === undefined ? undefined : c.mailer_autoconfirm ? "off" : "on", (v) => v === EXPECT_CONFIRM);

  const template = c.mailer_templates_confirmation_content;
  if (typeof template === "string" && template.length) {
    line(template.includes(".Token") ? "PASS" : EXPECT_CONFIRM === "on" ? "FAIL" : "INFO", "Confirm signup template sends {{ .Token }}", template.includes(".Token"));
    if (EXPECT_CONFIRM === "on") line(template.includes(".ConfirmationURL") ? "FAIL" : "PASS", "Confirm signup template has no link", !template.includes(".ConfirmationURL"));
  } else {
    line("UNKNOWN", "Confirm signup template", "default, or not returned");
  }

  // Whether SMTP is set, never its values.
  if (c.smtp_host === undefined) line("UNKNOWN", "custom SMTP is configured", "not returned");
  else line(c.smtp_host ? "PASS" : EXPECT_CONFIRM === "on" ? "FAIL" : "INFO", "custom SMTP is configured", Boolean(c.smtp_host));
  expect("minimum interval between emails allows the 60-second resend", c.smtp_max_frequency, (v) => num(v) <= 60);

  for (const key of ["rate_limit_email_sent", "rate_limit_otp", "rate_limit_verify", "rate_limit_token_refresh", "security_sb_forwarded_for_enabled"]) {
    line(c[key] === undefined ? "UNKNOWN" : "INFO", key, c[key] ?? "not returned");
  }
}

async function migrations() {
  console.log("\nMigration history");
  const dir = path.resolve(__dirname, "../../supabase/migrations");
  const local = readdirSync(dir).filter((f) => f.endsWith(".sql")).map((f) => f.split("_")[0]).sort();
  const res = await get(`/v1/projects/${REF}/database/migrations`);
  if (!res.ok) {
    line("UNKNOWN", "read migration history", `HTTP ${res.status}. In the SQL Editor run: select version from supabase_migrations.schema_migrations order by version;`);
    return;
  }
  const rows = (await res.json()) as { version?: string }[];
  const applied = rows.map((r) => String(r.version)).sort();
  const notApplied = local.filter((v) => !applied.includes(v));
  const notLocal = applied.filter((v) => !local.includes(v));
  line("INFO", "recorded as applied", applied.join(", ") || "none");
  line("INFO", "local, not recorded", notApplied.join(", ") || "none");
  line(notLocal.length ? "FAIL" : "PASS", "every recorded version exists locally", notLocal.join(", ") || "yes");
  if (!applied.length) line("INFO", "note", "an empty history does not prove an empty database: SQL Editor runs are not recorded");
}

async function main() {
  console.log(`Project ${REF}: read-only\n`);
  await auth();
  await migrations();
  console.log(failed ? `\n${failed} failed` : "\nNo failures. Treat any UNKNOWN as not checked.");
  process.exit(failed ? 1 : 0);
}

main().catch((e: Error) => {
  // Messages only: a stack or request dump could carry the token.
  console.error(`Stopped: ${e.message}`);
  process.exit(1);
});
