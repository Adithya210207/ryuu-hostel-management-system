import test,{after} from 'node:test';
import assert from 'node:assert/strict';
process.env.TEST_DATABASE='memory';process.env.DATABASE_URL='';process.env.DEMO_MODE='true';
import {filterHistory,communicationHistory,type HistoryEntry} from '../server/history';
import {createAccount,requestChallenge,verifyChallenge} from '../server/auth';
import {db} from '../server/db';
import {applyAction,initializeDomain,type DomainState} from '../server/domain';
import {tick} from '../server/runtime';
import nodemailer from 'nodemailer';
import {deliverCode,deliverPhoneVerification,providerStatus} from '../server/providers';
after(()=>db.close());
test('history filters channel, recipient, delivery state, and IST calendar boundaries',()=>{
 const entries:HistoryEntry[]=[{id:'1',channel:'email',recipientName:'Resident One',recipient:'one@example.test',recipientRole:'resident',kind:'verification',subject:'Account verification',body:'Code hidden',status:'simulated',createdAt:'2026-09-15T20:00:00Z'},{id:'2',channel:'website',recipientName:'Resident Two',recipient:'two@example.test',recipientRole:'resident',kind:'notification',subject:'Meal reminder',body:'Select meals',status:'visible',createdAt:'2026-09-15T17:00:00Z'}];
 assert.deepEqual(filterHistory(entries,new URLSearchParams('channel=email&status=simulated&from=2026-09-16&to=2026-09-16&q=one')).map(e=>e.id),['1']);assert.equal(filterHistory(entries,new URLSearchParams('channel=sms')).length,0);
});
test('routine notices stay in the portal and legacy WhatsApp jobs never send, even with credentials',async t=>{
 const keys=['DEMO_MODE','WHATSAPP_TOKEN','WHATSAPP_PHONE_ID','WHATSAPP_AUTH_TEMPLATE','WHATSAPP_NOTIFICATION_TEMPLATE'];
 const previous=keys.map(key=>process.env[key]);
 try {
  process.env.DEMO_MODE='false';process.env.WHATSAPP_TOKEN='synthetic';process.env.WHATSAPP_PHONE_ID='synthetic';process.env.WHATSAPP_AUTH_TEMPLATE='synthetic_auth';process.env.WHATSAPP_NOTIFICATION_TEMPLATE='obsolete_template';
  await initializeDomain();
  const outbound=t.mock.method(globalThis,'fetch',async()=>{throw new Error('Unexpected external delivery');});
  const state=(await db.query('SELECT data FROM domain_state WHERE id=1')).rows[0].data as DomainState;
  const recipient={id:'notification-recipient',name:'Synthetic Resident',role:'resident' as const,email:'notification@example.test',phone:'+919000099982'};
  const admin={...recipient,id:'notification-admin',role:'admin' as const};
  state.actors[recipient.id]=recipient;
  applyAction(state,admin,'message.send',{ownerId:recipient.id,body:'Synthetic portal-only message'},new Date());
  const fresh=state.notifications.at(-1)!;
  assert.equal(fresh.channel,'website');assert.equal(fresh.delivery,'visible');
  for(const delivery of ['queued','failed','not_configured','sent'] as const)state.notifications.push({...fresh,id:`legacy-${delivery}`,channel:'whatsapp',delivery,attempts:delivery==='sent'?1:0,nextAttemptAt:'2020-01-01T00:00:00Z'});
  await db.query('UPDATE domain_state SET data=$1 WHERE id=1',[JSON.stringify(state)]);
  await tick();await tick();
  assert.equal(outbound.mock.callCount(),0);
  const result=await communicationHistory(admin,new URLSearchParams());
  assert.ok(result.entries.some(e=>e.id===`website-${fresh.id}`&&e.status==='visible'));
  assert.ok(!result.entries.some(e=>e.id===`whatsapp-${fresh.id}`));
  for(const delivery of ['queued','failed','not_configured'])assert.equal(result.entries.find(e=>e.id===`whatsapp-legacy-${delivery}`)?.status,'cancelled');
  assert.equal(result.entries.find(e=>e.id==='whatsapp-legacy-sent')?.status,'accepted');
 } finally { keys.forEach((key,i)=>{if(previous[i]===undefined)delete process.env[key];else process.env[key]=previous[i];}); }
});
test('Gmail sends authentication through TLS, hides transport errors and enforces a daily cap',async t=>{
 const keys=['GMAIL_USER','GMAIL_APP_PASSWORD','GMAIL_DAILY_LIMIT'];const previous=keys.map(key=>process.env[key]);
 try {
  process.env.GMAIL_USER='synthetic@gmail.com';process.env.GMAIL_APP_PASSWORD='synthetic app password';process.env.GMAIL_DAILY_LIMIT='2';
  assert.equal(providerStatus().email,'configured_not_verified');let count=0;
  const transport=t.mock.method(nodemailer,'createTransport',((config:any)=>{
   assert.equal(config.host,'smtp.gmail.com');assert.equal(config.secure,true);assert.equal(config.port,465);
   return {sendMail:async(message:any)=>{count++;assert.equal(message.from.address,'synthetic@gmail.com');assert.ok(message.text.includes('123456'));if(count===2)throw new Error('secret transport credentials');},close:()=>{}};
  }) as any);
  await deliverCode('email','one@example.test','123456');
  await assert.rejects(()=>deliverCode('email','one@example.test','123456'),/Gmail could not send/);
  await assert.rejects(()=>deliverCode('email','one@example.test','123456'),/limit reached/);assert.equal(transport.mock.callCount(),2);
  delete process.env.GMAIL_APP_PASSWORD;assert.equal(providerStatus().email,'not_configured');
 } finally {keys.forEach((key,i)=>{if(previous[i]===undefined)delete process.env[key];else process.env[key]=previous[i];});}
});
test('OTP history records email simulations without storing the codes',async()=>{
 const user=await createAccount({name:'History Test',email:'history@example.test',phone:'+919000099981',password:'Synthetic history password!'},'resident');
 const codes:string[]=[];for(const channel of ['email']){const c=await requestChallenge({purpose:'login',identifier:user.email,channel});assert.ok('developmentCode' in c);assert.ok(c.developmentCode);codes.push(c.developmentCode);}
 await assert.rejects(()=>requestChallenge({purpose:'login',identifier:user.email,channel:'sms'}),error=>error instanceof Error && error.name==='ZodError');
 await assert.rejects(()=>requestChallenge({purpose:'login',identifier:user.email,channel:'whatsapp'}));
 await assert.rejects(()=>requestChallenge({purpose:'verify_phone',identifier:user.phone,channel:'email'},user));
 const admin={...user,id:'history-admin',role:'admin' as const};const result=await communicationHistory(admin,new URLSearchParams('q=History+Test'));assert.equal(result.entries.length,1);assert.ok(result.entries.every(e=>e.status==='simulated'));const serialized=JSON.stringify(result);for(const code of codes)assert.equal(serialized.includes(code),false);
 await assert.rejects(()=>communicationHistory(user,new URLSearchParams()),/Only admins/);
});

