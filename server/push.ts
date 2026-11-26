import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import webpush from 'web-push';
import {db,type SqlClient} from './db';
import {HttpError} from './http';
import type {DomainUser,Notification} from '../shared/domain';

export const pushEnabled=()=>process.env.WEB_PUSH_ENABLED==='true'&&Boolean(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY&&process.env.VAPID_SUBJECT);
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export function validPushEndpoint(value:string) {
  try {
    const u=new URL(value),host=u.hostname;
    return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash&&
      (host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||host.endsWith('.push.services.mozilla.com')||host==='web.push.apple.com'||host.endsWith('.push.apple.com')||host.endsWith('.notify.windows.com'));
  } catch {return false;}
}
const subscriptionSchema=z.object({endpoint:z.string().max(2048).refine(validPushEndpoint,'Unsupported push service.'),keys:z.object({p256dh:z.string().regex(/^[A-Za-z0-9_-]{87}$/),auth:z.string().regex(/^[A-Za-z0-9_-]{22}$/)})});
export async function saveSubscription(user:DomainUser,token:string,input:unknown) {
  if(!pushEnabled())throw new HttpError(503,'Phone notifications are not configured yet.');
  const subscription=subscriptionSchema.parse(input),session=hash(token),endpoint=hash(subscription.endpoint);
  // A browser subscription must never be silently reassigned across accounts.
  await db.transaction(async tx=>{
    const sessionRow=(await tx.query('SELECT user_id FROM auth_sessions WHERE token_hash=$1 AND user_id=$2 AND expires_at>NOW() FOR UPDATE',[session,user.id])).rows[0];
    if(!sessionRow)throw new HttpError(401,'Please sign in again.');
    const existing=(await tx.query('SELECT user_id FROM push_subscriptions WHERE endpoint_hash=$1 FOR UPDATE',[endpoint])).rows[0];
    if(existing&&existing.user_id!==user.id)throw new HttpError(409,'This browser is linked to another account. Turn notifications off here, then enable them again.');
    if(!existing&&(await tx.query('SELECT id FROM push_subscriptions WHERE user_id=$1',[user.id])).rows.length>=10)throw new HttpError(400,'Too many notification devices. Sign out from an old device first.');
    await tx.query(`INSERT INTO push_subscriptions(id,user_id,session_hash,endpoint_hash,subscription) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(endpoint_hash) DO UPDATE SET session_hash=EXCLUDED.session_hash,subscription=EXCLUDED.subscription,updated_at=NOW() WHERE push_subscriptions.user_id=EXCLUDED.user_id`,[randomUUID(),user.id,session,endpoint,JSON.stringify(subscription)]);
  });
}
export async function removeSubscription(user:DomainUser,endpoint:string) {
  await db.query('DELETE FROM push_subscriptions WHERE user_id=$1 AND endpoint_hash=$2',[user.id,hash(endpoint)]);
}
export async function subscriptionStatus(user:DomainUser,token:string,endpoint:string) {
  const {rows}=await db.query('SELECT id FROM push_subscriptions WHERE user_id=$1 AND session_hash=$2 AND endpoint_hash=$3',[user.id,hash(token),hash(endpoint)]);
  return rows.length>0;
}
export async function enqueuePush(tx:SqlClient,notifications:Notification[]) {
  if(!pushEnabled())return;
  for(const n of notifications) {
    // Only new notices and currently opted-in, signed-in devices are eligible. No historical replay.
    const {rows}=await tx.query(`SELECT p.id FROM push_subscriptions p JOIN auth_sessions s ON p.session_hash=s.token_hash
      JOIN accounts a ON a.id=p.user_id WHERE p.user_id=$1 AND a.active=TRUE AND s.expires_at>NOW() AND p.created_at<=$2`,[n.userId,n.createdAt]);
    for(const subscription of rows)await tx.query('INSERT INTO push_deliveries(id,notification_id,user_id,subscription_id) VALUES($1,$2,$3,$4) ON CONFLICT(notification_id,subscription_id) DO NOTHING',[randomUUID(),n.id,n.userId,subscription.id]);
  }
}
export async function queuePushTest(user:DomainUser,token:string,endpoint:string) {
  if(!pushEnabled())throw new HttpError(503,'Phone notifications are not configured yet.');
  const subscription=(await db.query('SELECT id FROM push_subscriptions WHERE user_id=$1 AND session_hash=$2 AND endpoint_hash=$3',[user.id,hash(token),hash(endpoint)])).rows[0];
  if(!subscription)throw new HttpError(400,'Enable notifications on this device first.');
  await db.query('INSERT INTO push_deliveries(id,notification_id,user_id,subscription_id) VALUES($1,$2,$3,$4)',[randomUUID(),`test-${randomUUID()}`,user.id,subscription.id]);
}
export function pushPayload(notificationId:string) {
  const test=notificationId.startsWith('test-');
  return JSON.stringify({title:'Ryuu',body:test?'Phone notifications are ready.':'You have a new message or update. Open your portal to read it.',tag:`ryuu-${notificationId}`,url:'/portal?view=notifications'});
}
export async function dispatchPush() {
  if(!pushEnabled())return;
  const lease=randomUUID();
  const jobs=await db.transaction(async tx=>{
    await tx.query("UPDATE push_deliveries SET status='failed',updated_at=NOW(),error='Delivery attempt limit reached.' WHERE status IN ('queued','retry') AND attempts>=5 AND (lease_until IS NULL OR lease_until<NOW())");
    await tx.query("UPDATE push_deliveries SET status='expired',updated_at=NOW(),error='Notification expired before delivery.' WHERE status IN ('queued','retry') AND created_at<NOW()-INTERVAL '1 day'");
    return (await tx.query(`UPDATE push_deliveries SET lease_until=NOW()+INTERVAL '5 minutes',lease_token=$1,attempts=attempts+1
      WHERE id IN (SELECT id FROM push_deliveries WHERE status IN ('queued','retry') AND attempts<5 AND next_attempt_at<=NOW()
      AND (lease_until IS NULL OR lease_until<NOW()) ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED) RETURNING *`,[lease])).rows;
  });
  for(const job of jobs) {
    const sub=(await db.query(`SELECT p.subscription FROM push_subscriptions p JOIN auth_sessions s ON p.session_hash=s.token_hash JOIN accounts a ON a.id=p.user_id
      WHERE p.id=$1 AND p.user_id=$2 AND a.active=TRUE AND s.expires_at>NOW()`,[job.subscription_id,job.user_id])).rows[0];
    let status='cancelled',error:string|null='Device disabled or signed out.',delay=0,remove=false;
    if(sub) {
      try {
        const subscription=subscriptionSchema.parse(sub.subscription);
        await webpush.sendNotification(subscription,pushPayload(job.notification_id),{TTL:86400,urgency:'normal',timeout:10000,
          vapidDetails:{subject:process.env.VAPID_SUBJECT!,publicKey:process.env.VAPID_PUBLIC_KEY!,privateKey:process.env.VAPID_PRIVATE_KEY!}});
        status='accepted';error=null;
      } catch(e) {
        const code=(e as {statusCode?:number}).statusCode;
        remove=code===404||code===410;
        status=remove?'expired':job.attempts>=5?'failed':'retry';
        error=remove?'Browser subscription expired.':code?`Push service returned ${code}.`:'Push service unavailable or configuration invalid.';
        delay=Math.min(3600,60*2**job.attempts);
      }
    }
    await db.transaction(async tx=>{
      await tx.query('UPDATE push_deliveries SET status=$1,error=$2,next_attempt_at=NOW()+$3*INTERVAL \'1 second\',lease_until=NULL,lease_token=NULL,updated_at=NOW() WHERE id=$4 AND lease_token=$5',[status,error,delay,job.id,lease]);
      if(remove)await tx.query('DELETE FROM push_subscriptions WHERE id=$1 AND user_id=$2',[job.subscription_id,job.user_id]);
    });
  }
}
