// Wasalni service worker — makes the site installable.
// Pages are never cached (they depend on the signed-in user); when the network
// is down, navigations get a small offline page instead of the browser error.
const OFFLINE_HTML = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Wasalni</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:#fbfaf7;color:#0f172a;text-align:center;padding:24px}h1{color:#1a7e68;font-size:1.4rem}button{margin-top:16px;background:#1a7e68;color:#fff;border:0;border-radius:12px;padding:12px 20px;font-size:1rem}</style></head><body><div><h1>ما فماش connexion</h1><p>Pas de connexion internet.</p><button onclick="location.reload()">↻</button></div></body></html>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(
      () => new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } }),
    ),
  );
});
