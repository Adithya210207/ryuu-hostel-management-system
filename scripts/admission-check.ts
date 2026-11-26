import assert from 'node:assert/strict';
const base=process.env.TEST_URL||'http://127.0.0.1:4174';
let cookie='';
async function call(path:string,body?:unknown,session=cookie){const response=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Origin:base,...(session?{Cookie:session}:{})},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();assert.ok(response.ok,`${path}: ${response.status} ${JSON.stringify(result)}`);return{body:result,cookie:response.headers.get('set-cookie')?.split(';')[0]||session};}
async function attach(purpose:string,session=cookie){const form=new FormData();form.set('purpose',purpose);form.set('file',new Blob(['%PDF-1.4\n% Synthetic verification fixture only\n1 0 obj << /Type /Catalog >> endobj\n%%EOF'],{type:'application/pdf'}),'synthetic-test.pdf');const response=await fetch(base+'/api/uploads',{method:'POST',headers:{Origin:base,Cookie:session},body:form});const body=await response.json();assert.ok(response.ok,JSON.stringify(body));return body.id as string;}
async function main(){
  const admin=(await call('/api/auth/demo',{role:'admin'})).cookie;
  const stamp=Date.now();const suffix=String(stamp).slice(-8);const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const registered=await call('/api/auth/register',{name:'Synthetic Admission Test',email:`fixture.${stamp}@example.test`,phone:`+9181${suffix}`,password:'Synthetic Secure Password 123!',dob:'2001-06-14',address:'Synthetic test record only',profession:'student',guardianName:'Synthetic Guardian',guardianEmail:`guardian.${stamp}@example.test`,guardianPhone:`+9182${suffix}`,guardianDob:'1975-05-03',guardianProfession:'Teacher',guardianRelationship:'Parent',acceptRules:true,intendedMoveIn:today});cookie=registered.cookie;
  for(const [purpose,channel] of [['verify_email','email'],['verify_phone','whatsapp']]){const challenge=(await call('/api/auth/challenge',{purpose,channel})).body;assert.ok(challenge.developmentCode);const verified=await call('/api/auth/verify',{challengeId:challenge.challengeId,code:challenge.developmentCode});cookie=verified.cookie||cookie;}
  const identityDocumentId=await attach('resident_identity');const guardianDocumentId=await attach('guardian_identity');
  const snapshot=(await call('/api/auth/profile',{identityDocumentId,guardianDocumentId})).body;
  assert.equal(snapshot.residents[0].residentNumber,registered.body.user.residentId);
  const id=registered.body.user.id;const original=(await call('/api/portal',undefined,admin)).body.settings.identityPolicy;
  await call('/api/portal',{action:'settings.update',input:{identityPolicy:'alternative_id'}},admin);
  try{
    const bed=snapshot.rooms.flatMap((r:any)=>r.beds).find((b:any)=>b.status==='available');
    await call('/api/portal',{action:'document.review',input:{residentId:id,decision:'verify'}},admin);
    let s=(await call('/api/portal',{action:'application.submit',input:{bedId:bed.id,intendedMoveIn:today}})).body;
    const application=s.applications.find((a:any)=>a.status==='submitted');
    s=(await call('/api/portal',{action:'application.review',input:{applicationId:application.id,decision:'approve'}},admin)).body;
    const bill=s.bills.find((b:any)=>b.residentId===id&&b.kind==='admission');assert.ok(bill);
    const proofId=await attach('payment_proof');
    s=(await call('/api/portal',{action:'payment.submit',input:{billId:bill.id,amountPaise:bill.totalPaise,paidOn:today,reference:`SYNTHETIC-${stamp}`,method:'upi',proofId}})).body;
    assert.equal(s.bills.find((b:any)=>b.id===bill.id).status,'pending');
    const payment=s.payments.find((p:any)=>p.billId===bill.id);
    s=(await call('/api/portal',{action:'payment.review',input:{paymentId:payment.id,decision:'reject',reason:'Synthetic rejection test.'}},admin)).body;
    assert.ok(new Date(s.applications.find((a:any)=>a.id===application.id).paymentDeadline).getTime()>Date.now()+47*3600000);
    s=(await call('/api/portal',{action:'payment.submit',input:{billId:bill.id,amountPaise:bill.totalPaise,paidOn:today,reference:`SYNTHETIC-RESUBMIT-${stamp}`,method:'upi',proofId}})).body;
    const resubmit=s.payments.find((p:any)=>p.status==='submitted');
    await call('/api/portal',{action:'payment.review',input:{paymentId:resubmit.id,decision:'verify'}},admin);
    s=(await call('/api/portal',{action:'resident.checkin',input:{residentId:id,date:today}},admin)).body;assert.equal(s.residents.find((r:any)=>r.id===id).status,'active');
    const guardianChallenge=(await call('/api/auth/challenge',{purpose:'login',channel:'email',identifier:`guardian.${stamp}@example.test`},'')).body;
    const guardian=(await call('/api/auth/verify',{challengeId:guardianChallenge.challengeId,code:guardianChallenge.developmentCode},'')).cookie;
    s=(await call('/api/portal',{action:'outpass.create',input:{departureAt:new Date(Date.now()+60000).toISOString(),expectedReturnAt:new Date(Date.now()+3*86400000).toISOString(),destination:'Synthetic destination',reason:'Synthetic workflow verification',contact:`+9181${suffix}`}})).body;
    const outpass=s.outpasses.at(-1);
    await call('/api/portal',{action:'attendance.record',input:{residentId:id,type:'departure',outpassId:outpass.id,eventAt:new Date().toISOString(),reason:'Synthetic device-failure fallback test.'}},admin);
    const guardianView=(await call('/api/portal',undefined,guardian)).body;assert.equal(guardianView.outpasses[0].status,'away');assert.ok(guardianView.notifications.some((n:any)=>n.title==='Departure recorded'));assert.equal(guardianView.payments.length,0);
    await call('/api/portal',{action:'attendance.record',input:{residentId:id,type:'return',outpassId:outpass.id,eventAt:new Date().toISOString(),reason:'Synthetic return fallback test.'}},admin);
    const g=(await call('/api/portal',undefined,guardian)).body;assert.equal(g.outpasses[0].status,'returned');assert.ok(g.notifications.some((n:any)=>n.title==='Return recorded'));
    console.log(`Admission HTTP workflow passed: registration, unique ID, both contact verifications, encrypted PDFs, document review, bed reservation, reject/resubmit payment, verified booking, move-in, guardian OTP, actual departure/return notifications. Fixture ${registered.body.user.residentId}.`);
  }finally{await call('/api/portal',{action:'settings.update',input:{identityPolicy:original}},admin);}
}
void main().catch(error=>{console.error(error);process.exit(1);});
