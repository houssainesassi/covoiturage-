/**
 * Browser test of the "booking confirmed" popup, with no real Supabase project: a small fake
 * Supabase server (auth, the PostgREST tables and RPCs the ride page uses) holds one ride, one
 * driver and one signed-in passenger. The real app runs against it with `next dev`.
 *
 *   CHROME_PATH=~/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome npx tsx scripts/e2e/booking-confirmed.ts [screenshotDir]
 *
 * Next allows one `next dev` per folder. If yours is running, set APP_DIR to a copy of the project
 * (src, public, configs, and a symlink to node_modules); .env.local is not needed there.
 *
 * Covers: instant confirmation (auto-accept) shows the popup with the exact texts; the call button
 * dials the driver's number; the in-app button opens the conversation; the popup appears once per
 * booking; a pending request shows no popup and no number until the driver accepts; a driver
 * without a number; the driver card shows the number once confirmed; the phone layout.
 * Booking rules themselves (auto-accept, seats, permissions) are covered by `npm run test:db`.
 */
import { createServer, type IncomingMessage } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright-core";

const FAKE_PORT = 54329;
const APP_PORT = 3457;
const FAKE_URL = `http://127.0.0.1:${FAKE_PORT}`;
const BASE = `http://127.0.0.1:${APP_PORT}`;
const shots = process.argv[2];

const TRIP = "11111111-1111-4111-8111-111111111111";
const DRIVER = "22222222-2222-4222-8222-222222222222";
const PASSENGER = "33333333-3333-4333-8333-333333333333";
const BOOKING = "44444444-4444-4444-8444-444444444444";
const CONVERSATION = "55555555-5555-4555-8555-555555555555";
const FROM = "66666666-6666-4666-8666-666666666666";
const TO = "77777777-7777-4777-8777-777777777777";
const PHONE = "+21622123456";

let failed = 0;
let appLog = "";
const ok = (name: string, cond: boolean, detail?: unknown) => {
  console.log(`${cond ? "  ✓" : "  ✗"} ${name}`, cond ? "" : detail ?? "");
  if (!cond) failed++;
};

// --- fake Supabase ---------------------------------------------------------------------------

const state = {
  autoAccept: true,
  driverPhone: PHONE as string | null,
  booking: null as null | { id: string; status: "pending" | "confirmed"; seats: number; total_price: number },
  calls: [] as { fn: string; body: unknown }[],
};

const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const location = (id: string, slug: string, fr: string, ar: string, lat: number, lng: number) => ({
  id, slug, governorate_code: "TN", name_fr: fr, name_ar: ar, name_en: fr, kind: "city", is_capital: false, lat, lng, popularity: 1, created_at: iso(now),
});
const LOCATIONS = [location(FROM, "el-fahs", "El Fahs", "الفحص", 36.37, 9.9), location(TO, "tunis", "Tunis", "تونس", 36.8, 10.18)];
const trip = () => ({
  id: TRIP, driver_id: DRIVER, vehicle_id: null, origin_id: FROM, destination_id: TO,
  origin_address: "Place de la gare", destination_address: "Bab Saadoun",
  origin_lat: 36.37, origin_lng: 9.9, destination_lat: 36.8, destination_lng: 10.18,
  departure_at: iso(now + 2 * 86400_000), seats_total: 4, seats_available: state.booking ? 3 : 4, price_per_seat: 7,
  distance_km: 60, duration_min: 55, auto_accept: state.autoAccept, luggage_size: "medium", description: null,
  status: "scheduled", cancellation_reason: null, cancelled_at: null, completed_at: null, reminder_sent_at: null,
  is_demo: false, created_at: iso(now), updated_at: iso(now),
  driver: { id: DRIVER, full_name: "Sami Ben Ali", avatar_path: null, rating_avg: 4.8, rating_count: 12, trips_driven: 30, bio: null, created_at: iso(now), pref_smoking: false, pref_pets: false, pref_music: true, pref_chatty: true, status: "active" },
  vehicle: null,
});
const passengerProfile = { id: PASSENGER, full_name: "Test Passenger", avatar_path: null, role: "user", status: "active", rating_avg: 0, rating_count: 0, trips_driven: 0, created_at: iso(now) };
const user = { id: PASSENGER, aud: "authenticated", role: "authenticated", email: "passenger@example.test", app_metadata: { provider: "email" }, user_metadata: {}, created_at: iso(now) };

