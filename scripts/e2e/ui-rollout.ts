/**
 * Browser test of the rollout path: signup, email code, avatar upload, onboarding and
 * admin access. Run it on a STAGING deployment connected to a STAGING Supabase project.
 * It creates a real user and refuses to run against the project in .env.local.
 *
 * Staging setup: all migrations applied, custom SMTP, supabase/templates/confirm-signup.html
 * pasted, Email OTP Length 6, Confirm email on, and one user with role = 'admin'.
 *
 *   BASE_URL=https://<staging app> \
 *   STAGING_SUPABASE_URL=https://<ref>.supabase.co STAGING_SUPABASE_KEY=<publishable key> \
 *   TEST_EMAIL=<new address, inbox you can read> \
 *   ADMIN_EMAIL=<staging admin> ADMIN_PASSWORD=<password> \
 *   CHROME_PATH=~/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome \
 *   npx tsx scripts/e2e/ui-rollout.ts
 *
 * Optional:
 *   EXISTING_EMAIL, EXISTING_PASSWORD  an existing account with no photo. Checks it can complete
 *                                      its profile and keeps its role, trips and bookings.
 *   OTP_URL     returns the latest code as text, with the address in ?email=. Without it the
 *               script asks for the code in the terminal.
 *   SHOTS_DIR   saves screenshots of each step.
 *   IGNORE_HTTPS_ERRORS=1  for a local stack with a self-signed certificate.
 *
 * Delete the test user from the staging dashboard afterwards.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";

const env = (name: string) => process.env[name]?.trim().replace(/\/$/, "") ?? "";
const BASE = env("BASE_URL");
const SUPABASE_URL = env("STAGING_SUPABASE_URL");
const KEY = process.env.STAGING_SUPABASE_KEY ?? "";
const EMAIL = process.env.TEST_EMAIL?.trim() ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL?.trim() ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const EXISTING_EMAIL = process.env.EXISTING_EMAIL?.trim() ?? "";
const EXISTING_PASSWORD = process.env.EXISTING_PASSWORD ?? "";
const SHOTS = process.env.SHOTS_DIR;
const AVATAR = path.resolve("public/icons/icon-192.png");
const PASSWORD = `Ui-${crypto.randomUUID()}`;
const digits = (first: string) => first + String(Math.floor(Math.random() * 1e7)).padStart(7, "0");
const SIX_PHONE = digits("6");
const EIGHT_PHONE = digits("8");

let failed = 0;
let passed = 0;
const errors: string[] = [];
function ok(name: string, cond: boolean, detail?: unknown) {
  if (cond) passed++;
  else failed++;
  console.log(`${cond ? "  ✓" : "  ✗"} ${name}`, cond ? "" : detail ?? "");
}
const refuse = (message: string): never => {
  console.error(`Refusing to run: ${message}`);
  process.exit(2);
};

/** Stops before any signup if this could reach the project in .env.local. */
async function checkTarget() {
  if (!BASE || !SUPABASE_URL || !KEY || !EMAIL || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error("Set BASE_URL, STAGING_SUPABASE_URL, STAGING_SUPABASE_KEY, TEST_EMAIL, ADMIN_EMAIL and ADMIN_PASSWORD.");
    process.exit(2);
  }
  const file = existsSync(".env.local") ? readFileSync(".env.local", "utf8") : "";
  const read = (name: string) => file.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.trim().replace(/\/$/, "");
  const liveSupabase = read("NEXT_PUBLIC_SUPABASE_URL");
  const liveSite = read("NEXT_PUBLIC_SITE_URL");
  if (liveSupabase && liveSupabase === SUPABASE_URL) refuse("STAGING_SUPABASE_URL is the project in .env.local.");
  if (liveSite && !/localhost|127\.0\.0\.1/.test(liveSite) && liveSite === BASE) refuse("BASE_URL is the site in .env.local.");

  // The app's own bundle shows which project the deployment talks to.
  const html = await (await fetch(BASE)).text();
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => new URL(m[1], BASE).href);
  const bundle = [html, ...(await Promise.all(scripts.map((s) => fetch(s).then((r) => r.text()).catch(() => ""))))].join("\n");
  if (liveSupabase && bundle.includes(liveSupabase)) refuse("BASE_URL is connected to the project in .env.local.");
  if (!bundle.includes(SUPABASE_URL)) refuse("BASE_URL does not appear to use STAGING_SUPABASE_URL.");

  const settings = await (await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: KEY } })).json();
  if (settings.mailer_autoconfirm !== false) refuse("Confirm email is off on this project, so no code would be sent.");
}

