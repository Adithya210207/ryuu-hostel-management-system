/* Cache only this public offline page. Never cache authenticated pages, APIs or documents. */
const OFFLINE_CACHE='ryuu-offline-v5';
self.addEventListener('install',event=>{event.waitUntil(caches.open(OFFLINE_CACHE).then(cache=>cache.add('/offline.html')).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('ryuu-offline-')&&key!==OFFLINE_CACHE)await caches.delete(key);await self.clients.claim();})());});
self.addEventListener('fetch',event=>{
 if(event.request.mode==='navigate'&&event.request.method==='GET'&&new URL(event.request.url).origin===self.location.origin)
  event.respondWith(fetch(event.request).catch(async()=>await caches.match('/offline.html')||Response.error()));
});
self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()||{};}catch{}
 // Payload contains no private message, payment, identity or attendance details.
 event.waitUntil(self.registration.showNotification('Ryuu',{
  body:data.body==='Phone notifications are ready.'?data.body:'You have a new message or update. Open your portal to read it.',
  icon:'/pwa/icon-192.png?v=house-1',badge:'/pwa/badge.png?v=house-1',tag:typeof data.tag==='string'?data.tag:'ryuu-update',
  data:{url:'/portal?view=notifications'}
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  const url=new URL('/portal?view=notifications',self.location.origin).href;
  const tabs=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const tab=tabs.find(client=>new URL(client.url).origin===self.location.origin);
  if(tab){await tab.navigate(url);await tab.focus();}else await self.clients.openWindow(url);
 })());
});
self.addEventListener('message',event=>{if(event.data?.type==='CLEAR_NOTIFICATIONS')event.waitUntil(self.registration.getNotifications().then(items=>items.forEach(item=>item.close())));});
