// PhonePe server-to-server notification. Authenticated with SHA256(username:password);
// the result is then re-checked with PhonePe's Order Status API before anything is recorded.
import {json} from '../../../../../server/http';
import {recordGatewayResult} from '../../../../../server/domain';
import {checkoutStatus,webhookAuthorised} from '../../../../../server/phonepe';
import {ensureRuntime} from '../../../../../server/runtime';
export const runtime='nodejs';
export async function POST(request:Request){
  if(!webhookAuthorised(request.headers.get('authorization')))return json({error:'Unauthorised'},401);
  let body:any={};try{body=JSON.parse(new TextDecoder().decode(await request.arrayBuffer()).slice(0,200_000));}catch{return json({ok:true});}
  const event=String(body?.event||'');const merchantOrderId=String(body?.payload?.merchantOrderId||'');
  if(!/^checkout\.order\./.test(event)||!/^[A-Za-z0-9_-]{1,63}$/.test(merchantOrderId))return json({ok:true});
  try{await ensureRuntime();await recordGatewayResult(merchantOrderId,await checkoutStatus(merchantOrderId));}
  catch{console.error('[Ryuu] PhonePe webhook could not be processed; the background check will retry.');}
  return json({ok:true});
}
