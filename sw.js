// Kopia plików do pracy offline. Aktualizacje przychodzą same (patrz fetch niżej) — wersję
// zmieniaj tylko przy zmianie listy FILES, żeby usunąć stare pliki z pamięci telefonu.
const CACHE = 'kasa-v3';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'manifest.json', 'icon-180.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Najpierw sieć (żeby łapać aktualizacje), a bez internetu — kopia z pamięci.
self.addEventListener('fetch', e => {
  // Kursy NBP i notowania zawsze z sieci — tylko pliki aplikacji idą do pamięci podręcznej.
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    // no-cache: zawsze pytamy serwer o nowszą wersję (GitHub Pages pozwala trzymać pliki 10 minut).
    fetch(e.request, { cache: 'no-cache' })
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
