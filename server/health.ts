import {database,db,dataDirectory} from './db';
import {launchReadiness} from './readiness';
import {pushEnabled} from './push';
import {providerStatus} from './providers';
import {mkdir,access} from 'node:fs/promises';
import {constants} from 'node:fs';
export async function systemHealth(){
  const checks:{name:string;status:string;detail:string}[]=[];
  try{const connection=await database();await db.query('SELECT 1');checks.push({name:'Database',status:'healthy',detail:connection.kind});}catch{checks.push({name:'Database',status:'failed',detail:'Connection failed.'});}
  try{await mkdir(dataDirectory(),{recursive:true});await access(dataDirectory(),constants.W_OK);checks.push({name:'Private file storage',status:'healthy',detail:'Private data directory is writable.'});}catch{checks.push({name:'Private file storage',status:'failed',detail:'Storage is not writable.'});}
  const worker=(await db.query('SELECT * FROM system_status WHERE key=$1',['worker'])).rows[0];const healthy=worker&&Date.now()-new Date(worker.updated_at).getTime()<120_000;
  checks.push({name:'Scheduled jobs',status:healthy?'healthy':'pending',detail:worker?`Last heartbeat ${new Date(worker.updated_at).toISOString()}`:'Waiting for the worker’s first heartbeat.'});
  for(const [name,status] of Object.entries(providerStatus()))checks.push({name,status,detail:status==='not_configured'?'Service has not been configured.':name==='phonepe_payments'?(status==='simulated'?'Local test checkout: no real money moves.':String(status).endsWith('webhook_missing')?'Keys are set, but the webhook username/password are missing. Payments still confirm through the background check.':`PhonePe ${String(status).split('_')[0]} keys are set. Do one test payment to confirm.`):name==='biometric'?'Signed event adapter configured; physical device commissioning is pending.':'Credentials present; real delivery needs a designated test recipient.'});
  checks.push({name:'Phone notifications',status:pushEnabled()?'configured_not_verified':'not_configured',detail:'Requires HTTPS, device permission and a live delivery test. Browser acceptance does not confirm receipt.'});
  checks.push({name:'Upload scanning',status:process.env.CLAMSCAN_PATH?'configured_not_verified':'not_configured',detail:process.env.CLAMSCAN_PATH?'Scanner executable configured; uploaded files must pass scanning.':'Local previews allow synthetic uploads only. Production rejects uploads without a scanner.'});
  checks.push({name:'Backups',status:'not_verified',detail:'Configure a backup schedule and complete a restore drill before launch.'});
  const readiness=await launchReadiness();checks.push({name:'Launch readiness',status:readiness.ready?'manual_checks_required':'not_ready',detail:readiness.ready?'Automated configuration checks passed. Live delivery and restore checks still need commissioning.':readiness.issues.join(' ')});
  return{readiness,status:checks.some(c=>c.status==='failed')?'degraded':'operational',checks,checkedAt:new Date().toISOString()};
}
