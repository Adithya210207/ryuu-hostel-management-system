import {currentUser} from '../../../server/auth';
import {communicationHistory} from '../../../server/history';
import {failure,json} from '../../../server/http';
import {ensureRuntime} from '../../../server/runtime';
export async function GET(request:Request){try{await ensureRuntime();const user=await currentUser(request,'admin');return json(await communicationHistory(user,new URL(request.url).searchParams));}catch(e){return failure(e);}}
