/* Church Offering System — service worker (GitHub Pages, works under any repository subpath).
   - Caches ONLY the app's own static files (index.html, manifest, icons) so the installed app reopens offline.
   - Never touches IndexedDB, offering data, Google sign-in, Google Drive API calls, or any non-GET request.
   - index.html is fetched network-first (revalidated), so a new deployment is picked up on the next open
     while online; the cached copy is only used when the network is unavailable or very slow.
   - To publish an updated service worker/precache list, change VERSION below. */
'use strict';

const VERSION = 'v4';
const SHELL_CACHE = 'church-offerings-shell-' + VERSION;
const LOGO_CACHE = 'church-offerings-logo-v1';          /* written by the page; kept across versions */
const SCOPE = new URL(self.registration.scope);          /* e.g. https://USER.github.io/offering/ */
const ROOT_URL = SCOPE.href;
const INDEX_URL = new URL('index.html', SCOPE).href;
const OPTIONAL = ['manifest.json', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'Terms.html', 'Policy.html',
  'finance.html', 'members.html', 'backup-kit.js', 'lib/sweetalert2.all.min.js', 'lib/jspdf.umd.min.js', 'lib/jspdf.plugin.autotable.min.js', 'lib/fa/css/all.min.css',
  'lib/fa/webfonts/fa-solid-900.woff2', 'lib/fa/webfonts/fa-regular-400.woff2', 'lib/fa/webfonts/fa-brands-400.woff2']
  .map(function (p) { return new URL(p, SCOPE).href; });
const NAV_TIMEOUT_MS = 5000;

const OFFLINE_PAGE = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1"><title>Church Offering System</title>' +
  '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;background:#f8fafc;color:#0f172a;text-align:center;padding:24px}' +
  'main{max-width:340px}p{font-size:16px;line-height:1.5}button{font-size:16px;padding:12px 26px;border:0;border-radius:10px;background:#1a73e8;color:#fff;cursor:pointer}</style></head>' +
  '<body><main><p id="m">No internet connection. Please connect to the internet and try again.</p><button id="b" type="button">Try Again</button></main>' +
  '<script>document.getElementById("b").onclick=function(){location.reload()};' +
  'window.addEventListener("online",function(){document.getElementById("m").textContent="Internet connection restored. Tap Try Again to continue."});<\/script></body></html>';

self.addEventListener('install', function (event) {
  event.waitUntil((async function () {
    const cache = await caches.open(SHELL_CACHE);
    const res = await fetch(INDEX_URL, { cache: 'reload' });           /* required: the app itself */
    if (!res.ok) throw new Error('index.html could not be cached');
    await cache.put(INDEX_URL, res.clone());
    await cache.put(ROOT_URL, res.clone());
    await Promise.all(OPTIONAL.map(function (u) {                      /* optional: a missing icon must not break install */
      return fetch(u, { cache: 'reload' }).then(function (r) { if (r.ok) return cache.put(u, r); }).catch(function () {});
    }));
  })());
});

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    const keys = await caches.keys();
    await Promise.all(keys.filter(function (k) { return k.indexOf('church-offerings-shell-') === 0 && k !== SHELL_CACHE; })
      .map(function (k) { return caches.delete(k); }));              /* drop outdated shells only */
    await self.clients.claim();
  })());
});

function timeout(ms) { return new Promise(function (r) { setTimeout(function () { r(null); }, ms); }); }

async function handleNavigation(req) {
  const cache = await caches.open(SHELL_CACHE);
  const url = new URL(req.url);
  const isShell = url.pathname === SCOPE.pathname || url.pathname === new URL(INDEX_URL).pathname;
  const cached = await cache.match(isShell ? INDEX_URL : req.url);     /* the app for app navigations; the page itself for Terms/Policy */
  const network = fetch(req.url, { cache: 'no-cache' }).then(function (res) {
    if (res.ok && res.type === 'basic' && !res.redirected) {
      if (isShell) { cache.put(INDEX_URL, res.clone()); cache.put(ROOT_URL, res.clone()); }
      else if (url.search === '') cache.put(req.url, res.clone());
    }
    return res;
  });
  try {
    const res = cached ? await Promise.race([network, timeout(NAV_TIMEOUT_MS)]) : await network;
    if (res) return res;
  } catch (e) { /* offline or DNS failure */ }
  network.catch(function () {});                                       /* late rejection after timeout is harmless */
  if (cached) return cached;
  return new Response(OFFLINE_PAGE, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match(req);
  const refresh = fetch(req).then(function (res) {
    if (res.ok && res.type === 'basic') cache.put(req, res.clone());
    return res;
  });
  if (hit) { refresh.catch(function () {}); return hit; }
  return refresh;
}

self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET') return;                                    /* never touch writes */
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') { event.respondWith(handleNavigation(req)); return; }
    if (url.pathname.indexOf(SCOPE.pathname) === 0 && !/service-worker\.js$/.test(url.pathname)) event.respondWith(staleWhileRevalidate(req));
    return;
  }
  /* Cross-origin: only the displayed logo image (stored by the page). Google sign-in, Drive API and everything else go straight to the network. */
  if (req.destination === 'image') {
    event.respondWith(caches.open(LOGO_CACHE).then(function (c) { return c.match(req); }).then(function (hit) { return hit || fetch(req); }));
  }
});
