import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createRequire} from 'node:module';
const {createPreviewGate} = createRequire(import.meta.url)('../scripts/preview-gate.cjs');
const listen = (server:http.Server) => new Promise<number>(resolve => server.listen(0,'127.0.0.1',()=>resolve((server.address() as {port:number}).port)));
const close = (server:http.Server) => new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());});

test('private preview denies anonymous access and remembers an authorized browser across pages',async()=>{
 const app=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({path:req.url,cookie:req.headers.cookie}));});
 const appPort=await listen(app);
 const gate=createPreviewGate({upstreamPort:appPort});
 const gatePort=await listen(gate.server);
 const url=`http://127.0.0.1:${gatePort}`;
 const origin='https://preview.example'; gate.setOrigin(origin);
 const key=new URLSearchParams(new URL(gate.accessLink(origin)).hash.slice(1)).get('preview');
 try {
  for(const route of ['/api/portal','/images/room.webp','/api/uploads/private','/pwa/private.png']) assert.equal((await fetch(url+route)).status,401);
  for(const route of ['/manifest.webmanifest','/pwa/icon-192.png','/pwa/icon-512.png','/pwa/maskable-512.png','/sw.js','/offline.html']) {
   assert.equal((await fetch(url+route)).status,200);
   assert.equal((await fetch(url+route,{method:'POST'})).status,401);
  }
  const page=await (await fetch(url+'/',{headers:{accept:'text/html'}})).text();
  assert.match(page,/private test website/);assert.equal(page.includes(key!),false);
  const unlock=(token:string,from=origin)=>fetch(url+'/__preview/access',{method:'POST',headers:{origin:from,'Content-Type':'application/json'},body:JSON.stringify({key:token})});
  assert.equal((await unlock(key!,'https://untrusted.example')).status,403);
  assert.equal((await unlock('é'.repeat(43))).status,403);
  assert.equal((await unlock('a'.repeat(43))).status,403);
  const accepted=await unlock(key!);assert.equal(accepted.status,204);
  const cookie=accepted.headers.get('set-cookie')!;
  for(const flag of ['HttpOnly','Secure','SameSite=Lax','Max-Age=604800'])assert.ok(cookie.includes(flag));
  for(const route of ['/','/login','/api/portal','/images/room.webp']) {
   const response=await fetch(url+route,{headers:{cookie:cookie.split(';')[0]+'; ryuu_session=example'}});
   assert.equal(response.status,200);
   const body=await response.json();assert.equal(body.path,route);assert.equal(body.cookie.trim(),'ryuu_session=example');
  }
  assert.equal((await fetch(url+'/api/portal',{headers:{cookie:'__Host-ryuu_preview=wrong'}})).status,401);
 } finally {await close(gate.server);await close(app);}
});
