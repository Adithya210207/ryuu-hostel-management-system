import { createHash, randomBytes, randomInt, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { z } from 'zod';
import { db, type SqlClient } from './db';
import { HttpError } from './http';
import { deliverCode, deliverPhoneVerification } from './providers';
import { welcomeGuardian, welcomeResident } from './welcome';
import {registrationOpen,strictProduction} from './config';
import type { DomainUser } from '../shared/domain';

const scrypt = promisify(scryptCallback);
export const SESSION_COOKIE = process.env.NODE_ENV==='production'?'__Host-ryuu_session':'ryuu_session';
export const demoEnabled = () => !strictProduction() && process.env.DEMO_MODE === 'true';
const digest = (s: string) => createHash('sha256').update(s).digest('hex');
export function normalizePhone(value: string) { const digits = value.replace(/\D/g, ''); return digits.length === 10 ? `+91${digits}` : `+${digits}`; }
export async function hashPassword(password: string) {
  if (password.length < 12 || password.length > 128) throw new HttpError(400, 'Use a password with 12–128 characters.');
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string | null) {
  if (!stored || password.length > 128) return false;
  const [,salt,hex] = stored.split(':');
  if (!salt || !hex) return false;
  const expected = Buffer.from(hex,'hex'); const actual = await scrypt(password,salt,64) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected,actual);
}
export async function securityAudit(userId: string | null, action: string, detail: Record<string, unknown> = {}, client: SqlClient = db) {
  await client.query('INSERT INTO security_audit(user_id,action,detail) VALUES($1,$2,$3)',[userId,action,JSON.stringify(detail)]);
}
export async function rateLimit(key: string, limit = 8, seconds = 600) {
  const { rows } = await db.query(`INSERT INTO rate_limits(key,count,expires_at) VALUES($1,1,NOW() + $2 * INTERVAL '1 second')
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.expires_at<NOW() THEN 1 ELSE rate_limits.count+1 END,
    expires_at=CASE WHEN rate_limits.expires_at<NOW() THEN EXCLUDED.expires_at ELSE rate_limits.expires_at END RETURNING count`,[digest(key),seconds]);
  if (rows[0].count > limit) throw new HttpError(429,'Too many attempts. Please wait before trying again.');
}
async function publicUser(row: any): Promise<DomainUser> {
  const links = row.role === 'guardian' ? (await db.query('SELECT resident_user_id FROM guardian_links WHERE guardian_user_id=$1',[row.id])).rows.map(r=>r.resident_user_id) : undefined;
  return {id:row.id,role:row.role,name:row.name,email:row.email,phone:row.phone,residentId:row.resident_id || undefined,emailVerified:row.email_verified,phoneVerified:row.phone_verified,linkedResidentIds:links,profile:{dob:row.profile?.dob||'',profession:row.profile?.profession||'',address:row.profile?.address||'',organization:row.profile?.organization||'',emergencyContact:row.profile?.emergencyContact||''}};
}
export async function findAccount(identifier: string) {
  const id = identifier.trim().toLowerCase();
  const phone=/^\+?[\d\s()-]{10,25}$/.test(identifier)?normalizePhone(identifier):null;
  const {rows} = await db.query('SELECT * FROM accounts WHERE active=TRUE AND (lower(email)=$1 OR lower(resident_id)=$1 OR phone=$2) LIMIT 1',[id,phone]);
  return rows[0];
}
export async function getUser(id: string) { const {rows}=await db.query('SELECT * FROM accounts WHERE id=$1 AND active=TRUE',[id]); return rows[0] ? publicUser(rows[0]) : null; }
export async function listAccounts() { const {rows} = await db.query('SELECT * FROM accounts ORDER BY created_at'); return Promise.all(rows.map(publicUser)); }
export async function createSession(userId: string) {
  const token=randomBytes(32).toString('base64url');
  await db.query('INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL \'7 days\')',[digest(token),userId]);
  return token;
}
export function sessionToken(request: Request) {
  return request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length+1);
}
export async function currentUser(request: Request, role?: string) {
  const token=sessionToken(request);
  if (!token) throw new HttpError(401,'Please sign in to continue.');
  const {rows}=await db.query('SELECT a.* FROM accounts a JOIN auth_sessions s ON s.user_id=a.id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND a.active=TRUE',[digest(token)]);
  if (!rows[0]) throw new HttpError(401,'Your session expired. Please sign in again.');
  if (role && rows[0].role!==role) throw new HttpError(403,'This action is not available for your account.');
  return publicUser(rows[0]);
}
export async function logout(request: Request) { const token=sessionToken(request); if(token) await db.query('DELETE FROM auth_sessions WHERE token_hash=$1',[digest(token)]); }
export async function signIn(identifier: string, password: string) {
  if(identifier.length>200)throw new HttpError(400,'Enter a valid account identifier.');
  await rateLimit(`login:${identifier.trim().toLowerCase()}`,8,900);
  const account=await findAccount(identifier);
  if(account)await rateLimit(`login-account:${account.id}`,8,900);
  const fake='scrypt:4c69436639615335784165443042797745:'+ '0'.repeat(128);
  if (!await verifyPassword(password,account?.password_hash || fake) || !account) throw new HttpError(401,'The sign-in details did not match.');
  await securityAudit(account.id,'login');
  return { user:await publicUser(account),token:await createSession(account.id) };
}
const accountSchema=z.object({name:z.string().trim().min(2).max(120),email:z.email().max(200),phone:z.string().min(10).max(20),password:z.string().min(12).max(128)});
export function adult(dob: string, now=new Date()) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return false;
  const parsed=new Date(`${dob}T00:00:00Z`);
  if(!Number.isFinite(+parsed)||parsed.toISOString().slice(0,10)!==dob) return false;
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const eighteenth=`${Number(dob.slice(0,4))+18}${dob.slice(4)}`;
  return dob>='1900-01-01'&& eighteenth<=today;
}
export async function createAccount(input: Record<string,any>, role: DomainUser['role'], client: SqlClient=db) {
  const parsed=accountSchema.parse(input);
  const phone=normalizePhone(parsed.phone);
  if(!/^\+[1-9]\d{9,14}$/.test(phone)) throw new HttpError(400,'Enter a valid mobile number with country code.');
  const id=randomUUID();
  let residentNumber:string|null=null;
  if(role==='resident') { const {rows}=await client.query("SELECT nextval('resident_number_seq') AS n"); residentNumber=`JN-${new Date().getFullYear()}-${String(rows[0].n).padStart(4,'0')}`; }
  const passwordHash=await hashPassword(parsed.password);
  await client.query('INSERT INTO accounts(id,role,name,email,phone,password_hash,resident_id,profile) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,role,parsed.name,parsed.email.toLowerCase(),phone,passwordHash,residentNumber,JSON.stringify({dob:input.dob||'',profession:input.profession||'',address:input.address||''})]);
  return {id,role,name:parsed.name,email:parsed.email.toLowerCase(),phone,residentId:residentNumber||undefined,emailVerified:false,phoneVerified:false} as DomainUser;
}
export async function register(input: Record<string,any>) {
  if(!registrationOpen())throw new HttpError(503,'New registrations are not open yet. Please contact the hostel team.');
  if(!adult(input.dob||'')) throw new HttpError(400,'Ryuu registration is for residents aged 18 or above.');
  for(const key of ['address','profession','guardianName','guardianEmail','guardianPhone','guardianDob','guardianProfession']) if(!String(input[key]||'').trim()) throw new HttpError(400,'Complete both resident and guardian details.');
  if(input.acceptRules!==true && input.terms!==true) throw new HttpError(400,'Please accept the declaration.');
  if(!input.admission||typeof input.admission!=='object') throw new HttpError(400,'Please complete the admission form.');
  const {initializeDomain,registerResident}=await import('./domain');await initializeDomain();
  const {resident}=await db.transaction(async tx=>{
    const resident=await createAccount(input,'resident',tx);
    // Existing guardian accounts require admin-mediated verified linking; registration cannot attach itself to them.
    const guardian=await createAccount({name:input.guardianName,email:input.guardianEmail,phone:input.guardianPhone,password:randomBytes(32).toString('base64url'),dob:input.guardianDob,profession:input.guardianProfession},'guardian',tx);
    await tx.query('INSERT INTO guardian_links(resident_user_id,guardian_user_id) VALUES($1,$2)',[resident.id,guardian.id]);
    const state=(await tx.query('SELECT data FROM domain_state WHERE id=1 FOR UPDATE')).rows[0].data;
    const profile=registerResident(state,resident,{...input,organization:input.employer||input.organization});profile.guardianUserId=guardian.id;
    state.actors[guardian.id]=guardian;welcomeResident(state,resident,true);welcomeGuardian(state,guardian,resident.name);state.revision++;
    await tx.query('UPDATE domain_state SET data=$1,revision=revision+1,updated_at=NOW() WHERE id=1',[JSON.stringify(state)]);
    await securityAudit(resident.id,'registration',{},tx);
    return {resident,guardian};
  });
  return {user:resident,token:await createSession(resident.id)};
}
export async function requestChallenge(input: Record<string,any>, user?: DomainUser) {
  const {purpose,identifier,channel}=z.object({purpose:z.enum(['login','verify_email','verify_phone','reset_password']),identifier:z.string().max(200).default(''),channel:z.enum(['email','whatsapp'])}).parse(input);
  if((purpose==='verify_phone'&&channel!=='whatsapp')||(purpose!=='verify_phone'&&channel!=='email'))throw new HttpError(400,'WhatsApp is only for verifying your phone number. Use email for login and recovery.');
  await rateLimit(`challenge:${user?.id||identifier.trim().toLowerCase()}:${purpose}`,4,600);
  let account;
  if(purpose.startsWith('verify_')) { if(!user) throw new HttpError(401,'Please sign in first.'); account=(await db.query('SELECT * FROM accounts WHERE id=$1',[user.id])).rows[0]; }
  else account=await findAccount(identifier);
  if(!account) return {challengeId:randomUUID(),message:'If an account matches, a verification code will be sent.'};
  await rateLimit(`challenge-account:${account.id}`,8,600);
  if(purpose==='verify_email' && channel!=='email') throw new HttpError(400,'Choose email for email verification.');
  const id=randomUUID(); const code=String(randomInt(100000,1000000));
  const {startCommunication,finishCommunication}=await import('./history');
  const destination=channel==='email'?account.email:account.phone;
  const communicationId=await startCommunication({userId:account.id,channel,kind:`verification.${purpose}`,subject:purpose==='reset_password'?'Password reset verification':'Account verification code',body:'A one-time verification code was requested. The code and password-reset secrets are hidden from history.',recipient:destination});
  const simulate = demoEnabled() && !(channel === 'email' && process.env.PREVIEW_REAL_EMAIL === 'true');
  if(simulate)await finishCommunication(communicationId,'simulated');
  else {try{const providerId=purpose==='verify_phone'?await deliverPhoneVerification(destination,code):await deliverCode('email',destination,code);await finishCommunication(communicationId,'accepted',providerId||undefined);}catch(error){const message=error instanceof Error?error.message:'Delivery failed.';await finishCommunication(communicationId,/not configured/i.test(message)?'not_configured':'failed',undefined,message);throw error;}}
  await db.transaction(async tx=>{
    await tx.query('UPDATE auth_challenges SET used_at=NOW() WHERE user_id=$1 AND purpose=$2 AND used_at IS NULL',[account.id,purpose]);
    await tx.query('INSERT INTO auth_challenges(id,user_id,purpose,channel,code_hash,destination_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6,NOW()+INTERVAL \'10 minutes\')',[id,account.id,purpose,channel,digest(`${id}:${code}`),digest(destination)]);
  });
  return {challengeId:id,...(simulate?{developmentCode:code,message:'Local simulation only. No message was sent.'}:{message:'Check your selected channel for the code.'})};
}
export async function verifyChallenge(input: Record<string,any>, user?: DomainUser) {
  const id=String(input.challengeId||'');const code=String(input.code||'');
  await rateLimit(`verify:${id}`,6,600);
  let passwordHash:string|undefined;
  if(input.password) passwordHash=await hashPassword(String(input.password));
  const result=await db.transaction(async tx=>{
    const {rows}=await tx.query('SELECT * FROM auth_challenges WHERE id=$1 FOR UPDATE',[id]); const c=rows[0];
    if(!c||!((c.channel==='email'&&['login','verify_email','reset_password'].includes(c.purpose))||(c.channel==='whatsapp'&&c.purpose==='verify_phone'))||c.used_at||new Date(c.expires_at)<new Date()||c.attempts>=5) return {error:'The code expired or is no longer valid.'};
    if(c.purpose.startsWith('verify_')&&c.user_id!==user?.id) return {error:'This code belongs to a different session.'};
    const account=(await tx.query('SELECT email,phone,active FROM accounts WHERE id=$1 FOR UPDATE',[c.user_id])).rows[0];
    if(!account?.active||!c.destination_hash||c.destination_hash!==digest(c.channel==='email'?account.email:account.phone))return {error:'Your contact details changed. Please request a new code.'};
    if(c.code_hash!==digest(`${id}:${code}`)){await tx.query('UPDATE auth_challenges SET attempts=attempts+1 WHERE id=$1',[id]);return {error:'The verification code did not match.'};}
    if(c.purpose==='reset_password'&&!passwordHash) return {error:'Enter a new password with at least 12 characters.'};
    await tx.query('UPDATE auth_challenges SET used_at=NOW() WHERE id=$1',[id]);
    if(c.purpose==='verify_email'||c.channel==='email') await tx.query('UPDATE accounts SET email_verified=TRUE WHERE id=$1',[c.user_id]);
    if(c.purpose==='verify_phone')await tx.query('UPDATE accounts SET phone_verified=TRUE WHERE id=$1',[c.user_id]);
    if(c.purpose==='reset_password') { await tx.query('UPDATE accounts SET password_hash=$1 WHERE id=$2',[passwordHash,c.user_id]); await tx.query('DELETE FROM auth_sessions WHERE user_id=$1',[c.user_id]); }
    await securityAudit(c.user_id,`challenge.${c.purpose}`,{},tx);
    return {userId:c.user_id,verificationOnly:c.purpose.startsWith('verify_')};
  });
  if(result.error) throw new HttpError(400,result.error);
  const verified=await getUser(result.userId!); if(!verified) throw new HttpError(401,'Account is unavailable.');
  return {user:verified,verificationOnly:result.verificationOnly,token:result.verificationOnly?undefined:await createSession(verified.id)};
}
export async function requireRecentAuthentication(request: Request, password?: string) {
  const user=await currentUser(request,'admin'); const token=sessionToken(request)!;
  if(password) { const row=(await db.query('SELECT password_hash FROM accounts WHERE id=$1',[user.id])).rows[0]; if(!await verifyPassword(password,row.password_hash)) throw new HttpError(401,'Please check your admin password.'); await db.query('UPDATE auth_sessions SET reauthenticated_at=NOW() WHERE token_hash=$1',[digest(token)]); }
  const session=(await db.query('SELECT reauthenticated_at FROM auth_sessions WHERE token_hash=$1',[digest(token)])).rows[0];
  if(Date.now()-new Date(session.reauthenticated_at).getTime()>15*60_000) throw new HttpError(403,'For this sensitive action, sign in again to refresh your admin session.');
  return user;
}
