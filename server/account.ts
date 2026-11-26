import {createHash} from 'node:crypto';
import {z} from 'zod';
import {db} from './db';
import {adult,getUser,rateLimit,securityAudit,verifyPassword} from './auth';
import {initializeDomain,type DomainState} from './domain';
import {HttpError} from './http';
import type {DomainUser} from '../shared/domain';

const schema=z.object({
 name:z.string().trim().min(2).max(120).optional(),email:z.email().max(200).optional(),
 phone:z.string().trim().regex(/^\+?[\d\s()-]{10,25}$/).optional(),currentPassword:z.string().max(128).optional(),
 dob:z.string().max(10).optional(),profession:z.string().trim().max(120).optional(),address:z.string().trim().max(2000).optional(),
 organization:z.string().trim().max(200).optional(),emergencyContact:z.string().trim().max(40).optional(),intendedMoveIn:z.string().max(10).optional()
});
const digest=(text:string)=>createHash('sha256').update(text).digest('hex');
function validDate(value:string){const date=new Date(`${value}T00:00:00Z`);return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(+date)&&date.toISOString().slice(0,10)===value;}

export async function updateOwnAccount(user:DomainUser,token:string,input:unknown){
 const values=schema.parse(input);await rateLimit(`account-edit:${user.id}`,12,600);await initializeDomain();
 await db.transaction(async tx=>{
  // Match the domain lock order; lock codes before accounts to serialize verification safely.
  const state=(await tx.query('SELECT data FROM domain_state WHERE id=1 FOR UPDATE')).rows[0].data as DomainState;
  await tx.query('SELECT id FROM auth_challenges WHERE user_id=$1 ORDER BY id FOR UPDATE',[user.id]);
  const row=(await tx.query('SELECT * FROM accounts WHERE id=$1 AND active=TRUE FOR UPDATE',[user.id])).rows[0];
  if(!row)throw new HttpError(401,'Please sign in again.');
  const session=(await tx.query('SELECT user_id FROM auth_sessions WHERE token_hash=$1 AND user_id=$2 AND expires_at>NOW()',[digest(token),user.id])).rows[0];
  if(!session)throw new HttpError(401,'Please sign in again.');
  const name=values.name??row.name,email=values.email?.toLowerCase()??row.email;
  let phone=row.phone;
  if(values.phone!==undefined){const digits=values.phone.replace(/\D/g,'');phone=digits.length===10?`+91${digits}`:`+${digits}`;if(!/^\+[1-9]\d{9,14}$/.test(phone))throw new HttpError(400,'Enter a valid phone number with country code.');}
  const emailChanged=email!==row.email,phoneChanged=phone!==row.phone;
  if((emailChanged||phoneChanged)&&!await verifyPassword(values.currentPassword||'',row.password_hash))throw new HttpError(403,'Enter your current password to change your contact details. Use email password recovery if you have not set one yet.');
  const resident=state.residents.find(r=>r.userId===user.id),profile={...row.profile};
  for(const key of ['dob','profession','address','organization','emergencyContact'] as const)if(values[key]!==undefined)profile[key]=values[key];
  if(profile.dob&&(!validDate(profile.dob)||profile.dob<'1900-01-01'||profile.dob>new Date().toISOString().slice(0,10)))throw new HttpError(400,'Enter a valid date of birth.');
  if(row.role==='resident'&&!adult(values.dob!==undefined?values.dob:profile.dob||resident?.dob||''))throw new HttpError(400,'Residents must be at least 18 years old.');
  if(row.role==='resident'&&values.address!==undefined&&!values.address)throw new HttpError(400,'Enter your permanent address.');
  if(row.role==='resident'&&values.profession!==undefined&&!values.profession)throw new HttpError(400,'Enter your profession.');
  if(values.intendedMoveIn&&(!validDate(values.intendedMoveIn)))throw new HttpError(400,'Enter a valid intended move-in date.');
  const emailVerified=emailChanged?false:row.email_verified,phoneVerified=phoneChanged?false:row.phone_verified;
  await tx.query('UPDATE accounts SET name=$1,email=$2,phone=$3,email_verified=$4,phone_verified=$5,profile=$6 WHERE id=$7',[name,email,phone,emailVerified,phoneVerified,JSON.stringify(profile),user.id]);
  if(emailChanged||phoneChanged){
   await tx.query('UPDATE auth_challenges SET used_at=NOW() WHERE user_id=$1 AND used_at IS NULL',[user.id]);
   await tx.query('DELETE FROM auth_sessions WHERE user_id=$1 AND token_hash<>$2',[user.id,digest(token)]);
  }
  state.actors[user.id]={...user,name,email,phone,emailVerified,phoneVerified,profile};
  if(resident){
   if(resident.name!==name||(values.dob!==undefined&&resident.dob!==values.dob))resident.documentStatus='pending';
   Object.assign(resident,{name,email,phone,updatedAt:new Date().toISOString()});
   for(const key of ['dob','profession','address','organization','emergencyContact','intendedMoveIn'] as const)if(values[key]!==undefined)(resident as any)[key]=values[key];
  }
  if(row.role==='guardian')for(const linked of state.residents.filter(r=>r.guardianUserId===user.id)){
   Object.assign(linked,{guardianName:name,guardianEmail:email,guardianPhone:phone});
   if(values.dob!==undefined)linked.guardianDob=values.dob;
   if(values.profession!==undefined)linked.guardianProfession=values.profession;
  }
  state.revision++;
  await tx.query('UPDATE domain_state SET data=$1,revision=revision+1,updated_at=NOW() WHERE id=1',[JSON.stringify(state)]);
  await securityAudit(user.id,'account.details.update',{fields:Object.keys(values).filter(k=>k!=='currentPassword'),emailChanged,phoneChanged},tx);
 });
 return {user:await getUser(user.id)};
}
