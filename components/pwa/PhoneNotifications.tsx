'use client';
import {useEffect,useState} from 'react';
import {api,post} from '../portal/api';
import {registerWorker} from './InstallApp';
function bytes(value:string){return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0));}
export default function PhoneNotifications(){
 const [config,setConfig]=useState<{configured:boolean;publicKey:string|null}|null>(null),[supported,setSupported]=useState(false),[enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState(''),[blocked,setBlocked]=useState(false),[insecure,setInsecure]=useState(false);
 useEffect(()=>{let alive=true;
  setInsecure(!window.isSecureContext);
  const capable=window.isSecureContext&&'serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window;setSupported(capable);
  if(capable)setBlocked(Notification.permission==='denied');
  api<{configured:boolean;publicKey:string|null}>('/api/push').then(async result=>{if(!alive)return;setConfig(result);if(!capable)return;const registration=await registerWorker(),sub=await registration.pushManager.getSubscription();if(sub){const status=await post('/api/push',{action:'status',endpoint:sub.endpoint});if(alive)setEnabled(status.enabled);}}).catch(e=>{if(alive)setError(e.message);});
  return()=>{alive=false;};
 },[]);
 async function enable(){
  setBusy(true);setError('');setNotice('');
  try {
   // Request permission directly from the user's tap (required on iPhone).
   const permission=await Notification.requestPermission();setBlocked(permission==='denied');
   if(permission!=='granted'){setNotice('Notifications were not enabled. You can still read every update here.');return;}
   const registration=await registerWorker();const old=await registration.pushManager.getSubscription();
   if(old)await old.unsubscribe();
   const sub=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes(config!.publicKey!)});
   try{await post('/api/push',{action:'enable',subscription:sub.toJSON()});}catch(e){await sub.unsubscribe();throw e;}
   setEnabled(true);setNotice('Phone notifications enabled on this device.');
  }catch(e){setError(e instanceof Error?e.message:'Could not enable phone notifications.');}finally{setBusy(false);}
 }
 async function disable(){setBusy(true);setError('');try{const registration=await registerWorker(),sub=await registration.pushManager.getSubscription();if(sub){await post('/api/push',{action:'disable',endpoint:sub.endpoint});await sub.unsubscribe();}setEnabled(false);setNotice('Phone notifications turned off on this device.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function test(){setBusy(true);setError('');try{const sub=await(await registerWorker()).pushManager.getSubscription();if(!sub)throw new Error('Enable notifications first.');await post('/api/push',{action:'test',endpoint:sub.endpoint});setNotice('Test queued. Allow about 30 seconds for it to arrive.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <div className="jn-device-push"><strong>Phone notifications</strong><p>Get a phone alert for new messages, reminders and updates, even when Ryuu is closed. Private details stay inside your account.</p>{!supported?<p className="jn-device-hint">{insecure?'Phone alerts are unavailable on this HTTP Wi-Fi link. Use the trusted HTTPS address once it is configured. You can still read all updates below.':'Use a supported browser on the secure website. On iPhone, add Ryuu to the Home Screen first and open it from there.'}</p>:<>{!config?<p>Checking availability…</p>:!config.configured?<p className="jn-device-hint">Phone notification setup is pending. Your notification history is available below.</p>:blocked?<p className="jn-device-hint">Notifications are blocked. Allow them in your browser or phone settings, then reopen this page.</p>:<div className="jn-device-actions">{enabled?<><button className="jn-button secondary" disabled={busy} onClick={test}>Send a test notification</button><button className="jn-text-button" disabled={busy} onClick={disable}>Turn off on this device</button></>:<button className="jn-button primary" disabled={busy} onClick={enable}>{busy?'Setting up…':'Enable phone notifications'}</button>}</div>}</>}<p className="jn-device-hint">Signing out stops alerts on this device. Enable them again after signing in. Delivery depends on connectivity and your phone’s notification settings.</p>{notice&&<p role="status">{notice}</p>}{error&&<p className="jn-device-error" role="alert">{error}</p>}</div>;
}
