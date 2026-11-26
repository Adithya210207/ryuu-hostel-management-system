import test,{after} from 'node:test';
import assert from 'node:assert/strict';
process.env.TEST_DATABASE='memory';
process.env.DATABASE_URL='';
process.env.DEMO_MODE='false';
import {adult,hashPassword,verifyPassword,createAccount,signIn,currentUser,rateLimit} from '../server/auth';
import {sameOrigin} from '../server/http';
import {detectMime} from '../server/uploads';
import {db} from '../server/db';
import {executeAction} from '../server/domain';
import type {DomainUser} from '../shared/domain';
after(async()=>{await db.close();});
test('18th birthday boundary and invalid date rejection',()=>{const now=new Date('2026-09-16T10:00:00Z');assert.equal(adult('2008-09-16',now),true);assert.equal(adult('2008-09-17',now),false);assert.equal(adult('2000-02-31',now),false);assert.equal(adult('2090-01-01',now),false);});
test('passwords are salted and verified without retaining plaintext',async()=>{const password='A secure sample password 123!';const first=await hashPassword(password);const second=await hashPassword(password);assert.notEqual(first,second);assert.equal(await verifyPassword(password,first),true);assert.equal(await verifyPassword('incorrect',first),false);assert.equal(first.includes(password),false);});
test('cross-origin mutation is rejected',()=>{assert.throws(()=>sameOrigin(new Request('http://127.0.0.1:4174/api/portal',{method:'POST',headers:{origin:'https://attacker.example'}})),/website/);});
test('phone preview allows only its explicit LAN origin and never enables it in production',()=>{
 const before={NODE_ENV:process.env.NODE_ENV,APP_URL:process.env.APP_URL,DEV_LAN_ORIGIN:process.env.DEV_LAN_ORIGIN};
 const request=(origin:string)=>new Request('http://localhost/api/portal',{method:'POST',headers:{origin}});
 try{
  Object.assign(process.env,{NODE_ENV:'development',APP_URL:'http://127.0.0.1:4174',DEV_LAN_ORIGIN:'http://192.168.0.107:4174'});
  assert.doesNotThrow(()=>sameOrigin(request('http://192.168.0.107:4174')));assert.doesNotThrow(()=>sameOrigin(request('http://127.0.0.1:4174')));
  assert.throws(()=>sameOrigin(request('http://192.168.0.108:4174')),/website/);assert.throws(()=>sameOrigin(request('http://192.168.0.107:9999')),/website/);
  Object.assign(process.env,{NODE_ENV:'production'});assert.throws(()=>sameOrigin(request('http://192.168.0.107:4174')),/website/);
 }finally{for(const [key,value] of Object.entries(before))if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
test('uploaded extension cannot disguise executable HTML as PDF',()=>{assert.throws(()=>detectMime(Buffer.from('<html>bad file.pdf</html>')),/valid PDF/);assert.equal(detectMime(Buffer.from('%PDF-1.4\nsynthetic')),'application/pdf');});
test('resident role cannot access admin endpoints and sessions persist server-side',async()=>{const user=await createAccount({name:'Synthetic Resident',email:'security@example.test',phone:'+919000099991',password:'Synthetic Password 2026!'},'resident');const login=await signIn(user.email,'Synthetic Password 2026!');const request=new Request('http://localhost/api/health',{headers:{cookie:`ryuu_session=${login.token}`}});assert.equal((await currentUser(request)).id,user.id);await assert.rejects(()=>currentUser(request,'admin'),/not available/);await assert.rejects(()=>currentUser(new Request('http://localhost')),/sign in/);});
test('rate limits survive between calls',async()=>{await rateLimit('security-test',1,60);await assert.rejects(()=>rateLimit('security-test',1,60),/Too many/);});
test('legacy profile endpoint cannot bypass verified account and guardian details',async()=>{
 const user={id:'synthetic-resident',role:'resident'} as DomainUser;
 for(const field of ['name','dob','guardianPhone','guardianEmail','phone','role'])await assert.rejects(()=>executeAction(user,'profile.update',{[field]:'replacement'}),/About \/ My details/);
});
