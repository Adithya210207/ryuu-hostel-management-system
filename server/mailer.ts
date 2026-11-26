// Sends emails queued in the domain state outbox (welcome emails, weekly guardian updates).
import {db} from './db';
import {demoEnabled} from './auth';
import {sendEmail} from './providers';
import {startCommunication,finishCommunication} from './history';
import {ensureExtras} from './extras';
import type {OutboxEmail} from '../shared/extras';

/** In the local demo, only send for real when PREVIEW_REAL_EMAIL=true and the address is not a made-up .example one. */
function simulated(to:string){return demoEnabled()&&(process.env.PREVIEW_REAL_EMAIL!=='true'||/\.example$/i.test(to));}

export async function dispatchEmails(batch=40){
  const row=(await db.query('SELECT data FROM domain_state WHERE id=1')).rows[0];if(!row)return;
  const state=typeof row.data==='string'?JSON.parse(row.data):row.data;const queued:OutboxEmail[]=ensureExtras(state).outbox.filter((e:OutboxEmail)=>e.status==='queued').slice(0,batch);
  if(!queued.length)return;
  const results:Record<string,{status:OutboxEmail['status'];error?:string}>={};
  for(const email of queued){
    const logId=await startCommunication({userId:email.userId,channel:'email',kind:email.kind,subject:email.subject,body:email.text.slice(0,1500),recipient:email.to});
    if(simulated(email.to)){await finishCommunication(logId,'simulated');results[email.id]={status:'simulated'};continue;}
    try{const providerId=await sendEmail(email.to,email.subject,email.text);await finishCommunication(logId,'accepted',providerId||undefined);results[email.id]={status:'sent'};}
    catch(error){const message=error instanceof Error?error.message:'Delivery failed.';await finishCommunication(logId,'failed',undefined,message);results[email.id]={status:'failed',error:message};}
  }
  await db.transaction(async tx=>{
    const current=(await tx.query('SELECT data FROM domain_state WHERE id=1 FOR UPDATE')).rows[0];const live=typeof current.data==='string'?JSON.parse(current.data):current.data;
    for(const email of ensureExtras(live).outbox){const r=results[email.id];if(r){email.status=r.status;email.sentAt=new Date().toISOString();if(r.error)email.error=r.error;}}
    // Keep the outbox small: drop delivered emails older than 30 days (the communication log keeps the record).
    const cutoff=Date.now()-30*86400000;live.extras.outbox=live.extras.outbox.filter((e:OutboxEmail)=>e.status==='queued'||new Date(e.createdAt).getTime()>(e.kind==='admin.email'?Date.now()-90*86400000:cutoff));
    await tx.query('UPDATE domain_state SET data=$1::jsonb,revision=revision+1,updated_at=NOW() WHERE id=1',[JSON.stringify(live)]);
  });
}
