import {currentUser,rateLimit,requireRecentAuthentication} from '../../../server/auth';
import {failure} from '../../../server/http';
import {generateExport} from '../../../server/exports';
import {ensureRuntime} from '../../../server/runtime';
export const runtime='nodejs';
export async function GET(request:Request){try{await ensureRuntime();const user=await currentUser(request,'admin');await requireRecentAuthentication(request);await rateLimit(`export:${user.id}`,10,600);const report=await generateExport(user,new URL(request.url).searchParams);return new Response(new Uint8Array(report.bytes),{headers:{'Content-Type':report.mime,'Content-Disposition':`attachment; filename="ryuu-residents.${report.extension}"`,'Cache-Control':'private, no-store'}});}catch(e){return failure(e);}}