const b64url = (s: string) => Buffer.from(s).toString("base64url");
const jwt = `${b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64url(JSON.stringify({ sub: PASSENGER, role: "authenticated", aud: "authenticated", exp: Math.floor(now / 1000) + 86400 }))}.sig`;
const session = { access_token: jwt, token_type: "bearer", expires_in: 86400, expires_at: Math.floor(now / 1000) + 86400, refresh_token: "fake-refresh", user };

const readBody = (req: IncomingMessage) => new Promise<string>((r) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => r(b)); });

const fake = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", FAKE_URL);
  const body = await readBody(req);
  const send = (status: number, data: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", ...headers });
    res.end(data === undefined ? "" : JSON.stringify(data));
  };
  const p = url.pathname;
  if (req.method === "OPTIONS") return send(204, undefined, { "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" });
  if (p === "/auth/v1/user") return req.headers.authorization?.includes(jwt) ? send(200, user) : send(401, { message: "invalid token" });
  if (p === "/auth/v1/token") return send(200, session);
  if (p.startsWith("/rest/v1/rpc/")) {
    const fn = p.slice("/rest/v1/rpc/".length);
    const args = body ? JSON.parse(body) : {};
    state.calls.push({ fn, body: args });
    switch (fn) {
      case "request_booking":
        state.booking = { id: BOOKING, status: state.autoAccept ? "confirmed" : "pending", seats: args.p_seats, total_price: 7 * args.p_seats };
        return send(200, BOOKING);
      case "get_trip_contacts":
        // Confirmed passengers get the driver's contact (migration 9); nobody else does.
        return send(200, state.booking?.status === "confirmed" ? [{ user_id: DRIVER, full_name: "Sami Ben Ali", phone: state.driverPhone, role: "driver", plate_number: "123 TU 4567" }] : []);
      case "start_conversation":
        return send(200, CONVERSATION);
      case "my_profile_complete":
        return send(200, true);
      case "unread_message_count":
        return send(200, 0);
      default:
        return send(200, []);
    }
  }
  if (p.startsWith("/rest/v1/")) {
    const table = p.slice("/rest/v1/".length);
    const rows: unknown[] =
      table === "trips" ? [trip()]
      : table === "locations" ? LOCATIONS
      : table === "bookings" ? (state.booking ? [state.booking] : [])
      : table === "profiles" ? [passengerProfile]
      : [];
    const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
    if (single) return rows.length ? send(200, rows[0]) : send(406, { code: "PGRST116", details: "The result contains 0 rows", hint: null, message: "JSON object requested, multiple (or no) rows returned" });
    return send(200, req.method === "HEAD" ? undefined : rows, { "Content-Range": `0-${Math.max(rows.length - 1, 0)}/${rows.length}` });
  }
  send(404, { message: "not faked" });
});

// --- helpers -----------------------------------------------------------------------------------

