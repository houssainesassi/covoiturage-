/**
 * Authenticated E2E: sign up → log in → publish a trip. Creates a real test user + trip.
 *   BASE_URL=http://127.0.0.1:3456 CHROME_PATH=... npx tsx scripts/e2e/auth-flow.ts
 */
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const email = process.env.TEST_EMAIL ?? `wasalni.e2e.${Date.now()}@example.com`;
const password = "Test12345!";
let failed = 0;
const ok = (name: string, cond: boolean, detail?: unknown) => {
  console.log(`${cond ? "  ✓" : "  ✗"} ${name}`, cond ? "" : detail ?? "");
  if (!cond) failed++;
};

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  const errors: string[] = [];
  const newPage = async () => {
    const ctx = await browser.newContext({ locale: "fr-FR" });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => m.type() === "error" && !/Failed to load resource|_vercel\/insights/.test(m.text()) && errors.push(m.text()));
    return p;
  };

  console.log(`Sign up (${email})`);
  let page = await newPage();
  const submitRegister = async (phone: string) => {
    await page.goto(BASE + "/auth/register");
    await page.fill("#fullName", "Test Wasalni");
    await page.fill("#email", email);
    await page.fill("#phone", phone);
    await page.fill("#password", password);
    await page.fill("#confirm", password);
    await page.check('input[name="terms"]');
    await page.locator('button[type="submit"]').click();
  };
  for (const [label, phone] of [["without a phone", ""], ["with an invalid phone", "12 345"], ["with a foreign phone", "+33 6 12 34 56 78"]]) {
    await submitRegister(phone);
    await page.locator("#phone-error").waitFor({ timeout: 15000 }).catch(() => {});
    ok(`register ${label} is rejected`, page.url().includes("/auth/register") && (await page.locator("#phone-error").count()) > 0, page.url());
  }
  await submitRegister("22 123 456");
  await page.waitForURL((u) => !u.pathname.startsWith("/auth/register"), { timeout: 20000 }).catch(() => {});
  const alert = await page.locator('form [role="alert"]').allInnerTexts();
  ok("register leaves the form", !page.url().includes("/auth/register"), { url: page.url(), alert });
  ok("register → profile completion page", page.url().includes("/auth/complete-profile"), page.url());

  console.log("Complete profile");
  await page.goto(BASE + "/dashboard");
  ok("incomplete profile is redirected from the app", page.url().includes("/auth/complete-profile"), page.url());
  await page.locator('form button[type="submit"]').click();
  await page.locator('[role="alert"]').first().waitFor({ timeout: 15000 }).catch(() => {});
  ok("completion without avatar is refused", page.url().includes("/auth/complete-profile") && (await page.locator('[role="alert"]').count()) > 0, page.url());
  await page.locator('input[type="file"]').setInputFiles("public/icons/icon-192.png");
  await page.locator('input[name="avatarPath"][value*="/"]').waitFor({ state: "attached", timeout: 20000 }).catch(() => {});
  ok("avatar uploads", (await page.locator('input[name="avatarPath"]').inputValue()).includes("/"));
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth/complete-profile"), { timeout: 20000 }).catch(() => {});
  ok("completed profile opens the app", !page.url().includes("/auth/"), page.url());
  await page.context().close();

  console.log("Log in");
  page = await newPage();
  await page.goto(BASE + "/auth/login?next=%2Fdashboard");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/dashboard/, { timeout: 20000 }).catch(() => {});
  ok("login redirects to dashboard", new URL(page.url()).pathname === "/dashboard", { url: page.url(), alert: await page.locator('form [role="alert"]').allInnerTexts() });

  console.log("Publish trip");
  await page.goto(BASE + "/dashboard/trips/new");
  ok("new trip form opens", page.url().includes("/dashboard/trips/new"), page.url());
  await page.fill("#origin-address", "Station louage El Fahs");
  await page.fill("#destination-city", "tunis");
  await page.locator('[role="option"]', { hasText: /^Tunis/ }).first().click();
  await page.fill("#destination-address", "Bab Saadoun");
  await page.getByText(/km/).first().waitFor({ timeout: 15000 }).catch(() => {});
  await page.fill("#time", "09:30");
  await page.selectOption("#seats", "3");
  await page.fill("#price", "8");
  if ((await page.inputValue("#vehicleId")) === "new") {
    await page.fill("#vBrand", "Peugeot");
    await page.fill("#vModel", "301");
    await page.fill("#vColor", "Blanc");
  }
  await page.locator('form button[type="submit"]').last().click();
  await page.waitForURL(/\/dashboard\/trips\/[0-9a-f-]{36}/, { timeout: 20000 }).catch(() => {});
  const m = page.url().match(/\/dashboard\/trips\/([0-9a-f-]{36})/);
  ok("trip created → redirect to trip page", !!m, { url: page.url(), alert: await page.locator('[role="alert"]').allInnerTexts() });

  if (m) {
    const id = m[1];
    await page.goto(BASE + "/dashboard/trips");
    ok("trip appears in driver's trips page", (await page.locator(`a[href*="${id}"]`).count()) > 0, page.url());
    const pub = await newPage();
    await pub.goto(BASE + `/trips/${id}`);
    const body = await pub.locator("main").innerText();
    ok("public trip page shows route", /El Fahs/.test(body) && /Tunis/.test(body), body.slice(0, 300));
    ok("public trip page shows the driver's phone", (await pub.locator('a[href="tel:+21622123456"]').count()) > 0);
    ok("public trip page shows price", /8/.test(body));
    await pub.goto(BASE + "/search?from=el-fahs&to=tunis");
    ok("trip appears in search", (await pub.locator(`a[href="/trips/${id}"]`).count()) > 0);
    await pub.goto(BASE + "/");
    ok("trip appears on home", (await pub.locator(`a[href="/trips/${id}"]`).count()) > 0);
    console.log("TRIP_ID=" + id);
  }

  ok("no client-side errors", errors.length === 0, errors);
  await browser.close();
  console.log(failed ? `\n${failed} failed` : "\nAll auth checks passed");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
