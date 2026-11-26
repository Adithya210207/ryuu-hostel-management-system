import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {currentUser,rateLimit,securityAudit} from '../../../server/auth';
import {failure,json,sameOrigin} from '../../../server/http';
import {systemHealth} from '../../../server/health';
import {ensureRuntime} from '../../../server/runtime';
const execute=promisify(execFile);
export const runtime='nodejs';
export async function GET(request:Request){try{await ensureRuntime();await currentUser(request,'admin');return json(await systemHealth());}catch(e){return failure(e);}}
export async function POST(request:Request){try{sameOrigin(request);await ensureRuntime();const user=await currentUser(request,'admin');await rateLimit('health-test-global',2,300);const start=Date.now();let output='';let passed=false;try{const result=await execute(process.execPath,['--import','tsx','--test','--test-concurrency=1','tests/domain.test.ts','tests/security.test.ts','tests/history.test.ts','tests/push.test.ts','tests/pwa.test.ts','tests/account.test.ts','tests/production.test.ts'],{cwd:process.cwd(),timeout:60000,maxBuffer:128000,env:{...process.env,NODE_ENV:'test',DATABASE_URL:'',TEST_DATABASE:'memory',DEMO_MODE:'false',DATA_DIR:'.data/health-synthetic',WHATSAPP_TOKEN:'',GMAIL_USER:'',GMAIL_APP_PASSWORD:'',WEB_PUSH_ENABLED:'false',VAPID_PRIVATE_KEY:'',FILE_ENCRYPTION_KEY:''}});output=result.stdout;passed=true;}catch(error){const e=error as {stdout?:string;stderr?:string};output=e.stdout||e.stderr||'The isolated suite could not be started.';}await securityAudit(user.id,'health.synthetic-test',{passed});return json({...await systemHealth(),testRun:{passed,output:output.slice(-18000),durationMs:Date.now()-start}});}catch(e){return failure(e);}}
