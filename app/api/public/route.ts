import {db} from '../../../server/db';
import {initializeDomain,submitVisitRequest} from '../../../server/domain';
import {publicExtras} from '../../../server/extras';
import {rateLimit} from '../../../server/auth';
import {failure,json,readBody,sameOrigin,HttpError} from '../../../server/http';
export async function GET(){try{await initializeDomain();const state=(await db.query('SELECT data FROM domain_state WHERE id=1')).rows[0].data;const s=state.settings;return json({hostelName:s.hostelName,address:s.address,phone:s.phone,email:s.email,openingDate:s.openingDate,...publicExtras(state)});}catch(e){return failure(e);}}
/** Homepage "Book a visit" form. */
export async function POST(request:Request){try{
  sameOrigin(request);const body=await readBody(request);if(body.action!=='visit')throw new HttpError(400,'Unknown request.');
  const ip=(request.headers.get('x-forwarded-for')||'local').split(',')[0].trim().slice(0,64);await rateLimit(`visit-request:${ip}`,5,3600);
  if(typeof body.website==='string'&&body.website)return json({ok:true}); // honeypot field: bots fill it, people never see it
  await submitVisitRequest(body);return json({ok:true,message:'Thank you. The hostel team will call you to confirm your visit.'},201);
}catch(e){return failure(e);}}
