/**
 * Checks signup, the 6-digit email code and profile creation against REAL Supabase Auth.
 * Run it on a STAGING project: it creates a real user. It refuses the project in
 * .env.local and any project with Confirm email off.
 *
 * On staging first: apply all migrations, paste supabase/templates/confirm-signup.html,
 * check Email OTP Length is 6 and turn Confirm email on.
 *
 *   STAGING_SUPABASE_URL=https://xxx.supabase.co STAGING_SUPABASE_KEY=<publishable key> \
 *   TEST_EMAIL=<inbox you can read> npx tsx scripts/e2e/otp-real-auth.ts
 *
 * Delete the test user from the staging dashboard afterwards.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";

const url = process.env.STAGING_SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.STAGING_SUPABASE_KEY;
const email = process.env.TEST_EMAIL;
if (!url || !key || !email) {
  console.error("Set STAGING_SUPABASE_URL, STAGING_SUPABASE_KEY and TEST_EMAIL.");
  process.exit(2);
}
const envFile = existsSync(".env.local") ? readFileSync(".env.local", "utf8") : "";
const appUrl = envFile.match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)?.[1]?.trim().replace(/\/$/, "");
if (appUrl && appUrl === url) {
  console.error("Refusing to run: this is the project in .env.local. Use a staging project.");
  process.exit(2);
}

let failed = 0;
const ok = (name: string, cond: boolean, detail?: unknown) => {
  console.log(`${cond ? "  ✓" : "  ✗"} ${name}`, cond ? "" : detail ?? "");
  if (!cond) failed++;
};
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const PHONE = "+21622123456";
const PASSWORD = `Otp-${crypto.randomUUID()}`;

async function main() {
  const settings = await (await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key! } })).json();
  if (settings.mailer_autoconfirm !== false) {
    console.error("Refusing to run: Confirm email is off on this project, so no code would be sent.");
    process.exit(2);
  }

  const guest = createClient(url!, key!, options);
  const profileRows = async () => (await guest.from("profiles").select("id, full_name, preferred_locale").eq("id", userId)).data ?? [];

  console.log(`Sign up (${email})`);
  const signUp = await guest.auth.signUp({ email: email!, password: PASSWORD, options: { data: { full_name: "OTP Test", phone: PHONE, locale: "ar" } } });
  const userId = signUp.data.user?.id ?? "";
  ok("signup succeeds", !signUp.error && !!userId, signUp.error?.message);
  ok("signup gives no session before verification", !signUp.data.session);
  ok("no profile exists before verification", (await profileRows()).length === 0);
  const early = await guest.auth.signInWithPassword({ email: email!, password: PASSWORD });
  ok("login before verification is refused", early.error?.code === "email_not_confirmed", early.error?.code);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const code = (await rl.question(`6-digit code sent to ${email}: `)).trim();
  ok("the emailed code has exactly 6 digits", /^\d{6}$/.test(code), code.length);

  console.log("Wrong and expired codes");
  const wrong = String((Number(code) + 1) % 1000000).padStart(6, "0");
  const wrongResult = await guest.auth.verifyOtp({ email: email!, token: wrong, type: "email" });
  ok("a wrong code is refused", !!wrongResult.error && !wrongResult.data.session, wrongResult.error?.code);
  ok("a wrong code creates no profile", (await profileRows()).length === 0);
  const expired = (await rl.question("Paste an EXPIRED code to test it, or press Enter to skip: ")).trim();
  rl.close();
  if (expired) {
    const r = await guest.auth.verifyOtp({ email: email!, token: expired, type: "email" });
    ok("an expired code is refused", !!r.error && !r.data.session, r.error?.code);
  } else {
    console.log("  - expired code skipped");
  }

  console.log("Correct code");
  const member = createClient(url!, key!, options);
  const verified = await member.auth.verifyOtp({ email: email!, token: code, type: "email" });
  ok("the correct code opens a session", !verified.error && !!verified.data.session, verified.error?.message);
  if (!verified.data.session) return;
  const rows = await profileRows();
  ok("the profile exists after verification", rows.length === 1 && rows[0].full_name === "OTP Test" && rows[0].preferred_locale === "ar", rows);
  const priv = await member.from("profile_private").select("phone").eq("id", userId).maybeSingle();
  ok("the signup phone number was saved", priv.data?.phone === PHONE, priv.data ?? priv.error?.message);
  const reused = await guest.auth.verifyOtp({ email: email!, token: code, type: "email" });
  ok("a code cannot be used twice", !!reused.error, "second use was accepted");

  console.log("Profile completion");
  const complete = async () => (await member.rpc("my_profile_complete")).data;
  ok("a new profile is incomplete without an avatar", (await complete()) === false);
  const fake = await member.from("profiles").update({ avatar_path: `${userId}/missing.png` }).eq("id", userId);
  ok("a fake avatar path is not enough", !fake.error && (await complete()) === false, fake.error?.message);
  const path = `${userId}/${crypto.randomUUID()}.png`;
  const upload = await member.storage.from("avatars").upload(path, readFileSync("public/icons/icon-192.png"), { contentType: "image/png" });
  ok("avatar upload works straight after verification", !upload.error, upload.error?.message);
  const saved = await member.from("profiles").update({ avatar_path: path }).eq("id", userId);
  ok("avatar + name + phone completes the profile", !saved.error && (await complete()) === true, saved.error?.message);

  console.log("Phone privacy");
  const bulk = await member.rpc("get_driver_phones" as never, { p_driver_ids: [] } as never);
  ok("the bulk phone lookup does not exist", bulk.error?.code === "PGRST202", bulk.error?.code);
  const denied = await guest.from("profile_private").select("phone").limit(1);
  ok("guests cannot read phone numbers", !!denied.error, denied.data);

  console.log("Suspension reason privacy");
  const reason = await guest.from("profiles").select("suspended_reason" as never).limit(0);
  ok("guests cannot read suspension reasons", reason.error?.code === "42703", reason.error?.code ?? "column is readable");
}

main()
  .then(() => {
    console.log(failed ? `\n${failed} failed` : "\nAll real Auth checks passed");
    process.exit(failed ? 1 : 0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
