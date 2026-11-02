const CACHE = "vitamin-che-pwa-v1";
const SHELL = ["./","./index.html","./styles.css","./styles-extra.css","./manifest.webmanifest","./src/app.js","./src/store.js","./src/data.js","./src/i18n.js","./assets/icon.svg","./assets/logo.svg","./data/conflict-registry.json","./data/markers.json","./data/showcase.json","./data/catalog.json","./data/products.json"];
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener("fetch", event => {
  if(event.request.method!=="GET")return;
  const requestUrl=new URL(event.request.url);
  if(requestUrl.origin!==self.location.origin)return;
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{
    if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}
    return response;
  }).catch(()=>caches.match("./index.html"))));
});
