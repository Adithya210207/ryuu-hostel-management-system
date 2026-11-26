import assert from 'node:assert/strict';
const base=process.env.TEST_URL||'http://127.0.0.1:4174';
async function request(path:string,method='GET',body?:unknown,cookie?:string){const response=await fetch(base+path,{method,headers:{...(method!=='GET'?{'Content-Type':'application/json',Origin:base}:{}),...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});let value:any;const content=response.headers.get('content-type')||'';if(content.includes('json'))value=await response.json();else value=await response.text();return{status:response.status,body:value,cookie:response.headers.get('set-cookie')?.split(';')[0]};}
async function main(){
  const unauthorized=await request('/api/portal');assert.equal(unauthorized.status,401);
  const resident=await request('/api/auth/demo','POST',{role:'resident'});assert.equal(resident.status,200,JSON.stringify(resident.body));
  const admin=await request('/api/auth/demo','POST',{role:'admin'});assert.equal(admin.status,200,JSON.stringify(admin.body));
  const guardian=await request('/api/auth/demo','POST',{role:'guardian'});assert.equal(guardian.status,200,JSON.stringify(guardian.body));
  const r=await request('/api/portal','GET',undefined,resident.cookie);assert.equal(r.status,200);assert.equal(r.body.user.role,'resident');assert.equal(r.body.residents.length,1);
  const g=await request('/api/portal','GET',undefined,guardian.cookie);assert.equal(g.status,200);assert.equal(g.body.bills.length,0);assert.equal(g.body.residents.length,1);assert.equal(g.body.residents[0].identityDocumentId,undefined);
  const denied=await request('/api/admin/users','GET',undefined,resident.cookie);assert.equal(denied.status,403);
  const deniedMutation=await request('/api/portal','POST',{action:'settings.update',input:{monthlyRentPaise:1}},resident.cookie);assert.equal(deniedMutation.status,403);
  const message=await request('/api/portal','POST',{action:'message.send',input:{body:'Synthetic verification: private resident-to-admin message.'}},resident.cookie);assert.equal(message.status,200,JSON.stringify(message.body));
  const adminSnapshot=await request('/api/portal','GET',undefined,admin.cookie);assert.equal(adminSnapshot.body.messages.some((m:any)=>m.ownerId===resident.body.user.id),true);
  const guardianAfter=await request('/api/portal','GET',undefined,guardian.cookie);assert.equal(guardianAfter.body.messages.some((m:any)=>m.ownerId===resident.body.user.id),false);
  const ticket=await request('/api/portal','POST',{action:'ticket.create',input:{category:r.body.settings.ticketCategories[0],subject:'Synthetic test — fixture check',description:'This ticket was created by the local verification script.',priority:'normal'}},resident.cookie);assert.equal(ticket.status,200,JSON.stringify(ticket.body));
  const health=await request('/api/health','GET',undefined,admin.cookie);assert.equal(health.status,200,JSON.stringify(health.body));
  const exportDenied=await request('/api/exports?format=xlsx','GET',undefined,guardian.cookie);assert.equal(exportDenied.status,403);
  for(const format of ['xlsx','pdf']){const response=await fetch(`${base}/api/exports?format=${format}&sections=basic,guardian,payments,attendance,outpasses`,{headers:{Cookie:admin.cookie!}});assert.equal(response.status,200,await response.clone().text());const bytes=new Uint8Array(await response.arrayBuffer());assert.ok(bytes.length>500);if(format==='pdf')assert.equal(new TextDecoder().decode(bytes.slice(0,5)),'%PDF-');else assert.equal(String.fromCharCode(...bytes.slice(0,2)),'PK');}
  console.log('HTTP checks passed: three roles, session access, guardian isolation, private inbox, ticket creation, health endpoint, Excel and PDF exports. Synthetic demo records only.');
}
void main().catch(error=>{console.error(error);process.exit(1);});
