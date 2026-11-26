import {currentUser,rateLimit} from '../../../../server/auth';
import {failure} from '../../../../server/http';
import {generateReceipt} from '../../../../server/receipts';
import {ensureRuntime} from '../../../../server/runtime';
export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{
  await ensureRuntime();const user=await currentUser(request);await rateLimit(`receipt:${user.id}`,30,600);const {id}=await params;
  const receipt=await generateReceipt(user,id);
  return new Response(new Uint8Array(receipt.bytes),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${receipt.filename}"`,'Cache-Control':'private, no-store'}});
}catch(e){return failure(e);}}
