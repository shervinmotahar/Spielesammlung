// Go – Offline-Betrieb: App-Dateien werden zwischengespeichert. Bei jedem Start wird im Hintergrund
// nach neuen Versionen gesucht (beim nächsten Öffnen aktiv). Nach Änderungen VERSION erhöhen.
const VERSION = 'go-1';
const FILES = ['./', 'index.html', 'app.js', 'go.js', 'worker.js', 'manifest.webmanifest',
               'icon-192.png', 'icon-512.png', 'icon-maskable.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(caches.open(VERSION).then(async cache => {
    const cached = await cache.match(req, { ignoreSearch: true });
    const fresh = fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    if (cached) return cached;          // sofort aus dem Speicher, Aktualisierung läuft nebenher
    const res = await fresh;
    return res || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }));
});
