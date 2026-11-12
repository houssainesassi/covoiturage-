// Real-account end-to-end run against the Supabase project in .env.local, through a local
// production build (npx next build && npx next start -p 3108).
// Without STAMP: signs up 2 test accounts (@example.com). With STAMP=<id>: logs in to
// waselni.test.{driver,passenger}.<id>@example.com. Publishes 1 trip and cancels it at the end.
//   E2E_PASSWORD=... STAMP=... [MIG18=1] node scripts/e2e/live-two-accounts.mjs
// MIG18=1: also require the driver's number for a PENDING booking (migrations 17 + 18 applied).
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE || 'http://localhost:3108';
const SHOTS = process.env.SHOTS || path.join(tmpdir(), 'waselni-e2e-');
const AVATAR = path.join(here, '../../public/icons/icon-512.png');
const stamp = process.env.STAMP || Date.now().toString(36);
const PASS = process.env.E2E_PASSWORD;
if (!PASS) { console.error('Set E2E_PASSWORD'); process.exit(2); }
const results = [];
const check = (name, ok, extra = '') => { results.push([ok ? 'PASS' : 'FAIL', name, extra]); console.log(ok ? '✓' : '✗', name, extra); };
const day = (n) => { const t = new Date(Date.now() + n * 864e5); return t.toISOString().slice(0, 10); };

async function newCtx(browser, w = 390) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 800 ? 844 : 900 } });
  await ctx.addCookies([{ name: 'NEXT_LOCALE', value: 'fr', url: BASE }]);
  const page = await ctx.newPage();
  page.errs = [];
  page.on('pageerror', (e) => page.errs.push(e.message));
  return { ctx, page };
}
const shot = (p, n) => p.screenshot({ path: SHOTS + n + '.png', fullPage: true });
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

async function signUp(page, name, email, phone) {
  if (process.env.STAMP) {
    await page.goto(BASE + '/auth/login');
    await page.fill('#email', email); await page.fill('#password', PASS);
    await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/auth/login'), { timeout: 30000 }), page.click('form button[type="submit"]')]);
    check(`login ${name}`, !page.url().includes('/auth/'));
    return;
  }
  await page.goto(BASE + '/auth/register');
  await page.fill('#fullName', name);
  await page.fill('#email', email);
  await page.fill('#phone', phone);
  await page.fill('#password', PASS);
  await page.check('input[name="terms"]');
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/auth/register'), { timeout: 30000 }), page.click('form button[type="submit"]')]);
  check(`sign-up ${name} → ${new URL(page.url()).pathname}`, /complete-profile|dashboard|\/$/.test(page.url()));
  if (page.url().includes('complete-profile')) {
    await page.setInputFiles('input[type="file"]', AVATAR);
    await page.waitForFunction(() => document.querySelector('input[name="avatarPath"]')?.value, null, { timeout: 30000 });
    if (!(await page.inputValue('#phone'))) await page.fill('#phone', phone);
    await Promise.all([page.waitForURL((u) => !u.pathname.includes('complete-profile'), { timeout: 30000 }), page.click('form button[type="submit"]')]);
    check(`complete profile ${name} → ${new URL(page.url()).pathname}`, !page.url().includes('complete-profile'));
  }
}

