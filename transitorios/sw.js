/* ============================================================
   Service Worker — Gestão de Transitórios (PWA offline-first)
   Mesma estratégia já validada nos módulos de Auditoria e
   Inventário Rotativo: network-first para os arquivos do app
   (nunca esconde updates), cache só como fallback offline.
   ============================================================ */
const CACHE_VERSION = 'transitorios-v1';
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './css/theme.css',
  './js/db.js',
  './js/rules.js',
  './js/demo.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './brand/Logo_LDM_hor_2.png',
  './brand/Logo_LDM_vert.png'
];

self.addEventListener('install', (event)=>{
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache=>cache.addAll(PRECACHE_URLS)).then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate', (event)=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(
      keys.filter(k=>k!==CACHE_VERSION).map(k=>caches.delete(k))
    )).then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch', (event)=>{
  const req = event.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;

  if(isSameOrigin){
    event.respondWith(
      fetch(req).then(res=>{
        if(res && res.ok){
          const clone = res.clone();
          caches.open(CACHE_VERSION).then(c=>c.put(req, clone));
        }
        return res;
      }).catch(()=>caches.match(req))
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_VERSION).then(cache=>
      cache.match(req).then(cached=>{
        const network = fetch(req).then(res=>{
          if(res && res.ok) cache.put(req, res.clone());
          return res;
        }).catch(()=>cached);
        return cached || network;
      })
    )
  );
});
