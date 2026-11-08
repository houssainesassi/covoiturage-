/**
 * Browser smoke tests against a running server (guest flows; no accounts are created).
 *   BASE_URL=http://127.0.0.1:3456 CHROME_PATH=... npx tsx scripts/e2e/smoke.ts [screenshotDir]
 */
import { chromium, type Page } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const shots = process.argv[2];
let failed = 0;
const ok = (name: string, cond: boolean, detail?: unknown) => {
  console.log(`${cond ? "  ✓" : "  ✗"} ${name}`, cond ? "" : detail ?? "");
  if (!cond) failed++;
};

async function noHorizontalScroll(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  const ctx = await browser.newContext({ locale: "fr-FR" });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource|_vercel\/insights/.test(m.text()) && errors.push(m.text()));

  console.log("Home & search");
  await page.goto(BASE + "/");
  ok("home opens on the ride offers", await page.locator("h1").first().isVisible());
  await page.fill("#search-from", "fahs");
  await page.locator('[role="option"]').first().click();
  await page.fill("#search-to", "tunis");
  await page.locator('[role="option"]', { hasText: /^Tunis/ }).first().click();
  await page.locator('form[role="search"] button[type="submit"]').click();
  await page.waitForURL(/\/search\?/);
  ok("search form navigates with slugs", /from=el-fahs/.test(page.url()) && /to=tunis/.test(page.url()), page.url());
  ok("search results heading shows route", (await page.locator("h1").innerText()).includes("El Fahs"));
  await page.selectOption("#f-sort", "price");
  await page.waitForURL(/sort=price/);
  ok("sort filter updates URL", page.url().includes("sort=price"));
  await page.selectOption("#f-time", "morning");
  await page.waitForURL(/time=morning/);
  ok("time filter updates URL", page.url().includes("time=morning"));
  ok("empty state offers alternatives", await page.getByText(/Aucun trajet ne correspond|trouvé/).first().isVisible());
  if (shots) await page.screenshot({ path: `${shots}/search-fr.png`, fullPage: true });

  console.log("Accent/Arabic-insensitive city search");
  await page.goto(BASE + "/search");
  await page.fill("#search-from", "قابس");
  ok("Arabic query finds Gabès", await page.locator('[role="option"]', { hasText: "Gabès" }).first().waitFor({ timeout: 5000 }).then(() => true, () => false));
  await page.fill("#search-from", "medenine");
  ok("accent-free query finds Médenine", await page.locator('[role="option"]', { hasText: "Médenine" }).first().waitFor({ timeout: 5000 }).then(() => true, () => false));

  console.log("Auth guards & forms");
  await page.goto(BASE + "/dashboard/trips/new");
  ok("publishing requires login (redirect)", page.url().includes("/auth/login?next=%2Fdashboard%2Ftrips%2Fnew"));
  ok("login explains why", await page.getByText(/Veuillez vous connecter/).isVisible());
  await page.fill("#email", "nobody-wasalni-test@example.com");
  await page.fill("#password", "wrong-password-123");
  await page.locator('button[type="submit"]').click();
  const alert = page.locator('form [role="alert"]');
  await alert.waitFor({ timeout: 15000 });
  ok("wrong credentials show translated error", (await alert.innerText()).includes("incorrect"), await alert.innerText());
  ok("email kept after failed login", (await page.inputValue("#email")) === "nobody-wasalni-test@example.com");

  await page.goto(BASE + "/auth/register");
  await page.fill("#fullName", "Test");
  await page.fill("#email", "test@example.com");
  await page.fill("#password", "abcdef123");
  await page.fill("#confirm", "abcdef999");
  await page.check('input[name="terms"]');
  await page.locator('button[type="submit"]').click();
  await page.getByText("Les mots de passe ne correspondent pas.").first().waitFor({ timeout: 15000 });
  ok("register validates password confirmation server-side", true);
  ok("register keeps typed values after error", (await page.inputValue("#fullName")) === "Test");
  await page.fill("#confirm", "abcdef123");
  await page.fill("#phone", "12345");
  await page.locator('button[type="submit"]').click();
  await page.getByText(/numéro de téléphone tunisien valide/).first().waitFor({ timeout: 15000 });
  ok("register rejects invalid Tunisian phone", true);

  console.log("Languages & RTL");
  await page.goto(BASE + "/");
  await page.locator("header select").first().selectOption("ar");
  await page.waitForFunction(() => document.documentElement.dir === "rtl");
  ok("switching to Arabic sets dir=rtl", (await page.evaluate(() => document.documentElement.lang)) === "ar");
  ok("Arabic offers heading", (await page.locator("h1").first().innerText()).includes("رحلات"));
  if (shots) await page.screenshot({ path: `${shots}/home-ar.png`, fullPage: false });
  await page.locator("header select").first().selectOption("en");
  await page.waitForFunction(() => document.documentElement.lang === "en");
  ok("switching to English", (await page.locator("h1").first().innerText()).includes("Recently published"));

  console.log("Mobile layout (390px)");
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, locale: "fr-FR" });
  const m = await mobile.newPage();
  for (const p of ["/", "/search?from=el-fahs", "/auth/login", "/auth/register", "/help"]) {
    await m.goto(BASE + p);
    ok(`no horizontal scroll on ${p}`, await noHorizontalScroll(m));
  }
  await m.goto(BASE + "/");
  await m.getByRole("button", { name: "Menu" }).click();
  ok("mobile menu opens", await m.getByRole("link", { name: "Trouver un trajet" }).first().isVisible());
  if (shots) await m.screenshot({ path: `${shots}/home-mobile.png`, fullPage: true });
  await mobile.close();

  ok("no client-side errors", errors.length === 0, errors);
  await browser.close();
  console.log(failed ? `\n${failed} failed` : "\nAll browser checks passed");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
