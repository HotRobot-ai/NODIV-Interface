const CACHE='nodiv-app-v1-20261003-1';
const ASSETS=['./manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil((async()=>{await caches.open(CACHE).then(cache=>cache.addAll(ASSETS));await self.skipWaiting()})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)));await self.clients.claim()})()));
self.addEventListener('fetch',event=>{
 const req=event.request;
 if(req.method!=='GET')return;
 const url=new URL(req.url);
 if(req.mode==='navigate'||url.pathname.endsWith('/app/')||url.pathname.endsWith('/app/index.html')){
  event.respondWith(fetch(req).catch(()=>caches.match('./index.html')));
  return;
 }
 event.respondWith(fetch(req).then(response=>{if(response&&response.ok&&url.origin===self.location.origin){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(req,copy))}return response}).catch(()=>caches.match(req)));
});