async function pickCity(page, id, text) {
  await page.fill(`#${id}`, text);
  await page.waitForSelector(`#${id} ~ ul [role="option"], [role="listbox"] [role="option"]`, { timeout: 10000 });
  await page.locator('[role="listbox"] [role="option"]').first().click();
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell' });
  const D = await newCtx(browser), P = await newCtx(browser), G = await newCtx(browser);
  let tripId = null;
  try {
    // --- accounts
    await signUp(D.page, 'Test Waselni Chauffeur', `waselni.test.driver.${stamp}@example.com`, '29' + String(Date.now()).slice(-6));
    await signUp(P.page, 'Test Waselni Passager', `waselni.test.passenger.${stamp}@example.com`, '52' + String(Date.now() + 7).slice(-6));

    // --- driver publishes
    const dp = D.page;
    await dp.goto(BASE + '/dashboard/trips/new');
    await pickCity(dp, 'origin-city', 'El Fahs');
    await pickCity(dp, 'destination-city', 'Tunis');
    await dp.fill('#date', day(25));
    await dp.fill('#time', '07:30');
    await dp.fill('#price', '7');
    if (await dp.locator('#vModel').count()) await dp.fill('#vModel', 'Test 301');
    await dp.waitForTimeout(2500); // OSRM route
    await Promise.all([dp.waitForURL(/\/dashboard\/trips\/[0-9a-f-]{36}/, { timeout: 40000 }), dp.getByRole('button', { name: 'Publier le trajet' }).click()]);
    tripId = dp.url().match(/trips\/([0-9a-f-]{36})/)[1];
    check('driver publishes a trip', !!tripId, tripId);

    // --- guest: trip visible, phone hidden, dashboard protected
    const gp = G.page;
    await gp.goto(BASE + `/trips/${tripId}`);
    check('guest sees the trip page', (await gp.locator('h1').innerText()).includes('Tunis'));
    check('guest does not see driver phone', (await gp.locator('a[href^="tel:"]').count()) === 0);
    await gp.goto(BASE + '/dashboard');
    check('guest /dashboard → login', gp.url().includes('/auth/login'));
    await gp.goto(BASE + '/search?from=el-fahs&to=tunis');
    check('trip appears in search', (await gp.locator(`a[href^="/trips/${tripId}"]`).count()) > 0);

    // --- passenger books
    const pp = P.page;
    await pp.goto(BASE + `/trips/${tripId}`);
    check('passenger: phone hidden before booking', (await pp.locator('a[href^="tel:"]').count()) === 0);
    await pp.getByRole('button', { name: 'Réserver ma place' }).click();
    const modal = pp.locator('[data-testid="booking-confirmed-modal"]');
    await modal.waitFor({ timeout: 20000 });
    check('booking popup shown', true, (await pp.locator('[data-testid="booking-pending-note"]').count()) ? 'pending note' : '');
    const popupPhone = await pp.locator('[data-testid="booking-confirmed-call"]').count();
    const MIG18 = process.env.MIG18 === '1';
    check(MIG18 ? 'popup: driver phone shown while PENDING' : 'popup: driver phone while pending (needs migration 18, not live)', MIG18 ? popupPhone > 0 : true, popupPhone ? 'shown' : 'not shown');
    await shot(pp, 'passenger-popup-m');
    await pp.keyboard.press('Escape');
    if (MIG18) {
      await pp.reload();
      check('trip page: driver phone while PENDING', (await pp.locator('a[href^="tel:"]').count()) > 0);
      await pp.goto(BASE + '/dashboard/bookings');
      check('my bookings: status pending', (await pp.getByText('En attente').count()) > 0);
      check('my bookings: driver phone while PENDING', (await pp.locator('a[href^="tel:"]').count()) > 0);
      await shot(pp, 'passenger-bookings-pending-m');
      await gp.goto(BASE + `/trips/${tripId}`);
      check('guest still sees no phone (after 17+18)', (await gp.locator('a[href^="tel:"]').count()) === 0);
    }

    // --- driver: notification + pending request on dashboard, accept
    await dp.goto(BASE + '/dashboard/notifications');
    check('driver gets a booking notification', (await dp.locator('main').innerText()).length > 0 && (await dp.locator('main li, main article').count()) > 0);
    await dp.goto(BASE + '/dashboard');
    await shot(dp, 'driver-dashboard-m');
    check('dashboard overflow (driver, phone)', !(await overflow(dp)));
    await dp.goto(BASE + `/dashboard/trips/${tripId}`);
    await dp.getByRole('button', { name: 'Accepter' }).first().click();
    await dp.waitForTimeout(3000);
    await dp.reload();
    check('driver accepts the request', (await dp.getByRole('button', { name: 'Accepter' }).count()) === 0);
    await shot(dp, 'driver-trip-m');

    // --- passenger: confirmed + phone
    await pp.goto(BASE + '/dashboard/bookings');
    const conf = await pp.getByText('Confirmée').first().waitFor({ timeout: 10000 }).then(() => true, () => false);
    if (!conf) await shot(pp, 'fail-bookings');
    check('passenger booking is confirmed', conf);
    check('passenger sees driver phone after confirmation', (await pp.locator('a[href^="tel:"]').count()) > 0);
    await shot(pp, 'passenger-bookings-m');
    await pp.goto(BASE + '/dashboard');
    await shot(pp, 'passenger-dashboard-m');

    // --- messaging
    await pp.goto(BASE + `/trips/${tripId}`);
    await Promise.all([pp.waitForURL(/\/dashboard\/messages\/[0-9a-f-]{36}/, { timeout: 20000 }), pp.getByRole('button', { name: 'Écrire au conducteur' }).first().click()]);
    const msg = `Bonjour, test ${stamp}`;
    await pp.fill('textarea[placeholder^="Écrivez"]', msg);
    await pp.locator('textarea[placeholder^="Écrivez"]').locator('xpath=ancestor::form').locator('button[type="submit"]').click();
    const sent = await pp.getByText(msg).filter({ visible: true }).first().waitFor({ timeout: 10000 }).then(() => true, () => false);
    if (!sent) await shot(pp, 'fail-chat');
    check('passenger sends a message (visible to sender)', sent);
    await dp.goto(BASE + '/dashboard/messages');
    await dp.locator('a[href^="/dashboard/messages/"]').first().click();
    await dp.waitForURL(/\/dashboard\/messages\/[0-9a-f-]{36}/);
    await dp.waitForTimeout(1500);
    check('driver receives the message', (await dp.locator('main').innerText()).includes(msg));

    // --- permissions
    await pp.goto(BASE + '/admin');
    check('non-admin /admin → redirected', !new URL(pp.url()).pathname.startsWith('/admin'), new URL(pp.url()).pathname);
    const r = await pp.goto(BASE + `/dashboard/trips/${tripId}`);
    check("passenger cannot manage the driver's trip", r.status() === 404 || !pp.url().includes(tripId) || (await pp.getByRole('button', { name: 'Accepter' }).count()) === 0 && (await pp.getByRole('button', { name: 'Annuler le trajet' }).count()) === 0, String(r.status()));

    // --- desktop + arabic dashboards
    for (const [c, n] of [[D, 'driver'], [P, 'passenger']]) {
      await c.page.setViewportSize({ width: 1440, height: 900 });
      await c.page.goto(BASE + '/dashboard'); await shot(c.page, `${n}-dashboard-d`);
    }
    await D.ctx.addCookies([{ name: 'NEXT_LOCALE', value: 'ar', url: BASE }]);
    await dp.setViewportSize({ width: 390, height: 844 });
    for (const path of ['/dashboard', '/dashboard/trips', `/dashboard/trips/${tripId}`, '/dashboard/messages', '/dashboard/profile', '/dashboard/settings', '/dashboard/vehicles', '/dashboard/earnings', '/dashboard/notifications', '/dashboard/reviews']) {
      await dp.goto(BASE + path);
      check(`ar ${path}: no overflow, RTL`, !(await overflow(dp)) && (await dp.getAttribute('html', 'dir')) === 'rtl');
    }
    await dp.goto(BASE + '/dashboard'); await shot(dp, 'driver-dashboard-ar-m');
    await D.ctx.addCookies([{ name: 'NEXT_LOCALE', value: 'fr', url: BASE }]);
  } catch (e) {
    check('run aborted', false, e.message.split('\n')[0]);
    await shot(D.page, 'fail-driver'); await shot(P.page, 'fail-passenger');
  } finally {
    // --- cleanup: cancel the trip so it never shows in public search
    if (tripId) {
      try {
        const dp = D.page;
        await dp.setViewportSize({ width: 1440, height: 900 });
        await dp.goto(BASE + `/dashboard/trips/${tripId}`);
        await dp.getByRole('button', { name: 'Annuler le trajet' }).first().click();
        const dlg = dp.locator('dialog[open]');
        await dlg.waitFor();
        const ta = dlg.locator('textarea'); if (await ta.count()) await ta.fill('Test automatique');
        await dlg.getByRole('button', { name: 'Annuler le trajet' }).click();
        await dp.waitForTimeout(3000);
        await G.page.goto(BASE + '/search?from=el-fahs&to=tunis');
        check('cleanup: trip cancelled and gone from search', (await G.page.locator(`a[href^="/trips/${tripId}"]`).count()) === 0);
        await P.page.goto(BASE + '/dashboard/notifications');
        check('passenger notified of cancellation', /annul/i.test(await P.page.locator('main').innerText()));
      } catch (e) { check('cleanup', false, e.message.split('\n')[0]); }
    }
    for (const c of [D, P, G]) if (c.page.errs.length) check('JS errors', false, c.page.errs.join(' | '));
    console.log(`\n${results.filter((r) => r[0] === 'PASS').length}/${results.length} passed; accounts: waselni.test.*.${stamp}@example.com; trip ${tripId}`);
    await browser.close();
  }
})();
