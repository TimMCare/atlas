// Atlas v5 — service worker : ouverture instantanée et fonctionnement hors réseau.
// Portée : le dossier /atlas/v5/ uniquement (la v4 n'est pas concernée).
// Les données métier ne passent pas ici : elles sont gardées par l'application (IndexedDB).
const VERSION = 'atlas5-2026-11-14b';
const SHELL = ['./', 'index.html', 'manifest.json', 'icon.svg', 'finess.json',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js'];
const TILES = 'atlas5-tuiles', MAX_TILES = 2500;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('atlas5-') && k !== VERSION && k !== TILES).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Fonds de carte : cache d'abord (les zones déjà vues restent disponibles hors réseau)
  if (url.hostname.endsWith('basemaps.cartocdn.com')) {
    e.respondWith(caches.open(TILES).then(async c => {
      const hit = await c.match(req); if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) { c.put(req, res.clone()); trim(c); }
      return res;
    }).catch(() => fetch(req)));
    return;
  }

  // Application, bibliothèques, polices, FINESS : réponse immédiate depuis le cache, mise à jour en arrière-plan
  const shell = url.origin === location.origin || ['unpkg.com', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname);
  if (!shell || url.searchParams.has('cb')) return;          // données (Google) : jamais interceptées
  e.respondWith(caches.open(VERSION).then(async c => {
    const hit = await c.match(req, { ignoreSearch: url.origin === location.origin });
    const net = fetch(req).then(res => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});

let trimming = false;
async function trim(c) {
  if (trimming) return; trimming = true;
  try { const keys = await c.keys(); for (let i = 0; i < keys.length - MAX_TILES; i++) await c.delete(keys[i]); } finally { trimming = false; }
}
