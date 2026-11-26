import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import {db} from '../server/db';

// Run only against a disposable PostgreSQL database, never the hostel database.
async function main(){
 const database=new URL(process.env.DATABASE_URL||'http://invalid');
 if(!['postgres:','postgresql:'].includes(database.protocol)||!/^\/ryuu_(ci|test)$/.test(database.pathname))throw new Error('Use a disposable PostgreSQL database named ryuu_ci or ryuu_test.');
 Object.assign(process.env,{NODE_ENV:'production',DEMO_MODE:'false',REGISTRATION_OPEN:'false',APP_URL:'https://ryuu.example.test',FILE_ENCRYPTION_KEY:randomBytes(32).toString('base64'),CLAMSCAN_PATH:process.env.CLAMSCAN_PATH||'/bin/false',WEB_PUSH_ENABLED:'false'});
 for(const key of ['ALLOW_DEV_DATABASE','TEST_DATABASE','GMAIL_APP_PASSWORD','WHATSAPP_TOKEN'])delete process.env[key];
 const {createAccount,SESSION_COOKIE}=await import('../server/auth');
 const email=`smoke-${randomBytes(5).toString('hex')}@example.test`,password=randomBytes(20).toString('hex');
 await createAccount({name:'Production Smoke Resident',email,phone:`+919${Math.floor(Math.random()*1e9).toString().padStart(9,'0')}`,password,dob:'2000-01-01'},'resident');
 await db.close();
 const server=spawn(process.execPath,[path.resolve('node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','4190'],{env:process.env,stdio:'ignore'});
 let startupError=false;server.on('error',()=>{startupError=true;});
 const base='http://127.0.0.1:4190';
 try{
  let started=false;for(let attempt=0;attempt<45;attempt++){
   if(startupError||server.exitCode!==null)throw new Error('Production server failed to start.');
   try{if((await fetch(`${base}/api/status`,{signal:AbortSignal.timeout(1500)})).ok){started=true;break;}}catch{}
   await new Promise(resolve=>setTimeout(resolve,500));
  }
  assert.ok(started,'Production server must become ready.');
  const post=(url:string,body:unknown,cookie='')=>fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json',Origin:process.env.APP_URL!,Cookie:cookie},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  assert.equal((await fetch(base+'/api/push')).status,401);
  assert.equal((await fetch(base+'/api/history')).status,401);
  assert.equal((await post('/api/auth/demo',{role:'admin'})).status,404);
  assert.equal((await post('/api/auth/register',{})).status,503);
  const login=await post('/api/auth/login',{identifier:email,password});assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie')!;assert.ok(cookie.includes(SESSION_COOKIE+'='));assert.match(cookie,/HttpOnly/i);assert.match(cookie,/Secure/i);assert.match(cookie,/SameSite=lax/i);
  assert.equal((await fetch(base+'/api/admin/users',{headers:{Cookie:cookie.split(';')[0]}})).status,403);
  const worker=await fetch(base+'/sw.js');assert.match(worker.headers.get('cache-control')||'',/no-store/);
  const page=await fetch(base+'/login');assert.ok(!(page.headers.get('content-security-policy')||'').includes('unsafe-eval'));assert.ok(page.headers.get('strict-transport-security'));
  const manifest=await(await fetch(base+'/manifest.webmanifest')).json();assert.equal(manifest.start_url,'/portal');
  console.log('Production HTTP smoke checks passed against disposable PostgreSQL. Live providers and scanner delivery were not tested.');
 }finally{server.kill();await db.close();}
}
void main().catch(error=>{console.error(error.message);process.exitCode=1;});
