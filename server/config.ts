type Environment=Record<string,string|undefined>;
/** Public showcase: a production build that runs with demo accounts, synthetic data and the embedded database. Uploads are off. Never for a real launch. */
export const showcaseMode=()=>process.env.SHOWCASE_MODE==='true';
/** True for a real production launch (production build and not the showcase). */
export const strictProduction=()=>process.env.NODE_ENV==='production'&&!showcaseMode();
export function productionConfigIssues(env:Environment=process.env){
 const issues:string[]=[];
 try{const url=new URL(env.APP_URL||'');if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash||['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new Error();}catch{issues.push('APP_URL must be the final HTTPS origin.');}
 try{const url=new URL(env.DATABASE_URL||'');if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname||!url.pathname.slice(1))throw new Error();}catch{issues.push('DATABASE_URL must point to a PostgreSQL database.');}
 const key=env.FILE_ENCRYPTION_KEY||'';
 if(!/^[A-Za-z0-9+/]{43}=$/.test(key)||Buffer.from(key,'base64').length!==32||new Set(Buffer.from(key,'base64')).size<8)issues.push('FILE_ENCRYPTION_KEY must be a securely generated 32-byte base64 key.');
 if(env.DEMO_MODE!=='false')issues.push('DEMO_MODE must explicitly be false.');
 if(env.SHOWCASE_MODE==='true')issues.push('SHOWCASE_MODE must be off for a real launch.');
 if(env.ALLOW_DEV_DATABASE==='true'||env.TEST_DATABASE)issues.push('Development database overrides are forbidden in production.');
 if(!env.CLAMSCAN_PATH)issues.push('CLAMSCAN_PATH is required for protected uploads.');
 return issues;
}
export function assertProductionConfig(){if(strictProduction()){const issues=productionConfigIssues();if(issues.length)throw new Error(`Production configuration incomplete: ${issues.join(' ')}`);}}
export function registrationOpen(){return !strictProduction()||process.env.REGISTRATION_OPEN==='true';}
export function deliveryConfigIssues(env:Environment=process.env){
 const issues:string[]=[];
 if(!env.GMAIL_USER||!env.GMAIL_APP_PASSWORD)issues.push('Configure the Gmail authentication sender and App Password.');
 if(!env.WHATSAPP_TOKEN||!/^\d+$/.test(env.WHATSAPP_PHONE_ID||'')||!/^v\d+\.\d+$/.test(env.WHATSAPP_API_VERSION||'')||!env.WHATSAPP_AUTH_TEMPLATE)issues.push('Configure WhatsApp phone verification and its approved authentication template.');
 if(env.WEB_PUSH_ENABLED!=='true'||!/^[-_A-Za-z0-9]{87}$/.test(env.VAPID_PUBLIC_KEY||'')||!/^[-_A-Za-z0-9]{43}$/.test(env.VAPID_PRIVATE_KEY||'')||!/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.VAPID_SUBJECT||''))issues.push('Configure phone push notifications and stable VAPID keys with an administrator email contact.');
 if(env.PHONEPE_CLIENT_ID&&(!env.PHONEPE_CLIENT_SECRET||!env.PHONEPE_CLIENT_VERSION))issues.push('PhonePe: set PHONEPE_CLIENT_SECRET and PHONEPE_CLIENT_VERSION as well as PHONEPE_CLIENT_ID.');
 if(env.PHONEPE_CLIENT_ID&&(!env.PHONEPE_WEBHOOK_USERNAME||!env.PHONEPE_WEBHOOK_PASSWORD))issues.push('PhonePe: set PHONEPE_WEBHOOK_USERNAME and PHONEPE_WEBHOOK_PASSWORD to match the webhook in the PhonePe dashboard.');
 return issues;
}
