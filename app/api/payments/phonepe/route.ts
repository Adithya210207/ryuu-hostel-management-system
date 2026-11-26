// Resident starts a PhonePe payment for a bill. Returns the PhonePe page to open.
import {currentUser,rateLimit} from '../../../../server/auth';
import {failure,json,readBody,sameOrigin,HttpError} from '../../../../server/http';
import {setGatewayCheckout,startGatewayOrder} from '../../../../server/domain';
import {createCheckout} from '../../../../server/phonepe';
import {ensureRuntime} from '../../../../server/runtime';
export const runtime='nodejs';
export async function POST(request:Request){try{
  sameOrigin(request);await ensureRuntime();const user=await currentUser(request,'resident');await rateLimit(`phonepe-start:${user.id}`,10,600);
  const {billId}=await readBody(request);if(typeof billId!=='string')throw new HttpError(400,'Choose a bill.');
  const order=await startGatewayOrder(user,billId);
  const origin=(process.env.APP_URL||new URL(request.url).origin).replace(/\/$/,'');
  try{
    const checkout=await createCheckout({...order,redirectUrl:`${origin}/portal?view=payments&phonepe=${order.merchantOrderId}`});
    await setGatewayCheckout(order.merchantOrderId,{phonepeOrderId:checkout.orderId});
    return json({merchantOrderId:order.merchantOrderId,checkoutUrl:checkout.checkoutUrl});
  }catch(error){await setGatewayCheckout(order.merchantOrderId,{error:(error as Error).message});throw new HttpError(502,(error as Error).message);}
}catch(e){return failure(e);}}
