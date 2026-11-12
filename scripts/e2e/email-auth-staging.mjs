// End-to-end test of email sign-up against REAL Supabase Auth, on the STAGING project only.
//
// Needs (never the production project; the script refuses its ref):
//   STAGING_SUPABASE_URL   https://<staging-ref>.supabase.co
//   STAGING_SECRET_KEY     staging secret (service role) key: admin API for links + cleanup
//   APP_URL                the app built with the staging NEXT_PUBLIC_* env (Vercel preview or `next start`)
// Optional:
//   E2E_INBOX              an address you own (e.g. you+wf@gmail.com): one real sign-up is sent there so
//                          delivery can be checked by hand in Gmail/Outlook (spam folder, sender, language).
//   CHROME                 path to a Chromium binary (default: playwright's headless shell in ~/.cache)
//
// Staging Auth must be set as for production: Confirm email ON, custom SMTP, templates linking to
// {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=..., Secure email change ON.
// Links are taken from the admin API (generateLink), so the cross-device flow is tested without an
// inbox: each link is opened in a fresh browser context (no cookies, no PKCE verifier).
// Every test user is deleted at the end.
//
//   STAGING_SUPABASE_URL=… STAGING_SECRET_KEY=… APP_URL=… node scripts/e2e/email-auth-staging.mjs
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");

const PROD_REF = "nstawljljfyjhgpxuwkg";
const SB = (process.env.STAGING_SUPABASE_URL ?? "").replace(/\/$/, "");
const KEY = process.env.STAGING_SECRET_KEY ?? "";
const APP = (process.env.APP_URL ?? "").replace(/\/$/, "");
const INBOX = process.env.E2E_INBOX ?? "";
const CHROME = process.env.CHROME ?? `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell`;
if (!SB || !KEY || !APP) throw new Error("Set STAGING_SUPABASE_URL, STAGING_SECRET_KEY and APP_URL");
if (SB.includes(PROD_REF) || APP.includes(PROD_REF)) throw new Error("Refusing to run against the production project");

const STAMP = Date.now().toString(36);
const mail = (tag) => `wf.e2e.${tag}.${STAMP}@example.com`;
const PW = `E2e${STAMP}x9`;
const PW2 = `New${STAMP}y8`;
const created = new Set();

