/**
 * Responsive audit: loads pages at several widths and reports horizontal overflow.
 *   BASE_URL=http://127.0.0.1:3456 CHROME_PATH=... [TEST_EMAIL=.. TEST_PASSWORD=..] npx tsx scripts/e2e/responsive.ts
 */
import { chromium, type Page } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const WIDTHS = [320, 375, 414, 768, 1024, 1440];
const SHOTS = process.env.SHOTS_DIR;
const guest = ["/", "/search", "/search?from=el-fahs&to=tunis", "/help", "/terms", "/privacy", "/auth/login", "/auth/register", "/auth/forgot-password", "/nope-404"];
const authed = ["/dashboard", "/dashboard/bookings", "/dashboard/trips", "/dashboard/trips/new", "/dashboard/vehicles", "/dashboard/vehicles/new", "/dashboard/earnings", "/dashboard/messages", "/dashboard/notifications", "/dashboard/reviews", "/dashboard/profile", "/dashboard/settings"];
let failed = 0;

async function audit(base: Page, path: string, locales: string[]) {
  const page = await base.context().newPage();
  try { await auditIn(page, path, locales); } catch (e) { failed++; console.log(`✗ ${path}: ${(e as Error).message.split("\n")[0]}`); }
  await page.close().catch(() => {});
}

async function auditIn(page: Page, path: string, locales: string[]) {
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 800 });
    for (const loc of locales) {
      await page.context().addCookies([{ name: "NEXT_LOCALE", value: loc, url: BASE }]);
      await page.goto(BASE + path, { waitUntil: "networkidle" }).catch(() => {});
      const res = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const over = document.documentElement.scrollWidth - vw;
        const bad: string[] = [];
        if (over > 0) {
          for (const el of Array.from(document.querySelectorAll("body *"))) {
            const r = el.getBoundingClientRect();
            if (r.width && (r.right > vw + 1 || r.left < -1)) {
              let p = el.parentElement, clipped = false;
              while (p) { const o = getComputedStyle(p).overflowX; if (o !== "visible") { clipped = true; break; } p = p.parentElement; }
              if (!clipped) bad.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 70)} [${Math.round(r.left)}..${Math.round(r.right)}]`);
            }
          }
        }
        return { over, bad: bad.slice(0, 6) };
      });
      if (res.over > 0) { failed++; console.log(`✗ ${path} @${w} ${loc}: +${res.over}px`, res.bad); }
      if (SHOTS && loc === locales[0]) await page.screenshot({ path: `${SHOTS}/${path.replace(/[^a-z0-9]+/gi, "_")}_${w}.png`, fullPage: true });
    }
  }
}

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  const page = await (await browser.newContext()).newPage();
  const locales = (process.env.LOCALES ?? "fr,ar").split(",");
  await page.goto(BASE + "/search", { waitUntil: "networkidle" });
  const trip = await page.locator('a[href^="/trips/"]').first().getAttribute("href").catch(() => null);
  const user = await page.locator('a[href^="/users/"]').first().getAttribute("href").catch(() => null);
  if (!process.env.AUTH_ONLY) for (const p of [...guest, ...(trip ? [trip] : []), ...(user ? [user] : [])]) await audit(page, p, locales);
  if (process.env.TEST_EMAIL) {
    await page.goto(BASE + "/auth/login", { waitUntil: "networkidle" });
    await page.fill("#email", process.env.TEST_EMAIL);
    await page.fill("#password", process.env.TEST_PASSWORD ?? "Test12345!");
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/dashboard/, { timeout: 20000 });
    for (const p of authed) await audit(page, p, locales);
  }
  await browser.close();
  console.log(failed ? `${failed} overflow issue(s)` : "no horizontal overflow");
  process.exit(failed ? 1 : 0);
}
main();