test('email OTP verifies only email, is single-use and legacy WhatsApp challenges are rejected',async()=>{
 const user=await createAccount({name:'Email Identity',email:'identity@example.test',phone:'+919000099978',password:'Synthetic Password 2026!'},'resident');
 const challenge=await requestChallenge({purpose:'login',identifier:user.email,channel:'email'});assert.ok('developmentCode' in challenge);const input={challengeId:challenge.challengeId,code:challenge.developmentCode};
 const verified=await verifyChallenge(input);assert.equal(verified.user.emailVerified,true);assert.equal(verified.user.phoneVerified,false);
 await assert.rejects(()=>verifyChallenge(input),/no longer valid/);
 const legacy=await requestChallenge({purpose:'login',identifier:user.email,channel:'email'});assert.ok('developmentCode' in legacy);await db.query("UPDATE auth_challenges SET channel='whatsapp' WHERE id=$1",[legacy.challengeId]);
 await assert.rejects(()=>verifyChallenge({challengeId:legacy.challengeId,code:legacy.developmentCode}),/no longer valid/);
});

test('WhatsApp sends only the configured phone-verification template and hides provider errors',async t=>{
 const keys=['WHATSAPP_TOKEN','WHATSAPP_PHONE_ID','WHATSAPP_API_VERSION','WHATSAPP_AUTH_TEMPLATE'];const before=keys.map(k=>process.env[k]);
 try{
  process.env.WHATSAPP_TOKEN='synthetic';process.env.WHATSAPP_PHONE_ID='12345';process.env.WHATSAPP_API_VERSION='v25.0';process.env.WHATSAPP_AUTH_TEMPLATE='verify_phone';
  const fetch=t.mock.method(globalThis,'fetch',async(url:any,options:any)=>{assert.equal(url,'https://graph.facebook.com/v25.0/12345/messages');const body=JSON.parse(options.body);assert.equal(body.template.name,'verify_phone');assert.equal(body.to,'919000099978');assert.equal(body.template.components[1].sub_type,'url');assert.equal(body.template.components[0].parameters[0].text,'123456');return new Response(JSON.stringify({messages:[{id:'synthetic-id'}]}));});
  assert.equal(await deliverPhoneVerification('+919000099978','123456'),'synthetic-id');assert.equal(fetch.mock.callCount(),1);
 }finally{keys.forEach((k,i)=>{if(before[i]===undefined)delete process.env[k];else process.env[k]=before[i];});}
});