async function newPage(browser: Browser) {
  const context = await browser.newContext({ ignoreHTTPSErrors: process.env.IGNORE_HTTPS_ERRORS === "1", viewport: { width: 390, height: 844 } });
  await context.addCookies([{ name: "NEXT_LOCALE", value: "fr", url: BASE }]);
  await context.addInitScript(() => {
    try { sessionStorage.setItem("wasalni:install-prompt", "dismissed"); } catch {}
  });
  await context.route(/_vercel/, (r) => r.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|_vercel|WebSocket|realtime|ERR_FAILED|Encountered a script tag/i.test(m.text())) errors.push(m.text().slice(0, 300));
  });
  return page;
}

const pathOf = (page: Page) => new URL(page.url()).pathname;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
};
const waitForPath = (page: Page, prefix: string) => page.waitForURL((u) => u.pathname.startsWith(prefix)).catch(() => {});
const go = (page: Page, route: string) => page.goto(BASE + route, { waitUntil: "domcontentloaded" });

async function login(page: Page, email: string, password: string, next: string) {
  await go(page, `/auth/login?next=${encodeURIComponent(next)}`);
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.locator('form button[type="submit"]').click();
  await waitForPath(page, next);
}

async function fillRegister(page: Page) {
  await go(page, `/auth/register?next=${encodeURIComponent("/dashboard")}`);
  await page.getByRole("button", { name: /e-?mail/i }).click();
  await page.fill("#email", EMAIL);
  await page.fill("#fullName", "UI Rollout Test");
  await page.fill("#password", PASSWORD);
  await page.locator('form button[type="submit"]').click();
}

async function readCode() {
  const otpUrl = process.env.OTP_URL;
  if (otpUrl) return (await (await fetch(`${otpUrl}?email=${encodeURIComponent(EMAIL)}`)).text()).trim();
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const code = (await rl.question(`6-digit code sent to ${EMAIL}: `)).trim();
  rl.close();
  return code;
}

async function typeCode(page: Page, code: string) {
  await page.locator('input[inputmode="numeric"]').first().focus();
  await page.keyboard.type(code);
}

async function imageLoaded(page: Page) {
  const image = page.locator('img[src*="/storage/v1/object/public/avatars/"]').first();
  await image.waitFor().catch(() => {});
  return image.evaluate((e: HTMLImageElement) => new Promise<boolean>((done) => {
    if (e.complete) return done(e.naturalWidth > 0);
    e.onload = () => done(true);
    e.onerror = () => done(false);
  })).catch(() => false);
}

