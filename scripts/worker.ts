import {ensureRuntime,tick} from '../server/runtime';
import {db} from '../server/db';
async function main(){
  if(!process.env.DATABASE_URL)throw new Error('The separate worker requires DATABASE_URL. Local development uses an in-process worker to avoid opening the embedded database twice.');
  await ensureRuntime();console.log('Ryuu worker started. Business timezone: Asia/Kolkata.');
  const stop=()=>{void db.close().finally(()=>process.exit(0));};process.on('SIGTERM',stop);process.on('SIGINT',stop);
  while(true){try{await tick();}catch{console.error('Scheduled work failed; retrying next cycle. Inspect service health and database connectivity.');}await new Promise(resolve=>setTimeout(resolve,30000));}
}
void main().catch(error=>{console.error(error.message);process.exit(1);});
