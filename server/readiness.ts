import {db} from './db';
import {productionConfigIssues,deliveryConfigIssues} from './config';
export async function launchReadiness(){
 const issues=[...productionConfigIssues(),...deliveryConfigIssues()];
 const row=(await db.query('SELECT data FROM domain_state WHERE id=1')).rows[0];
 if(!row)issues.push('Initialize the hostel settings and create the first admin.');
 else {
  const state=row.data,s=state.settings;
  if(state.demo||state.residents.some((r:any)=>r.synthetic))issues.push('Use a clean production database without demo residents.');
  if(!state.rooms.length||state.rooms.some((r:any)=>r.synthetic))issues.push('Configure the actual room and bed inventory.');
  if(s.monthlyRentPaise===null||s.depositPaise===null||s.dailyPenaltyPaise===null)issues.push('Set rent, security deposit and daily penalty amounts.');
  if(s.food.mode==='not_configured')issues.push('Set the food pricing policy.');
  if(s.identityPolicy==='pending_review')issues.push('Finalize the identity-document policy.');
  if(s.checkoutNoticeDays===null)issues.push('Set the checkout notice period.');
  if(!s.paymentUpi&&!s.qrDocumentId&&!(s.accountNumber&&s.ifsc&&s.accountName))issues.push('Configure the verified payment QR, UPI ID or bank details.');
  if(!s.address||!s.phone||/^0+$/.test(s.phone)||!s.email||/demo|example/i.test(s.email))issues.push('Replace the placeholder public contact details.');
 }
 const admins=(await db.query("SELECT id FROM accounts WHERE role='admin' AND active=TRUE")).rows;
 if(!admins.length)issues.push('Create the first administrator with the bootstrap command.');
 const worker=(await db.query("SELECT updated_at FROM system_status WHERE key='worker'")).rows[0];
 if(!worker||Date.now()-new Date(worker.updated_at).getTime()>120000)issues.push('Start the worker and confirm a recent heartbeat.');
 if(process.env.REGISTRATION_OPEN!=='true')issues.push('Public registration is closed; open it only after launch checks pass.');
 return {ready:issues.length===0,issues,manualChecks:['Test real Gmail and WhatsApp verification with designated accounts.','Test phone notifications on Android and an installed iPhone app.','Scan a harmless test document and confirm unscanned/infected uploads are rejected.','Restore a database and encrypted-file backup on a separate test instance.','Verify the HTTPS certificate and real bank/QR details.'],checkedAt:new Date().toISOString()};
}
