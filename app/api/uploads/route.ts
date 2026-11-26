import {currentUser,rateLimit} from '../../../server/auth';
import {failure,json,sameOrigin,HttpError,readLimited} from '../../../server/http';
import {saveUpload,UPLOAD_LIMIT} from '../../../server/uploads';
export const runtime='nodejs';
export async function POST(request:Request){try{sameOrigin(request);const user=await currentUser(request);await rateLimit(`upload:${user.id}`,30,3600);const bytes=await readLimited(request,UPLOAD_LIMIT+10000);const form=await new Request(request.url,{method:'POST',headers:{'Content-Type':request.headers.get('content-type')||''},body:bytes}).formData();const file=form.get('file');if(!(file instanceof File))throw new HttpError(400,'Choose a file.');return json(await saveUpload(user,file,String(form.get('purpose')||'')));}catch(e){return failure(e);}}