async function signedIn(ctx: BrowserContext) {
  await ctx.addCookies([{ name: "sb-127-auth-token", value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`, url: BASE }]);
}

const modal = (page: Page) => page.getByTestId("booking-confirmed-modal");
const cardPhone = (page: Page) => page.locator(`aside a[href="tel:${PHONE}"]`).first();
async function shot(page: Page, name: string) {
  if (!shots) return;
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: false });
}
async function book(page: Page) {
  await page.locator("#book form button[type=submit]").click();
}
function reset(o: Partial<typeof state>) {
  state.booking = null;
  state.calls = [];
  state.autoAccept = true;
  state.driverPhone = PHONE;
  Object.assign(state, o);
}

async function waitForApp(app: ChildProcess) {
  for (let i = 0; i < 240; i++) {
    if (app.exitCode !== null) throw new Error("next dev exited");
    try {
      const r = await fetch(`${BASE}/trips/${TRIP}`);
      if (r.status < 500) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("next dev did not start");
}

// --- run -------------------------------------------------------------------------------------------

async function main() {
  await new Promise<void>((r) => fake.listen(FAKE_PORT, "127.0.0.1", r));
  // APP_DIR: run from a copy of the project when another `next dev` already uses this folder.
  const app = spawn("npx", ["next", "dev", "-p", String(APP_PORT), "-H", "127.0.0.1"], {
    cwd: process.env.APP_DIR || process.cwd(),
    env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: FAKE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fake-publishable-key", SUPABASE_SECRET_KEY: "", NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  app.stdout?.on("data", (c) => (appLog += c));
  app.stderr?.on("data", (c) => (appLog += c));
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  try {
    await waitForApp(app);

    console.log("Instant confirmation (ride accepts bookings automatically)");
    reset({ autoAccept: true });
    let ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await signedIn(ctx);
    let page = await ctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${BASE}/trips/${TRIP}`);
    ok("signed-in passenger sees the booking form", await page.locator("#book form button[type=submit]").isVisible());
    ok("no driver number before booking", (await cardPhone(page).count()) === 0);
    ok("no popup before booking", (await modal(page).count()) === 0 || !(await modal(page).isVisible()));
    await book(page);
    await modal(page).waitFor({ state: "visible", timeout: 20_000 });
    ok("request_booking was called", state.calls.some((c) => c.fn === "request_booking"));
    ok("popup appears after the booking is confirmed", await modal(page).isVisible());
    const dialogText = (await page.locator("dialog[open]").innerText()).replace(/\s+/g, " ");
    ok("title: تمّ الحجز بنجاح! 🎉", dialogText.includes("تمّ الحجز بنجاح! 🎉"), dialogText);
    ok("question asked in Derja", dialogText.includes("تحب تتواصل مع صاحب العرض بالتليفون ولا تكمّل من داخل التطبيق؟"), dialogText);
    const call = page.getByTestId("booking-confirmed-call");
    ok("call button: 📞 اتصل بيه", (await call.innerText()).includes("📞 اتصل بيه"));
    ok("call button dials the driver's number", (await call.getAttribute("href")) === `tel:${PHONE}`, await call.getAttribute("href"));
    ok("in-app button: 💬 داخل التطبيق", await page.locator("dialog[open]").getByRole("button", { name: "💬 داخل التطبيق" }).isVisible());
    ok("driver card shows the number once confirmed", await cardPhone(page).isVisible());
    await shot(page, "desktop-popup");
    // A tel: link opens the phone app; here only check that tapping it leaves the page usable.
    await page.evaluate(() => document.querySelector<HTMLAnchorElement>('[data-testid="booking-confirmed-call"]')?.addEventListener("click", (e) => e.preventDefault(), { once: true }));
    await call.click();
    ok("tapping call closes the popup", !(await modal(page).isVisible()));
    await page.reload();
    await page.waitForTimeout(1500);
    ok("popup is not shown again for the same booking", !(await modal(page).isVisible()));
    ok("driver card still shows the number", await cardPhone(page).isVisible());

    console.log("In-app button opens the conversation");
    await page.evaluate((id) => localStorage.removeItem(`wasalni.bookingConfirmedSeen.${id}`), BOOKING);
    await page.reload();
    await modal(page).waitFor({ state: "visible", timeout: 10_000 });
    state.calls = [];
    await page.locator("dialog[open]").getByRole("button", { name: "💬 داخل التطبيق" }).click();
    await page.waitForURL(`**/dashboard/messages/${CONVERSATION}`, { timeout: 20_000 }).catch(() => {});
    const conv = state.calls.find((c) => c.fn === "start_conversation");
    ok("start_conversation called for this ride", !!conv && (conv.body as { p_trip_id: string }).p_trip_id === TRIP, conv);
    ok("navigates to the conversation", page.url().includes(`/dashboard/messages/${CONVERSATION}`), page.url());
    await page.goto(`${BASE}/trips/${TRIP}`);
    await page.waitForTimeout(1500);
    ok("back on the ride, the popup doesn't come back", !(await modal(page).isVisible()));
    ok("no page errors", errors.length === 0, errors);
    await ctx.close();

    console.log("Request that needs the driver's approval");
    reset({ autoAccept: false });
    ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await signedIn(ctx);
    page = await ctx.newPage();
    await page.goto(`${BASE}/trips/${TRIP}`);
    await book(page);
    await page.waitForFunction(() => document.querySelector("#book")?.textContent?.includes("الطلب متاعك تبعث"), null, { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(1000);
    ok("pending: the 'request sent' message shows", (await page.locator("#book").innerText()).includes("الطلب متاعك تبعث"));
    ok("pending: no popup", !(await modal(page).isVisible()));
    ok("pending: driver number stays hidden", (await cardPhone(page).count()) === 0);
    state.booking!.status = "confirmed"; // the driver accepts
    await page.reload();
    await modal(page).waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
    ok("after the driver accepts: popup on the next visit", await modal(page).isVisible());
    ok("after the driver accepts: number in the card", await cardPhone(page).isVisible());
    await ctx.close();

    console.log("Driver without a number");
    reset({ autoAccept: true, driverPhone: null });
    ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await signedIn(ctx);
    page = await ctx.newPage();
    await page.goto(`${BASE}/trips/${TRIP}`);
    await book(page);
    await modal(page).waitFor({ state: "visible", timeout: 20_000 });
    ok("no call link without a number", (await page.locator('dialog[open] a[href^="tel:"]').count()) === 0);
    ok("says to send a message instead", (await page.locator("dialog[open]").innerText()).includes("ابعثلو ميساج"));
    ok("in-app button still offered", await page.locator("dialog[open]").getByRole("button", { name: "💬 داخل التطبيق" }).isVisible());
    await ctx.close();

    console.log("Phone layout");
    reset({ autoAccept: true });
    ctx = await browser.newContext({ viewport: { width: 375, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await signedIn(ctx);
    page = await ctx.newPage();
    await page.goto(`${BASE}/trips/${TRIP}`);
    await book(page);
    await modal(page).waitFor({ state: "visible", timeout: 20_000 });
    const box = await page.locator("dialog[open]").boundingBox();
    ok("popup fits the screen width", !!box && box.x >= 0 && box.x + box.width <= 375, box);
    ok("popup fits the screen height", !!box && box.y >= 0 && box.y + box.height <= 740, box);
    const [b1, b2] = [await page.getByTestId("booking-confirmed-call").boundingBox(), await page.locator("dialog[open]").getByRole("button", { name: "💬 داخل التطبيق" }).boundingBox()];
    ok("buttons are stacked and easy to tap", !!b1 && !!b2 && b2.y >= b1.y + b1.height - 1 && b1.height >= 44 && b2.height >= 44, { b1, b2 });
    ok("no horizontal scroll", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await shot(page, "phone-popup");
    await ctx.close();
  } finally {
    await browser.close();
    app.kill("SIGTERM");
    fake.close();
    if (failed) console.log(appLog.split("\n").filter((l) => /error|warn/i.test(l)).slice(-20).join("\n"));
  }
  console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  console.error(appLog.split("\n").slice(-40).join("\n"));
  process.exit(1);
});
