import test,{after} from 'node:test';
import assert from 'node:assert/strict';
process.env.TEST_DATABASE='memory';process.env.DATABASE_URL='';process.env.DEMO_MODE='true';
import {db} from '../server/db';
import {register,createAccount,createSession,getUser,requestChallenge,verifyChallenge,currentUser} from '../server/auth';
import {updateOwnAccount} from '../server/account';
import {getSnapshot} from '../server/domain';
after(()=>db.close());
const password='Synthetic Password 2026!';
test('all roles edit their own details, preserve role and ID, and keep linked details consistent',async()=>{
 const admission={maritalStatus:'single',nationality:'Indian',idType:'passport',idNumber:'A1234567',currentAddress:'Synthetic address',city:'Bengaluru',state:'Karnataka',pincode:'560034',designation:'B.Sc. 2nd year',officeAddress:'',officeContact:'',monthlyIncome:'',emergencyName:'Synthetic contact',emergencyRelationship:'Aunt',emergencyPhone:'+919000099959',emergencyAddress:'Synthetic town',acPreference:'either',roomType:'four',stayDuration:'6_plus_months',foodType:'veg',parking:'none'};
 const registration=await register({admission,name:'Profile Resident',email:'profile@example.test',phone:'+919000099951',password,dob:'2000-06-15',profession:'student',address:'Synthetic address',guardianName:'Profile Guardian',guardianEmail:'profileguardian@example.test',guardianPhone:'+919000099952',guardianDob:'1970-01-01',guardianProfession:'Teacher',acceptRules:true});
 const resident=registration.user,token=registration.token;
 const guardian=(await getUser((await db.query('SELECT guardian_user_id FROM guardian_links WHERE resident_user_id=$1',[resident.id])).rows[0].guardian_user_id))!;
 const admin=await createAccount({name:'Profile Admin',email:'profileadmin@example.test',phone:'+919000099953',password},'admin');
 const residentId=resident.residentId;
 for(const user of [resident,guardian,admin]){
  const session=user.id===resident.id?token:await createSession(user.id);
  const result=await updateOwnAccount(user,session,{name:`Updated ${user.role}`,profession:'Working',address:'Updated synthetic address',role:'admin',id:'another-account',residentId:'FAKE'});
  assert.equal(result.user?.name,`Updated ${user.role}`);assert.equal(result.user?.role,user.role);assert.equal(result.user?.id,user.id);assert.equal(result.user?.profile?.address,'Updated synthetic address');
 }
 const snapshot=await getSnapshot((await getUser(resident.id))!);
 assert.equal(snapshot.residents[0].name,'Updated resident');assert.equal(snapshot.residents[0].residentNumber,residentId);assert.equal(snapshot.residents[0].guardianName,'Updated guardian');
 await assert.rejects(()=>updateOwnAccount(resident,token,{dob:'2020-01-01'}),/18 years/);
 await assert.rejects(()=>updateOwnAccount(resident,token,{email:'new@example.test'}),/current password/);
 await assert.rejects(()=>updateOwnAccount(resident,token,{email:admin.email,currentPassword:password}));
 assert.equal((await getUser(resident.id))!.email,resident.email);
});
test('contact changes require a password, invalidate old codes/sessions and reset only changed verification',async()=>{
 const user=(await getUser((await db.query("SELECT id FROM accounts WHERE email='profile@example.test'")).rows[0].id))!;
 const token=await createSession(user.id),other=await createSession(user.id);
 await db.query('UPDATE accounts SET phone_verified=TRUE,email_verified=TRUE WHERE id=$1',[user.id]);
 const old=await requestChallenge({purpose:'verify_phone',channel:'whatsapp'},user);assert.ok('developmentCode' in old);
 const result=await updateOwnAccount(user,token,{phone:'+919000099954',currentPassword:password});
 assert.equal(result.user?.phoneVerified,false);assert.equal(result.user?.emailVerified,true);
 await assert.rejects(()=>verifyChallenge({challengeId:old.challengeId,code:old.developmentCode},user),/no longer valid/);
 await assert.rejects(()=>currentUser(new Request('http://localhost',{headers:{cookie:`ryuu_session=${other}`}})),/expired/);
 assert.equal((await currentUser(new Request('http://localhost',{headers:{cookie:`ryuu_session=${token}`}}))).id,user.id);
 const phone=await requestChallenge({purpose:'verify_phone',channel:'whatsapp'},result.user!);assert.ok('developmentCode' in phone);
 await assert.rejects(()=>verifyChallenge({challengeId:phone.challengeId,code:phone.developmentCode}),/different session/);
 const verified=await verifyChallenge({challengeId:phone.challengeId,code:phone.developmentCode},result.user!);assert.equal(verified.user.phoneVerified,true);assert.equal(verified.verificationOnly,true);assert.equal(verified.token,undefined);
 await assert.rejects(()=>requestChallenge({purpose:'login',channel:'whatsapp',identifier:user.phone}),/only for verifying/);
 await assert.rejects(()=>requestChallenge({purpose:'reset_password',channel:'whatsapp',identifier:user.phone}),/only for verifying/);
 await assert.rejects(()=>requestChallenge({purpose:'verify_phone',channel:'whatsapp'}),/sign in/);
});
