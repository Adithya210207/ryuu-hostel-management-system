import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('service worker caches only the public offline page and keeps lock-screen content private',async()=>{
 const handlers:Record<string,Function>={},cached:string[]=[],shown:any[]=[];let pending:Promise<unknown>=Promise.resolve();let destination='';
 const self={location:{origin:'https://ryuu.example.test'},addEventListener:(name:string,fn:Function)=>handlers[name]=fn,skipWaiting:async()=>{},registration:{showNotification:async(...args:any[])=>shown.push(args)},clients:{claim:async()=>{},matchAll:async()=>[],openWindow:async(url:string)=>{destination=url;}}};
 vm.runInNewContext(readFileSync('public/sw.js','utf8'),{self,URL,Response,fetch:async()=>{throw new Error('offline');},caches:{open:async()=>({add:async(url:string)=>cached.push(url)}),keys:async()=>[],match:async()=>new Response('Offline')}});
 const event={waitUntil:(p:Promise<unknown>)=>{pending=p;}};handlers.install(event);await pending;assert.deepEqual(cached,['/offline.html']);
 handlers.push({...event,data:{json:()=>({title:'Secret',body:'Private identity data',url:'https://evil.test'})}});await pending;
 assert.equal(shown[0][0],'Ryuu');assert.ok(!JSON.stringify(shown).includes('Private identity'));assert.equal(shown[0][1].data.url,'/portal?view=notifications');
 let intercepted=false;handlers.fetch({request:{mode:'cors',method:'GET',url:'https://ryuu.example.test/api/portal'},respondWith:()=>{intercepted=true;}});assert.equal(intercepted,false);
 handlers.notificationclick({...event,notification:{close:()=>{}}});await pending;assert.equal(destination,'https://ryuu.example.test/portal?view=notifications');
});
