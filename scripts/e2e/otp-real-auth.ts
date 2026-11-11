/**
 * Checks signup, the 6-digit email code and profile creation against REAL Supabase Auth.
 * Run it on a STAGING project: it creates a real user. It refuses the project in
 * .env.local and any project with Confirm email off.
 *
 * Email is the only verification: no SMS, the phone is a plain profile field.
 * On staging first: apply migrations 1-7, 10, 11 and 14 (8 and 15 only if approved),
 * set up custom SMTP, paste supabase/templates/confirm-signup.html as "Confirm sign up",
 * check Email OTP Length is 6, keep the Phone provider off and turn Confirm email on.
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
  const first = (await rl.question(`6-digit code sent to ${email}: `)).trim();
  ok("the emailed code has exactly 6 digits", /^\d{6}$/.test(first), first.length);

  console.log("Wrong code");
  const wrong = String((Number(first) + 1) % 1000000).padStart(6, "0");
  const wrongResult = await guest.auth.verifyOtp({ email: email!, token: wrong, type: "email" });
  ok("a wrong code is refused", !!wrongResult.error && !wrongResult.data.session, wrongResult.error?.code);
  ok("a wrong code creates no profile", (await profileRows()).length === 0);

  console.log("Resend");
  let resent = await guest.auth.resend({ type: "signup", email: email! });
  if (resent.error?.code === "over_email_send_rate_limit") {
    console.log("  - resend limited (60 s between emails), waiting 61 s");
    await new Promise((r) => setTimeout(r, 61_000));
    resent = await guest.auth.resend({ type: "signup", email: email! });
  }
  ok("resend sends a new email", !resent.error, resent.error?.message);
  const code = (await rl.question("NEW 6-digit code from the second email: ")).trim();
  ok("the new code has exactly 6 digits and differs", /^\d{6}$/.test(code) && code !== first, code.length);
  const old = await guest.auth.verifyOtp({ email: email!, token: first, type: "email" });
  ok("the first code no longer works after a resend", !!old.error && !old.data.session, "old code accepted");

  const expired = (await rl.question("Paste an EXPIRED code to test it (from an earlier run, or after lowering the expiry), or press Enter to skip: ")).trim();
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
  ok("the email is confirmed", !!verified.data.user?.email_confirmed_at);
  ok("no phone is attached to the Auth account (no SMS path)", !verified.data.user?.phone && !verified.data.user?.phone_confirmed_at, verified.data.user?.phone);
  const rows = await profileRows();
  ok("the profile exists after verification", rows.length === 1 && rows[0].full_name === "OTP Test" && rows[0].preferred_locale === "ar", rows);
  const priv = await member.from("profile_private").select("phone").eq("id", userId).maybeSingle();
  ok("the signup phone number was saved", priv.data?.phone === PHONE, priv.data ?? priv.error?.message);
  const reused = await guest.auth.verifyOtp({ email: email!, token: code, type: "email" });
  ok("a code cannot be used twice", !!reused.error, "second use was accepted");

  console.log("Phone is a plain field");
  const edited = await member.from("profile_private").update({ phone: "+21650123456" }).eq("id", userId).select("phone");
  ok("the phone can be changed with no code", !edited.error && edited.data?.[0]?.phone === "+21650123456", edited.error?.message);
  const denied = await guest.from("profile_private").select("phone").limit(1);
  ok("guests cannot read phone numbers", !!denied.error || (denied.data ?? []).length === 0, denied.data);

  console.log("Login after verification");
  const login = createClient(url!, key!, options);
  const signedIn = await login.auth.signInWithPassword({ email: email!, password: PASSWORD });
  ok("email + password login works", !signedIn.error && !!signedIn.data.session, signedIn.error?.message);
  const bad = await login.auth.signInWithPassword({ email: email!, password: PASSWORD + "x" });
  ok("a wrong password is refused", bad.error?.code === "invalid_credentials", bad.error?.code);
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
