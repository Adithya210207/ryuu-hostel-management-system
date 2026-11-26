import {SESSION_COOKIE,sessionToken,currentUser,signIn,register,logout,requestChallenge,verifyChallenge,demoEnabled,rateLimit,requireRecentAuthentication} from '../../../../server/auth';
import {failure,json,readBody,sameOrigin,HttpError} from '../../../../server/http';
import {ensureDevelopment,ensureRuntime} from '../../../../server/runtime';
export const runtime='nodejs';
function authenticated(result:any){const response=json({user:result.user});response.cookies.set(SESSION_COOKIE,result.token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:7*86400});return response;}
export async function GET(request:Request,{params}:{params:Promise<{action:string}>}){try{await ensureRuntime();const {action}=await params;if(action==='me'){try{return json({user:await currentUser(request),demoEnabled:demoEnabled()});}catch{return json({user:null,demoEnabled:demoEnabled()});}}throw new HttpError(404,'Not found.');}catch(e){return failure(e);}}
export async function POST(request:Request,{params}:{params:Promise<{action:string}>}){try{
  sameOrigin(request);await ensureRuntime();const {action}=await params;const body=await readBody(request);
  await rateLimit(`auth-global:${request.headers.get('x-real-ip')||'local'}:${action}`,120,600);
  if(action==='login')return authenticated(await signIn(String(body.identifier||''),String(body.password||'')));
  if(action==='register')return authenticated(await register(body));
  if(action==='logout'){await logout(request);const r=json({ok:true});r.cookies.delete(SESSION_COOKIE);return r;}
  if(action==='demo'){if(!demoEnabled())throw new HttpError(404,'Not found.');return authenticated(await ensureDevelopment(body.role));}
  if(action==='challenge'){let user;try{user=await currentUser(request);}catch{}return json(await requestChallenge(body,user));}
  if(action==='verify'){let user;try{user=await currentUser(request);}catch{}const result=await verifyChallenge(body,user);return result.verificationOnly?json({user:result.user}):authenticated(result);}
  if(action==='reauth'){await requireRecentAuthentication(request,body.password);return json({ok:true});}
  if(action==='account'){const user=await currentUser(request);const {updateOwnAccount}=await import('../../../../server/account');return json(await updateOwnAccount(user,sessionToken(request)!,body));}
  if(action==='profile'){const user=await currentUser(request);const {executeAction}=await import('../../../../server/domain');return json(await executeAction(user,'profile.update',{...body,identityDocumentId:body.identityDocumentId||body.residentDocumentId}));}
  throw new HttpError(404,'Not found.');
}catch(e){return failure(e);}}
