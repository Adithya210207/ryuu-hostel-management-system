import {createHmac,timingSafeEqual} from 'node:crypto';
import {failure,json,HttpError,readLimited} from '../../../../server/http';
import {recordDeviceEvent} from '../../../../server/domain';
import {ensureRuntime} from '../../../../server/runtime';
import {rateLimit} from '../../../../server/auth';
export const runtime='nodejs';
export async function POST(request:Request){try{
  const secret=process.env.DEVICE_INGEST_SECRET;if(!secret)throw new HttpError(503,'Biometric event adapter is not configured.');
  await rateLimit('device-ingest',300,60);const timestamp=request.headers.get('x-ryuu-timestamp')||'';
  if(!/^\d{13}$/.test(timestamp)||Math.abs(Date.now()-Number(timestamp))>300000)throw new HttpError(401,'Invalid device timestamp.');
  const text=new TextDecoder().decode(await readLimited(request,10000));
  const signature=Buffer.from(request.headers.get('x-ryuu-signature')||'','hex');const expected=createHmac('sha256',secret).update(`${timestamp}.${text}`).digest();
  if(signature.length!==expected.length||!timingSafeEqual(signature,expected))throw new HttpError(401,'Invalid device signature.');
  await ensureRuntime();return json(await recordDeviceEvent(JSON.parse(text)));
}catch(e){return failure(e);}}
