// After PhonePe sends the resident back: ask PhonePe for the real result and record it.
import {currentUser,rateLimit} from '../../../../../server/auth';
import {failure,json,readBody,sameOrigin,HttpError} from '../../../../../server/http';
import {gatewayOrderFor,recordGatewayResult} from '../../../../../server/domain';
import {checkoutStatus} from '../../../../../server/phonepe';
import {ensureRuntime} from '../../../../../server/runtime';
export const runtime='nodejs';
export async function POST(request:Request){try{
  sameOrigin(request);await ensureRuntime();const user=await currentUser(request);await rateLimit(`phonepe-status:${user.id}`,30,600);
  const {merchantOrderId}=await readBody(request);if(typeof merchantOrderId!=='string'||!/^[A-Za-z0-9_-]{1,63}$/.test(merchantOrderId))throw new HttpError(400,'Unknown payment.');
  const order=await gatewayOrderFor(user,merchantOrderId);
  if(order.state==='COMPLETED'||order.state==='FAILED')return json({state:order.state,amountPaise:order.amountPaise});
  const result=await checkoutStatus(merchantOrderId);const state=await recordGatewayResult(merchantOrderId,result);
  return json({state,amountPaise:order.amountPaise});
}catch(e){return failure(e);}}
