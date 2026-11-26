import {currentUser,rateLimit,requireRecentAuthentication} from '../../../server/auth';
import {failure,json,readBody,sameOrigin} from '../../../server/http';
import {ensureRuntime} from '../../../server/runtime';
import {getSnapshot,executeAction} from '../../../server/domain';
export const runtime='nodejs';
export async function GET(request:Request){try{await ensureRuntime();return json(await getSnapshot(await currentUser(request)));}catch(e){return failure(e);}}
export async function POST(request:Request){try{sameOrigin(request);await ensureRuntime();const user=await currentUser(request);await rateLimit(`portal:${user.id}`,150,60);const body=await readBody(request);if(user.role==='admin'&&['settings.update','checkout.refund','bill.adjust'].includes(body.action))await requireRecentAuthentication(request);return json(await executeAction(user,body.action,body.input||{}));}catch(e){return failure(e);}}
