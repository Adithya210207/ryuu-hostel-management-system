import {currentUser} from '../../../../server/auth';
import {failure} from '../../../../server/http';
import {downloadUpload} from '../../../../server/uploads';
export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{const user=await currentUser(request);const file=await downloadUpload(user,(await params).id);return new Response(new Uint8Array(file.bytes),{headers:{'Content-Type':file.mime,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}catch(e){return failure(e);}}
