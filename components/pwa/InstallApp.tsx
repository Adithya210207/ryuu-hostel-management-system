'use client';
import {useEffect,useState} from 'react';
type InstallEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
let deferredInstall:InstallEvent|null=null;
export async function registerWorker(){
 if(!('serviceWorker'in navigator)||!window.isSecureContext)throw new Error('Open Ryuu on its secure HTTPS address to enable phone notifications.');
 const registration=await navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'});
 return registration.active?registration:await navigator.serviceWorker.ready;
}
export function RegisterWorker(){useEffect(()=>{registerWorker().catch(()=>{});const before=(event:Event)=>{event.preventDefault();deferredInstall=event as InstallEvent;window.dispatchEvent(new Event('jn-install-ready'));};const done=()=>{deferredInstall=null;};window.addEventListener('beforeinstallprompt',before);window.addEventListener('appinstalled',done);return()=>{window.removeEventListener('beforeinstallprompt',before);window.removeEventListener('appinstalled',done);};},[]);return null;}
export default function InstallApp(){
 const [prompt,setPrompt]=useState<InstallEvent|null>(null),[installed,setInstalled]=useState(false),[ios,setIos]=useState(false),[busy,setBusy]=useState(false),[note,setNote]=useState(''),[secure,setSecure]=useState<boolean|null>(null);
 useEffect(()=>{
  setSecure(window.isSecureContext);
  const media=window.matchMedia('(display-mode: standalone)');const sync=()=>setInstalled(media.matches||Boolean((navigator as Navigator&{standalone?:boolean}).standalone));sync();
  setIos(/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1));
  setPrompt(deferredInstall);const before=()=>setPrompt(deferredInstall);const done=()=>{setInstalled(true);setPrompt(null);};
  window.addEventListener('jn-install-ready',before);window.addEventListener('appinstalled',done);media.addEventListener('change',sync);
  return()=>{window.removeEventListener('jn-install-ready',before);window.removeEventListener('appinstalled',done);media.removeEventListener('change',sync);};
 },[]);
 async function install(){if(!prompt||!secure)return;setBusy(true);try{await prompt.prompt();const result=await prompt.userChoice;if(result.outcome==='dismissed')setNote('You can install later from your browser menu.');}catch{setNote('Use your browser menu to add Ryuu to the Home Screen.');}finally{deferredInstall=null;setPrompt(null);setBusy(false);}}
 if(secure===null)return <div className="jn-device-install"><strong>Ryuu on your Home Screen</strong><p>Checking app installation…</p></div>;
 if(!secure)return <div className="jn-device-install"><strong>Installation needs a secure link</strong><p>This Wi-Fi preview uses HTTP. Open Ryuu through its trusted HTTPS address to install the app and enable phone notifications.</p><p className="jn-device-hint">You can keep using the website here. “Create shortcut” only adds a browser shortcut; it does not enable app installation or phone notifications. The hostel team needs to set up the secure link first.</p></div>;
 return <div className="jn-device-install"><strong>{installed?'Ryuu is on your Home Screen':'Keep Ryuu close'}</strong><p>{installed?'Open your stay like an app, straight from your phone.':ios?'In Safari, tap Share → Add to Home Screen. Open the installed app, sign in and enable phone notifications below.':'Add Ryuu to your Home Screen for quick access to your stay.'}</p>{!installed&&(prompt?<button className="jn-button primary" disabled={busy} onClick={install}>{busy?'Opening…':'Add to Home Screen'}</button>:<p className="jn-device-hint">{ios?'Requires iOS/iPadOS 16.4 or later for push notifications.':'Open this site in Chrome, Edge or another supporting browser, then choose Install app / Add to Home Screen from its menu.'}</p>)}{note&&<p role="status">{note}</p>}</div>;
}
