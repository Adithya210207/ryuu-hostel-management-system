import {readFile,writeFile} from 'node:fs/promises';
import webpush from 'web-push';

async function main(){
// Keys stay in the ignored environment file; never print them in terminal output.
const subject=process.argv[2];
if(!subject||!/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(subject))throw new Error('Provide the administrator contact: npm run setup:push -- mailto:your-address@gmail.com');
const path='.env.local';
let source=await readFile(path,'utf8').catch(()=>'');
const existing=(key:string)=>source.match(new RegExp(`^${key}=(.*)$`,'m'))?.[1]?.trim();
const publicKey=existing('VAPID_PUBLIC_KEY'),privateKey=existing('VAPID_PRIVATE_KEY');
if(Boolean(publicKey)!==Boolean(privateKey))throw new Error('Incomplete existing push keys. Restore the matching pair before continuing.');
const keys=publicKey&&privateKey?{publicKey,privateKey}:webpush.generateVAPIDKeys();
for(const [key,value] of Object.entries({WEB_PUSH_ENABLED:'true',VAPID_PUBLIC_KEY:keys.publicKey,VAPID_PRIVATE_KEY:keys.privateKey,VAPID_SUBJECT:subject})){
 const line=new RegExp(`^${key}=.*$`,'m');source=line.test(source)?source.replace(line,()=>`${key}=${value}`):source.replace(/\s*$/,'')+`\n${key}=${value}\n`;
}
await writeFile(path,source,{mode:0o600});
console.log('Phone notification configuration saved privately. Restart the website and worker. Keep these keys stable and back them up securely.');

}
void main().catch(error=>{console.error(error.message);process.exitCode=1;});