async function main() {
  await checkTarget();
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });

  console.log("Guests");
  const guest = await newPage(browser);
  await go(guest, "/");
  ok("the home page opens without an account", pathOf(guest) === "/");
  await go(guest, "/dashboard");
  ok("/dashboard asks a guest to log in", pathOf(guest) === "/auth/login", guest.url());
  await go(guest, "/admin");
  ok("/admin asks a guest to log in", pathOf(guest) === "/auth/login", guest.url());
  const reason = await (await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=suspended_reason&limit=0`, { headers: { apikey: KEY } })).json();
  ok("the public API does not expose suspension reasons", reason?.code === "42703", reason);
  const phones = await fetch(`${SUPABASE_URL}/rest/v1/profile_private?select=phone&limit=0`, { headers: { apikey: KEY } });
  ok("the public API does not expose phone numbers", phones.status === 401 || phones.status === 403 || phones.status === 400, phones.status);
  await guest.context().close();

  console.log("Signup");
  const page = await newPage(browser);
  await fillRegister(page);
  await waitForPath(page, "/auth/verify");
  ok("email sign-up (no phone asked) leads to the code page", pathOf(page) === "/auth/verify", page.url());
  const boxes = page.locator('input[inputmode="numeric"]');
  ok("the code page has exactly 6 boxes", (await boxes.count()) === 6, await boxes.count());
  ok("the code page shows the address", (await page.locator("body").innerText()).includes(EMAIL));
  await shot(page, "1-verify");

  console.log("Email code");
  const code = await readCode();
  ok("the emailed code has exactly 6 digits", /^\d{6}$/.test(code), code.length);
  await typeCode(page, String((Number(code) + 1) % 1000000).padStart(6, "0"));
  const wrong = page.locator('form [role="alert"]').first();
  await wrong.waitFor().catch(() => {});
  ok("a wrong code shows an error", await wrong.isVisible());
  ok("a wrong code stays on the code page", pathOf(page) === "/auth/verify", page.url());
  await shot(page, "2-wrong-code");
  await go(page, "/dashboard");
  ok("a wrong code gives no access", pathOf(page) === "/auth/login", page.url());
  await page.goBack();
  await page.waitForLoadState("domcontentloaded");
  await page.locator('input[inputmode="numeric"]').first().waitFor();
  await page.waitForLoadState("networkidle").catch(() => {});
  await typeCode(page, code);
  await waitForPath(page, "/auth/welcome");
  ok("the correct code opens the welcome screen", pathOf(page) === "/auth/welcome", page.url());
  await go(page, "/auth/complete-profile?next=/dashboard");

  console.log("Avatar and onboarding");
  ok("the signup name is filled in", (await page.inputValue("#fullName")) === "UI Rollout Test");
  await page.fill("#phone", "12 345 678");
  await page.locator('form button[type="submit"]').click();
  await page.locator('#phone[aria-invalid="true"]').waitFor().catch(() => {});
  ok("a number starting with 1 is refused", (await page.getAttribute("#phone", "aria-invalid")) === "true");
  await page.fill("#phone", SIX_PHONE);
  await shot(page, "3-complete-profile");
  const submit = page.locator('form button[type="submit"]');
  await submit.click();
  await page.locator('p[role="alert"]').first().waitFor().catch(() => {});
  ok("saving without a photo is refused", pathOf(page) === "/auth/complete-profile" && (await page.locator('p[role="alert"]').count()) > 0, page.url());
  const file = page.locator('input[type="file"]');
  await file.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") });
  await page.locator('p[role="alert"]').first().waitFor().catch(() => {});
  ok("a file that is not an image is refused", (await page.locator('img[src*="/avatars/"]').count()) === 0);
  await file.setInputFiles(AVATAR);
  ok("the uploaded photo appears and loads", await imageLoaded(page));
  await shot(page, "4-avatar-uploaded");
  await page.fill("#phone", EIGHT_PHONE);
  await submit.click();
  await waitForPath(page, "/dashboard");
  ok("saving opens the app, with a number starting with 8 accepted", pathOf(page) === "/dashboard", page.url());
  await go(page, "/auth/complete-profile?next=/dashboard");
  ok("a complete profile skips the profile step", pathOf(page) === "/dashboard", page.url());
  await go(page, "/dashboard/trips/new");
  ok("a complete profile can open the publish page", pathOf(page) === "/dashboard/trips/new", page.url());
  await go(page, "/dashboard/profile");
  ok("the photo persists after reloading", await imageLoaded(page));

  console.log("Admin access");
  await go(page, "/admin");
  await waitForPath(page, "/dashboard");
  ok("a regular user cannot open /admin", pathOf(page) === "/dashboard", page.url());
  await go(page, "/admin/users");
  ok("a regular user cannot open /admin/users", pathOf(page) === "/dashboard", page.url());
  await page.context().close();

  const admin = await newPage(browser);
  await login(admin, ADMIN_EMAIL, ADMIN_PASSWORD, "/admin");
  ok("an admin can open /admin", pathOf(admin) === "/admin", admin.url());
  await shot(admin, "5-admin");
  await go(admin, `/admin/users?q=${encodeURIComponent(EMAIL)}`);
  await admin.locator("main").waitFor();
  ok("an admin can open /admin/users", pathOf(admin) === "/admin/users", admin.url());
  ok("the new user is listed for the admin", (await admin.locator("main").innerText()).includes("UI Rollout Test"));
  await shot(admin, "6-admin-users");
  await admin.context().close();

  if (EXISTING_EMAIL && EXISTING_PASSWORD) {
    console.log("Existing account");
    const client = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const signedIn = await client.auth.signInWithPassword({ email: EXISTING_EMAIL, password: EXISTING_PASSWORD });
    const id = signedIn.data.user?.id ?? "";
    ok("the existing account can log in", !!id, signedIn.error?.message);
    const facts = async () => {
      const [profile, trips, bookings] = await Promise.all([
        client.from("profiles").select("role, status").eq("id", id).single(),
        client.from("trips").select("id", { count: "exact", head: true }).eq("driver_id", id),
        client.from("bookings").select("id, status").eq("passenger_id", id).order("id"),
      ]);
      return JSON.stringify({ profile: profile.data, trips: trips.count, bookings: bookings.data });
    };
    const before = await facts();
    const existing = await newPage(browser);
    await login(existing, EXISTING_EMAIL, EXISTING_PASSWORD, "/dashboard");
    ok("it can browse without being sent to the profile step", pathOf(existing) === "/dashboard", existing.url());
    await go(existing, "/dashboard/trips/new");
    await waitForPath(existing, "/auth/complete-profile");
    ok("publishing asks it to complete its profile", pathOf(existing) === "/auth/complete-profile", existing.url());
    await existing.locator('input[type="file"]').setInputFiles(AVATAR);
    ok("it can upload a photo", await imageLoaded(existing));
    if (!(await existing.inputValue("#phone"))) await existing.fill("#phone", digits("2"));
    await existing.locator('form button[type="submit"]').click();
    await waitForPath(existing, "/dashboard/trips/new");
    ok("it returns to the publish page", pathOf(existing) === "/dashboard/trips/new", existing.url());
    await shot(existing, "7-existing-user");
    const after = await facts();
    ok("role, status, trips and bookings are unchanged", before === after, { before, after });
    await existing.context().close();
  } else {
    console.log("Existing account: skipped (set EXISTING_EMAIL and EXISTING_PASSWORD)");
  }

  ok("no browser errors during the run", errors.length === 0, errors);
  await browser.close();
}

main()
  .then(() => {
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
