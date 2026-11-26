import {randomBytes} from 'node:crypto';
import {currentUser,listAccounts,createAccount,requireRecentAuthentication,securityAudit,adult,rateLimit} from '../../../../server/auth';
import {failure,json,readBody,sameOrigin,HttpError} from '../../../../server/http';
import {db} from '../../../../server/db';
import {registerResident,applyAction,attachGuardian} from '../../../../server/domain';
import type {DomainUser} from '../../../../shared/domain';
import {ensureRuntime} from '../../../../server/runtime';
import {welcomeGuardian,welcomeResident} from '../../../../server/welcome';
export async function GET(request:Request){try{await ensureRuntime();await currentUser(request,'admin');return json({users:await listAccounts()});}catch(e){return failure(e);}}
export async function POST(request:Request){try{
  sameOrigin(request);await ensureRuntime();const actor=await requireRecentAuthentication(request);await rateLimit(`create-user:${actor.id}`,30,3600);const body=await readBody(request);
  if(body.role==='guardian')return await createGuardian(actor,body);
  if(!['admin','resident'].includes(body.role))throw new HttpError(400,'Choose an admin, resident or guardian account.');
  if(body.role==='resident'&&!adult(body.dob||''))throw new HttpError(400,'The resident must be at least 18 years old.');
  const user=await db.transaction(async tx=>{
    const state=(await tx.query('SELECT data FROM domain_state WHERE id=1 FOR UPDATE')).rows[0].data;
    const user=await createAccount({...body,password:body.password||randomBytes(32).toString('base64url')},body.role,tx);state.actors[user.id]=user;
    if(user.role==='resident'){
      const profile=registerResident(state,user,{...body,organization:body.employer||body.organization});welcomeResident(state,user,Boolean(body.password));
      let guardianId:string|undefined;
      if(body.guardianUserId){
        const guardian=(await tx.query('SELECT id FROM accounts WHERE id=$1 AND role=\'guardian\' AND active=TRUE',[body.guardianUserId])).rows[0];
        if(!guardian)throw new HttpError(400,'Select a valid guardian account.');guardianId=guardian.id;
      }else if(body.guardianEmail&&body.guardianPhone){
        const guardian=await createAccount({name:body.guardianName,email:body.guardianEmail,phone:body.guardianPhone,password:randomBytes(32).toString('base64url'),dob:body.guardianDob,profession:body.guardianProfession},'guardian',tx);
        state.actors[guardian.id]=guardian;guardianId=guardian.id;welcomeGuardian(state,guardian,user.name);
      }
      if(guardianId){await tx.query('INSERT INTO guardian_links(resident_user_id,guardian_user_id) VALUES($1,$2)',[user.id,guardianId]);profile.guardianUserId=guardianId;}
      if(body.mode==='existing'&&body.bedId)applyAction(state,actor,'resident.admitExisting',{residentId:user.id,bedId:body.bedId,moveInDate:body.moveInDate,openingBalancePaise:body.openingBalancePaise||0,reason:body.reason||'Existing resident account created by admin.'});
    }
    state.revision++;await tx.query('UPDATE domain_state SET data=$1,revision=revision+1,updated_at=NOW() WHERE id=1',[JSON.stringify(state)]);
    await securityAudit(actor.id,'account.create',{createdUserId:user.id,role:user.role},tx);return user;
  });
  return json({user,message:body.password?'Account created. Contact verification is still required.':'Account created. The account holder can use the password setup / reset OTP flow to choose their password.'},201);
}catch(e){return failure(e);}}

// A guardian account always belongs to a resident: the admin either creates a new guardian
// or links an existing one (for example, a parent of two residents). Guardians never get a
// password from the admin; they set their own with the emailed code ("Forgot password").
async function createGuardian(actor:DomainUser,body:Record<string,any>){
  const residentId=String(body.residentId||'');if(!residentId)throw new HttpError(400,'Choose the resident this guardian belongs to.');
  const relationship=String(body.guardianRelationship||'').trim().slice(0,100);
  const result=await db.transaction(async tx=>{
    const state=(await tx.query('SELECT data FROM domain_state WHERE id=1 FOR UPDATE')).rows[0].data;
    if(!state.residents.some((r:any)=>r.id===residentId))throw new HttpError(404,'Resident not found.');
    let guardian:{id:string;name:string;email:string;phone:string;dob?:string;profession?:string};let created=false;
    if(body.guardianUserId){
      const row=(await tx.query('SELECT * FROM accounts WHERE id=$1 AND role=\'guardian\' AND active=TRUE',[body.guardianUserId])).rows[0];
      if(!row)throw new HttpError(400,'Select a valid guardian account.');
      const profile=typeof row.profile==='string'?JSON.parse(row.profile||'{}'):row.profile||{};
      guardian={id:row.id,name:row.name,email:row.email,phone:row.phone,dob:profile.dob,profession:profile.profession};
    }else{
      for(const key of ['guardianName','guardianEmail','guardianPhone'])if(!String(body[key]||'').trim())throw new HttpError(400,'Enter the guardian’s name, email and phone.');
      const account=await createAccount({name:body.guardianName,email:body.guardianEmail,phone:body.guardianPhone,password:randomBytes(32).toString('base64url'),dob:body.guardianDob,profession:body.guardianProfession},'guardian',tx);
      state.actors[account.id]=account;created=true;welcomeGuardian(state,account,state.residents.find((r:any)=>r.id===residentId)?.name||'a resident');
      guardian={id:account.id,name:account.name,email:account.email,phone:account.phone,dob:body.guardianDob,profession:body.guardianProfession};
    }
    await tx.query('INSERT INTO guardian_links(resident_user_id,guardian_user_id) VALUES($1,$2) ON CONFLICT(resident_user_id) DO UPDATE SET guardian_user_id=EXCLUDED.guardian_user_id',[residentId,guardian.id]);
    attachGuardian(state,actor,residentId,guardian,relationship);
    state.revision++;await tx.query('UPDATE domain_state SET data=$1,revision=revision+1,updated_at=NOW() WHERE id=1',[JSON.stringify(state)]);
    await securityAudit(actor.id,created?'account.create':'guardian.link',{createdUserId:guardian.id,role:'guardian',residentId},tx);
    return {guardian,created};
  });
  return json({user:result.guardian,message:result.created?'Guardian account created and linked. The guardian sets their own password with the emailed code: on the login page, choose “Forgot password” and enter their email.':'Guardian linked to this resident.'},201);
}
