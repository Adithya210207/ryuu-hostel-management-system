import {currentUser,rateLimit,sessionToken} from '../../../server/auth';
import {failure,json,readBody,sameOrigin,HttpError} from '../../../server/http';
import {pushEnabled,removeSubscription,saveSubscription,subscriptionStatus,queuePushTest} from '../../../server/push';
export const runtime='nodejs';
export async function GET(request:Request){try{await currentUser(request);return json({configured:pushEnabled(),publicKey:pushEnabled()?process.env.VAPID_PUBLIC_KEY:null});}catch(e){return failure(e);}}
export async function POST(request:Request){try{
 sameOrigin(request);const user=await currentUser(request);await rateLimit(`push:${user.id}`,30,600);const body=await readBody(request),token=sessionToken(request)!;
 if(body.action==='status')return json({enabled:await subscriptionStatus(user,token,String(body.endpoint||''))});
 if(body.action==='disable'){await removeSubscription(user,String(body.endpoint||''));return json({ok:true});}
 if(body.action==='enable'){await saveSubscription(user,token,body.subscription);return json({ok:true});}
 if(body.action==='test'){await rateLimit(`push-test:${user.id}`,3,600);await queuePushTest(user,token,String(body.endpoint||''));return json({ok:true,message:'Test queued. It should arrive shortly.'});}
 throw new HttpError(400,'Unknown notification action.');
}catch(e){return failure(e);}}
