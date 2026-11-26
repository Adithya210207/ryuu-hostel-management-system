import {randomBytes} from 'node:crypto';
import {db} from './db';
import {createAccount,createSession,demoEnabled,getUser,listAccounts} from './auth';
import {strictProduction} from './config';
import {initializeDomain,seedDemo,runScheduledJobs,getSnapshot} from './domain';
import type {DomainUser} from '../shared/domain';
import {dispatchPush} from './push';
import {dispatchEmails} from './mailer';
import {openGatewayOrders,recordGatewayResult} from './domain';
import {checkoutStatus,phonePeMode} from './phonepe';
/** Catches payments whose webhook never arrived: asks PhonePe about orders still open after 90 seconds. */
async function reconcilePhonePe(){if(phonePeMode()==='off')return;for(const id of (await openGatewayOrders()).slice(0,10)){try{await recordGatewayResult(id,await checkoutStatus(id));}catch{}}}
const globals=globalThis as unknown as {ryuuRuntime?:Promise<void>;ryuuTick?:Promise<void>;ryuuTimer?:ReturnType<typeof setInterval>};
export async function tick(){
  if(globals.ryuuTick)return globals.ryuuTick;
  globals.ryuuTick=(async()=>{
    await runScheduledJobs();
    await dispatchPush();
    await dispatchEmails().catch(()=>console.error('[Ryuu] Email outbox dispatch failed.'));
    await reconcilePhonePe().catch(()=>console.error('[Ryuu] PhonePe status check failed.'));
    await db.query('INSERT INTO system_status(key,value,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()',['worker',JSON.stringify({lastRun:new Date().toISOString(),status:'ok'})]);
    await db.query('DELETE FROM auth_sessions WHERE expires_at<NOW()');
    await db.query('DELETE FROM auth_challenges WHERE expires_at<NOW()-INTERVAL \'1 day\'');
    await db.query('DELETE FROM rate_limits WHERE expires_at<NOW()');
  })();
  try{await globals.ryuuTick;}finally{globals.ryuuTick=undefined;}
}
export async function ensureRuntime(){
  return globals.ryuuRuntime??=(async()=>{
    await initializeDomain();
    if(demoEnabled())await seedDevelopment();
    for(const account of await listAccounts())await getSnapshot(account);
    if(!strictProduction()&&!globals.ryuuTimer){
      globals.ryuuTimer=setInterval(()=>{void tick().catch(()=>console.error('[Ryuu] Local worker failed; check the health panel.'));},30_000);globals.ryuuTimer.unref();
    }
  })();
}
async function seedDevelopment(){
  const users:DomainUser[]=[];
  for(const [index,role,name] of [[1,'admin','Ryuu Admin'],[2,'resident','Meera Krishnan'],[3,'guardian','Lakshmi Krishnan']] as const){
    const email=`demo.${role}@ryuunest.example`;
    const existing=(await db.query('SELECT id FROM accounts WHERE email=$1',[email])).rows[0];
    let user=existing?await getUser(existing.id):await createAccount({name,email,phone:`+91900000000${index}`,password:randomBytes(32).toString('base64url')},role);
    if(!user)throw new Error('Demo account unavailable.');
    await db.query('UPDATE accounts SET email_verified=TRUE,phone_verified=TRUE WHERE id=$1',[user.id]);user={...user,emailVerified:true,phoneVerified:true};users.push(user);
  }
  await db.query('INSERT INTO guardian_links(resident_user_id,guardian_user_id) VALUES($1,$2) ON CONFLICT(resident_user_id) DO NOTHING',[users[1].id,users[2].id]);
  users[2].linkedResidentIds=[users[1].id];
  await seedDemo(users);
}
export async function ensureDevelopment(role:string){
  if(!demoEnabled()||!['admin','resident','guardian'].includes(role))throw new Error('Demo access is unavailable.');
  await ensureRuntime();const account=(await db.query('SELECT id FROM accounts WHERE email=$1',[`demo.${role}@ryuunest.example`])).rows[0];
  return{user:await getUser(account.id),token:await createSession(account.id)};
}
