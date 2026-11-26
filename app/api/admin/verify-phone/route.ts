// Admin confirms a resident's phone number after calling them. Used while WhatsApp verification is not set up.
import {currentUser,rateLimit,securityAudit} from '../../../../server/auth';
import {failure,json,readBody,sameOrigin,HttpError} from '../../../../server/http';
import {db} from '../../../../server/db';
import {markPhoneVerified} from '../../../../server/domain';
import {ensureRuntime} from '../../../../server/runtime';
export async function POST(request:Request){try{
  sameOrigin(request);await ensureRuntime();const admin=await currentUser(request,'admin');await rateLimit(`verify-phone:${admin.id}`,60,3600);
  const {userId}=await readBody(request);if(typeof userId!=='string'||!userId)throw new HttpError(400,'Choose a resident.');
  const account=(await db.query("SELECT id,role FROM accounts WHERE id=$1 AND active=TRUE AND role IN ('resident','guardian')",[userId])).rows[0];if(!account)throw new HttpError(404,'Account not found.');
  await db.query('UPDATE accounts SET phone_verified=TRUE WHERE id=$1',[userId]);
  await markPhoneVerified(admin,userId);await securityAudit(admin.id,'contact.confirmPhone',{userId});
  return json({ok:true});
}catch(e){return failure(e);}}
