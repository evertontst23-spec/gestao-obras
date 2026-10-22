// Service worker: app instalável + tolerância a sinal fraco no canteiro.
// Estratégia: arquivos estáticos em cache; páginas pela rede com fallback do cache/offline.
// (Fila de operações offline está prevista para uma etapa futura.)
const VERSAO = 'obras-v2';
const ESTATICOS = ['/offline', '/icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ESTATICOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;           // Supabase e APIs: sempre rede
  if (url.pathname.startsWith('/_next/static/')) {
    e.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => { const c = res.clone(); caches.open(VERSAO).then((k) => k.put(req, c)); return res; })));
    return;
  }
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then((res) => { const c = res.clone(); caches.open(VERSAO).then((k) => k.put(req, c)); return res; })
        .catch(() => caches.match(req).then((r) => r || caches.match('/offline')))
    );
  }
});
