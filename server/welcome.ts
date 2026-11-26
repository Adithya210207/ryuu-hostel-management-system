// Welcome emails, queued in the same transaction that creates the accounts.
import {queueEmail} from './extras';
const site=()=>`${(process.env.APP_URL||'').replace(/\/$/,'')}/login`||'/login';
export function welcomeResident(state:any,user:{id:string;name:string;email:string;residentId?:string},hasPassword:boolean){
  queueEmail(state,{userId:user.id,to:user.email,kind:'welcome.resident',subject:'Welcome to Ryuu',text:`Hello ${user.name},\n\nWelcome to Ryuu. Your resident account is ready${user.residentId?` (resident ID ${user.residentId})`:''}.\n\nSign in: ${site()}\n${hasPassword?'Use the password you chose when you signed up.':'To set your password, choose "Forgot password" on the sign-in page and enter this email address. We will email you a code.'}\n\nNext steps:\n1. Verify your email and phone in About / My details.\n2. Choose a bed in Rooms & beds and apply.\n3. The hostel team reviews your application and lets you know in the portal.\n\nQuestions? Reply to this email or call 00000 00000.\n\nRyuu`});
}
export function welcomeGuardian(state:any,guardian:{id:string;name:string;email:string},residentName:string){
  queueEmail(state,{userId:guardian.id,to:guardian.email,kind:'welcome.guardian',subject:'Your Ryuu guardian account',text:`Hello ${guardian.name},\n\nYou have a guardian account at Ryuu for ${residentName}. With it you can see their attendance, outpasses and late returns, and message the hostel team privately.\n\nTo sign in for the first time:\n1. Open ${site()}\n2. Choose "Forgot password" and enter this email address.\n3. Type the code we email you and choose your password.\n\nEvery Sunday evening we will also email you a short weekly update.\n\nRyuu`});
}
