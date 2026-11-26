import {randomUUID} from 'node:crypto';
import {db} from './db';
import {HttpError} from './http';
import {initializeDomain} from './domain';
import type {DomainUser} from '../shared/domain';
// SMS and WhatsApp are retained only for historical audit records.
export type HistoryChannel='website'|'push'|'whatsapp'|'email'|'sms';
export type HistoryStatus='expired'|'cancelled'|'visible'|'queued'|'accepted'|'failed'|'not_configured'|'simulated';
export interface HistoryEntry{id:string;channel:HistoryChannel;recipientName:string;recipient:string;recipientRole:string;kind:string;subject:string;body:string;status:HistoryStatus;createdAt:string;error?:string;attempt?:number;providerId?:string;sender?:string}
let initialized:Promise<void>|undefined;
async function ensureHistory(){return initialized??=(async()=>{await db.query(`CREATE TABLE IF NOT EXISTS communication_log(id TEXT PRIMARY KEY,user_id TEXT,channel TEXT NOT NULL,kind TEXT NOT NULL,subject TEXT NOT NULL,body TEXT NOT NULL,status TEXT NOT NULL,recipient TEXT NOT NULL,provider_id TEXT,error TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);await db.query('CREATE INDEX IF NOT EXISTS communication_log_created ON communication_log(created_at DESC)');})();}
export async function startCommunication(input:{userId:string;channel:'email'|'whatsapp';kind:string;subject:string;body:string;recipient:string;status?:HistoryStatus}){await ensureHistory();const id=randomUUID();await db.query('INSERT INTO communication_log(id,user_id,channel,kind,subject,body,status,recipient) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,input.userId,input.channel,input.kind,input.subject,input.body,input.status||'queued',input.recipient]);return id;}
export async function finishCommunication(id:string,status:HistoryStatus,providerId?:string,error?:string){await ensureHistory();await db.query('UPDATE communication_log SET status=$1,provider_id=$2,error=$3,updated_at=NOW() WHERE id=$4',[status,providerId||null,error?.slice(0,500)||null,id]);}
export function filterHistory(entries:HistoryEntry[],params:URLSearchParams){
 const channel=params.get('channel')||'all',status=params.get('status')||'all',query=(params.get('q')||'').toLowerCase().slice(0,200),from=params.get('from')||'',to=params.get('to')||'';
 return entries.filter(e=>{const day=new Date(new Date(e.createdAt).getTime()+19800000).toISOString().slice(0,10);return(channel==='all'||e.channel===channel)&&(status==='all'||e.status===status)&&(!from||day>=from)&&(!to||day<=to)&&(!query||`${e.recipientName} ${e.recipient} ${e.subject} ${e.body} ${e.kind}`.toLowerCase().includes(query));}).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
export async function communicationHistory(user:DomainUser,params:URLSearchParams){
 if(user.role!=='admin')throw new HttpError(403,'Only admins can view communication history.');
 await initializeDomain();await ensureHistory();
 const state=(await db.query('SELECT data FROM domain_state WHERE id=1')).rows[0].data;
 const accounts=(await db.query('SELECT id,name,email,phone,role FROM accounts')).rows;const byId=new Map(accounts.map(a=>[a.id,a]));
 const recipient=(id:string,channel:HistoryChannel)=>{const a=byId.get(id);return{recipientName:a?.name||'Former account',recipient:channel==='email'?a?.email||'':channel==='website'?a?.email||id:a?.phone||'',recipientRole:a?.role||''};};
 const entries:HistoryEntry[]=[];
 for(const n of state.notifications){
  entries.push({id:`website-${n.id}`,channel:'website',...recipient(n.userId,'website'),kind:'notification',subject:n.title,body:n.body,status:'visible',createdAt:n.createdAt,sender:'Ryuu system'});
  if(n.channel==='whatsapp')entries.push({id:`whatsapp-${n.id}`,channel:'whatsapp',...recipient(n.userId,'whatsapp'),kind:'notification',subject:n.title,body:n.delivery==='cancelled'?'Legacy notification cancelled: Routine WhatsApp delivery has been removed. The notice remains visible in the portal.':'Legacy portal-update template. The full notice stays inside the authenticated website.',status:n.delivery==='sent'?'accepted':n.delivery,createdAt:n.createdAt,error:n.deliveryError,attempt:n.attempts,sender:'Ryuu system'});
 }
 for(const m of state.messages){const outbound=m.senderRole==='admin';entries.push({id:`message-${m.id}`,channel:'website',...(outbound?recipient(m.ownerId,'website'):{recipientName:'Admin team',recipient:'Shared admin inbox',recipientRole:'admin'}),kind:outbound?'private_message_sent':'private_message_received',subject:outbound?'Private reply from the admin team':`Private message from ${m.senderName}`,body:m.body,status:'visible',createdAt:m.createdAt,sender:m.senderName});}
 for(const n of state.notices)entries.push({id:`notice-${n.id}`,channel:'website',recipientName:n.audience==='both'?'Residents & guardians':n.audience==='residents'?'Residents':'Guardians',recipient:`${n.recipientIds.length} accounts`,recipientRole:n.audience,kind:'announcement',subject:n.title,body:n.body,status:'visible',createdAt:n.createdAt,sender:n.authorName});
 for(const row of (await db.query('SELECT * FROM communication_log ORDER BY created_at DESC')).rows)entries.push({id:row.id,channel:row.channel,...recipient(row.user_id,row.channel),recipient:row.recipient,kind:row.kind,subject:row.subject,body:row.body,status:row.status,createdAt:new Date(row.created_at).toISOString(),providerId:row.provider_id||undefined,error:row.error||undefined,sender:'Account service'});
 for(const row of (await db.query('SELECT * FROM push_deliveries ORDER BY created_at DESC')).rows)entries.push({id:row.id,channel:'push',...recipient(row.user_id,'push'),recipient:'Registered device',kind:'phone_notification',subject:'New Ryuu update',body:'A private update is available in the portal. Open Notifications to read it.',status:row.status==='retry'?'queued':row.status==='sending'?'queued':row.status,createdAt:new Date(row.created_at).toISOString(),error:row.error||undefined,attempt:row.attempts,sender:'Ryuu system'});
 const filtered=filterHistory(entries,params);const page=Math.max(1,Number(params.get('page'))||1),pageSize=50;const totals=Object.fromEntries(['all','website','push','email','whatsapp'].map(channel=>[channel,channel==='all'?entries.length:entries.filter(e=>e.channel===channel).length]));
 return{entries:filtered.slice((page-1)*pageSize,page*pageSize),totals,total:filtered.length,page,pageSize,policy:'Verification codes and password-reset secrets are hidden. Provider accepted is not confirmation of delivery or reading.'};
}