let passed = 0, failed = 0;
const ok = (name, cond, detail) => { if (cond) passed++; else failed++; console.log(`  ${cond ? "✓" : "✗"} ${name}${!cond && detail !== undefined ? ` → ${JSON.stringify(detail).slice(0, 300)}` : ""}`); };
const admin = async (path, init = {}) => {
  const r = await fetch(`${SB}${path}`, { ...init, headers: { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/json", ...(init.headers ?? {}) } });
  const t = await r.text();
  let j = null; try { j = t ? JSON.parse(t) : null; } catch { j = t; }
  return { status: r.status, body: j };
};
const userByEmail = async (email) => {
  const { body } = await admin(`/auth/v1/admin/users?per_page=200`);
  return (body?.users ?? []).find((u) => u.email === email) ?? null;
};
const rest = async (q) => (await admin(`/rest/v1/${q}`)).body;
const link = async (payload) => {
  const { status, body } = await admin(`/auth/v1/admin/generate_link`, { method: "POST", body: JSON.stringify(payload) });
  const hashed = body?.properties?.hashed_token ?? body?.hashed_token;
  if (status !== 200 || !hashed) throw new Error(`generate_link ${payload.type}: ${status} ${JSON.stringify(body).slice(0, 200)}`);
  return hashed;
};
const confirmUrl = (token, type) => `${APP}/auth/confirm?token_hash=${encodeURIComponent(token)}&type=${type}`;

async function main() {
  const settings = await (await fetch(`${SB}/auth/v1/settings`, { headers: { apikey: KEY } })).json();
  ok("staging: email provider on, Confirm email ON, phone provider off", settings.external?.email === true && settings.mailer_autoconfirm === false && settings.external?.phone !== true, settings);

  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = async (locale = "fr") => { const c = await browser.newContext({ viewport: { width: 390, height: 844 } }); await c.addCookies([{ name: "NEXT_LOCALE", value: locale, url: APP }]); return c; };
  const signUp = async (page, { name, email, phone, password = PW, next }) => {
    await page.goto(`${APP}/auth/register${next ? `?next=${encodeURIComponent(next)}` : ""}`);
    await page.fill("#fullName", name); await page.fill("#email", email); await page.fill("#phone", phone);
    await page.fill("#password", password); await page.check('input[name="terms"]');
    await page.click('button[type="submit"]');
  };
  const login = async (page, email, password) => {
    await page.goto(`${APP}/auth/login`);
    await page.fill("#email", email); await page.fill("#password", password); await page.click('button[type="submit"]');
  };
  // A number no real member uses: 2 + the last 7 digits of the clock (unique per run).
  const phoneA = `+2162${String(Date.now()).slice(-7)}`;
  try {
    // 1. Sign-up → unconfirmed, no profile.
    console.log("\n1. Sign-up");
    const A = mail("a");
    let c = await ctx(); let pg = await c.newPage();
    await signUp(pg, { name: "E2E Sami", email: A, phone: phoneA.replace("+216", ""), next: "/search" });
    await pg.waitForURL(/\/auth\/check-email/, { timeout: 20000 });
    let ua = await userByEmail(A); if (ua) created.add(ua.id);
    ok("account created, email NOT confirmed", ua && !ua.email_confirmed_at, ua && { confirmed: ua.email_confirmed_at });
    ok("phone kept in sign-up data (+216)", ua?.user_metadata?.phone === phoneA, ua?.user_metadata);
    ok("no profile before confirmation", (await rest(`profiles?id=eq.${ua?.id}&select=id`))?.length === 0);
    await c.close();

    // 2. Login before confirming + resend (real Supabase rate limit).
    console.log("\n2. Login before confirming, resend");
    c = await ctx(); pg = await c.newPage();
    await login(pg, A, PW);
    await pg.waitForURL(/unconfirmed=1/, { timeout: 20000 });
    ok("unconfirmed login → check-email?unconfirmed=1", true);
    const resend = pg.getByRole("button", { name: /Renvoyer/ });
    await resend.click(); await pg.waitForTimeout(3000);
    const firstResend = (await pg.getByRole("status").count()) === 1 || (await pg.locator("text=Trop de tentatives").count()) === 1;
    ok("resend answered (sent, or Supabase 60 s limit right after sign-up)", firstResend);
    ok("still exactly one account for this address", (await (await admin(`/auth/v1/admin/users?per_page=200`)).body.users.filter((u) => u.email === A).length) === 1);
    await c.close();

    // 3. Confirmation link opened on another device; GET alone must not confirm.
    console.log("\n3. Confirmation on another device");
    let tok;
    try { tok = await link({ type: "signup", email: A, password: PW }); } catch { tok = await link({ type: "magiclink", email: A }); }
    const scan = await fetch(confirmUrl(tok, "email"));
    ua = await userByEmail(A);
    ok("mail-scanner GET of the link does not confirm", scan.status === 200 && !ua.email_confirmed_at);
    c = await ctx("ar"); pg = await c.newPage();
    await pg.goto(confirmUrl(tok, "email"));
    await pg.locator('form button[type="submit"]').click();
    await pg.waitForURL(/\/auth\/complete-profile/, { timeout: 20000 });
    ua = await userByEmail(A);
    ok("button → email confirmed", Boolean(ua.email_confirmed_at));
    ok("→ complete-profile, booking/return link kept", decodeURIComponent(pg.url()).includes("next=/search"), pg.url());
    ok("profile created on confirmation (migration 20)", (await rest(`profiles?id=eq.${ua.id}&select=id`))?.length === 1);
    ok("phone copied to profile_private", (await rest(`profile_private?id=eq.${ua.id}&select=phone`))?.[0]?.phone === phoneA);
    await c.close();
    c = await ctx(); pg = await c.newPage();
    await pg.goto(confirmUrl(tok, "email")); await pg.locator('form button[type="submit"]').click(); await pg.waitForTimeout(3000);
    ok("same link twice → 'already used'", (await pg.locator("text=déjà utilisé").count()) >= 1);
    await c.close();

    // 4. Duplicate email and duplicate phone.
    console.log("\n4. Duplicates");
    c = await ctx(); pg = await c.newPage();
    await signUp(pg, { name: "E2E Dup", email: A, phone: "22 000 111" }); await pg.waitForTimeout(3000);
    ok("existing confirmed email → 'account already exists'", (await pg.locator("text=Un compte existe déjà").count()) >= 1);
    const B = mail("b");
    await signUp(pg, { name: "E2E Same Phone", email: B, phone: phoneA.replace("+216", "") });
    await pg.waitForURL(/\/auth\/check-email/, { timeout: 20000 });
    const ub = await userByEmail(B); created.add(ub.id);
    await c.close();
    const tokB = await link({ type: "magiclink", email: B });
    c = await ctx(); pg = await c.newPage();
    await pg.goto(confirmUrl(tokB, "email")); await pg.locator('form button[type="submit"]').click();
    await pg.waitForURL(/\/auth\/complete-profile/, { timeout: 20000 });
    ok("same phone: confirmation still works, number left empty", (await rest(`profile_private?id=eq.${ub.id}&select=phone`))?.[0]?.phone === null);
    ok("first owner keeps the number", (await rest(`profile_private?id=eq.${ua.id}&select=phone`))?.[0]?.phone === phoneA);
    await c.close();

    // 5. Password recovery on another device, then everything signed out.
    console.log("\n5. Password recovery");
    const devA = await ctx(); const pa = await devA.newPage();
    await login(pa, A, PW); await pa.waitForURL((u) => !u.pathname.startsWith("/auth/login"), { timeout: 20000 });
    c = await ctx(); pg = await c.newPage();
    await pg.goto(`${APP}/auth/forgot-password`); await pg.fill("#email", A); await pg.click('button[type="submit"]'); await pg.waitForTimeout(2000);
    await c.close();
    const rec = await link({ type: "recovery", email: A });
    const devB = await ctx(); const pb = await devB.newPage();
    await pb.goto(confirmUrl(rec, "recovery")); await pb.locator('form button[type="submit"]').click();
    await pb.waitForURL(/\/auth\/reset-password/, { timeout: 20000 });
    await pb.fill("#password", PW2); await pb.fill("#confirm", PW2); await pb.click('button[type="submit"]');
    await pb.waitForURL(/\/auth\/login/, { timeout: 20000 });
    ok("new password saved → login page", true);
    await pa.goto(`${APP}/dashboard`);
    ok("device A signed out after the reset (global sign-out)", pa.url().includes("/auth/login"), pa.url());
    await devA.close();
    await login(pb, A, PW); await pb.waitForTimeout(2500);
    ok("old password refused", pb.url().includes("/auth/login"));
    await login(pb, A, PW2); await pb.waitForURL((u) => !u.pathname.startsWith("/auth/login"), { timeout: 20000 });
    ok("new password works", true);

    // 6. Email change with Secure email change (two links).
    console.log("\n6. Email change");
    const A2 = mail("a2");
    await pb.goto(`${APP}/dashboard/settings`); await pb.fill("#new-email", A2);
    await pb.getByRole("button", { name: /Changer d.e-mail/ }).click(); await pb.waitForTimeout(2500);
    const cur = await link({ type: "email_change_current", email: A, newEmail: A2 });
    const nw = await link({ type: "email_change_new", email: A, newEmail: A2 });
    const d2 = await ctx(); const p2 = await d2.newPage();
    await p2.goto(confirmUrl(cur, "email_change")); await p2.locator('form button[type="submit"]').click(); await p2.waitForTimeout(3000);
    await p2.goto(confirmUrl(nw, "email_change")); await p2.locator('form button[type="submit"]').click(); await p2.waitForTimeout(3000);
    ok("email changed only after both links", (await userByEmail(A2))?.id === ua.id);
    await d2.close(); await devB.close();

    // 7. Real delivery (checked by a person).
    if (INBOX) {
      console.log("\n7. Real delivery");
      c = await ctx(); pg = await c.newPage();
      await signUp(pg, { name: "E2E Delivery", email: INBOX, phone: "29 876 543" });
      await pg.waitForURL(/\/auth\/check-email/, { timeout: 20000 });
      const ud = await userByEmail(INBOX); if (ud) created.add(ud.id);
      console.log(`  → Check ${INBOX}: the email must arrive (not in spam), link to ${APP}/auth/confirm, open it on your phone and press the button.`);
      await c.close();
    }
  } catch (e) {
    ok("no unexpected error", false, String(e?.message ?? e));
  } finally {
    await browser.close();
    if (!INBOX) for (const id of created) await admin(`/auth/v1/admin/users/${id}`, { method: "DELETE" });
    else console.log(`  (test users kept for the delivery check; delete them in staging afterwards: ${[...created].join(", ")})`);
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  }
}
main();
