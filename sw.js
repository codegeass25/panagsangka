const CACHE='panagsangka-v25-judging-print-chairman-20261030';
const ASSETS=['./','./index.html','./config.js','./app.js','./verify-results.js','./scoring-core.js','./sports-ui.js','./reports-ui.js','./participation-ui.js','./participation.css','./dashboard.js','./dashboard.css','./assets/dashboard-stadium-20261025.webp','./arena.js','./arena.css','./cheer-settings.js','./engagement-settings.js','./arena-comments.js','./encoding-ui.js','./judging-ui.js','./season-ui.js','./styles.css','./manifest.json','./assets/icon.svg','./assets/icon-192.png','./assets/icon-512.png','./assets/championship-poster-2026-6935240df12b.png','./assets/championship-panorama-2026.png','./assets/championship-mobile-upload-2026.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('panagsangka-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);
  // Public/authenticated API state is always live; never cache tokens or results.
  if(e.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.includes('/api/')||url.pathname.includes('/socket.io/'))return;
  if(/\/(?:poster-[a-f0-9]{64}|championship-poster-2026-[a-f0-9]{12})\.(?:png|jpg|webp)$/.test(url.pathname)){
    e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(response=>{if(response.ok){const copy=response.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(e.request,copy)));}return response;})));return;
  }
  e.respondWith((async()=>{
    try{const response=await fetch(e.request);if(response.ok){const copy=response.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return response;}
    catch{return await caches.match(e.request)||await caches.match(e.request,{ignoreSearch:true})||Response.error();}
  })());
});
