// Schach – Offline-Betrieb. Mit Netz werden die Dateien immer frisch geholt (neue Versionen sind sofort da),
// ohne Netz (oder nach 3 s ohne Antwort) kommen sie aus dem Zwischenspeicher. Nach Änderungen VERSION erhöhen.
const VERSION = 'schach-4';
const FILES = ['./', 'index.html', 'app.js', 'engine.js', 'worker.js', 'manifest.webmanifest',
               'icon-192.png', 'icon-512.png', 'icon-maskable.png'];

self.addEventListener('install', e => {
  // cache: 'reload' – am Browser-Zwischenspeicher vorbei, sonst landet nach einem Update evtl. noch die alte Datei hier
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    // nur eigene alte Speicher loeschen - alle Spiele liegen auf derselben Adresse und teilen sich den Speicher
    .then(keys => Promise.all(keys.filter(k => k !== VERSION && k.split('-')[0] === VERSION.split('-')[0]).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      // 'no-cache': beim Server nachfragen (GitHub Pages hält Dateien sonst 10 Minuten im Browser-Speicher)
      const res = await Promise.race([
        fetch(req, { cache: 'no-cache' }),
        new Promise((_, fail) => setTimeout(() => fail(new Error('Zeitüberschreitung')), 3000))]);
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    } catch (err) {
      const cached = await cache.match(req, { ignoreSearch: true });
      return cached || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
