const CACHE='qiaoqiao-variety-preview-5';
const FILES=["./cozy-island.js","./cozy-props.js","./engine.js","./forest-world.js","./index.html","./invitation-garden-scene.js","./invitation-room-scene.js","./invitation-world.js","./map-world.js","./map.js","./orchard-world.js","./pairing-room-scene.js","./pairing-world.js","./play.css","./play.html","./play.js","./river-world.js","./store.js","./style.css","../curriculum.js","../rewards.js","../vendor/three.module.js","../vendor/three.core.js","../vendor/BufferGeometryUtils.js"];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(async cache=>{for(const file of FILES){const response=await fetch(file,{cache:'reload'});if(!response.ok||response.redirected)throw Error('Preview offline asset unavailable');await cache.put(file,response);}await self.skipWaiting();})));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('qiaoqiao-variety-preview-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin)return;// A successful fetch must reach the network, not a heuristically fresh HTTP
// cache entry left by the previous preview. This also covers dynamic imports.
event.respondWith(fetch(event.request,{cache:'reload'}).then(async response=>{
 if(response.ok&&!response.redirected&&url.pathname.startsWith(new URL('./',self.location).pathname)){
  // A full offline cache must not replace a fresh response with an older one.
  try{const cache=await caches.open(CACHE);await cache.put(event.request,response.clone());}catch{}
 }
 return response;
}).catch(async()=>{const cache=await caches.open(CACHE);return cache.match(event.request,{ignoreSearch:true});}));});
