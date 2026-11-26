import nodemailer from 'nodemailer';
import {phonePeMode} from './phonepe';
import {db} from './db';
export type DeliveryChannel = 'email';
export function providerStatus() {
  return {
    email: process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD ? 'configured_not_verified' : 'not_configured',
    whatsapp_phone_verification: process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID && process.env.WHATSAPP_AUTH_TEMPLATE && process.env.WHATSAPP_API_VERSION ? 'configured_not_verified' : 'not_configured',
    biometric: process.env.DEVICE_INGEST_SECRET ? 'adapter_configured_hardware_untested' : 'not_configured',
    phonepe_payments: (()=>{const m=phonePeMode();return m==='off'?'not_configured':m==='simulated'?'simulated':process.env.PHONEPE_WEBHOOK_USERNAME&&process.env.PHONEPE_WEBHOOK_PASSWORD?`${m}_configured`:`${m}_webhook_missing`;})()
  };
}

// This adapter is called only by the signed-in verify_phone flow, never by login or reminders.
export async function deliverPhoneVerification(destination:string,code:string) {
  const {WHATSAPP_TOKEN:token,WHATSAPP_PHONE_ID:phoneId,WHATSAPP_AUTH_TEMPLATE:template,WHATSAPP_API_VERSION:version}=process.env;
  if(!token||!phoneId||!template||!version)throw new Error('WhatsApp phone verification is not configured.');
  if(!/^v\d+\.\d+$/.test(version)||!/^\d+$/.test(phoneId)||!/^\+\d{10,15}$/.test(destination)||!/^\d{6}$/.test(code))throw new Error('Invalid phone verification configuration.');
  try {
    const response=await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`,{
      method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),
      body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to:destination.replace('+',''),type:'template',
        template:{name:template,language:{code:process.env.WHATSAPP_LANGUAGE||'en_US'},components:[
          {type:'body',parameters:[{type:'text',text:code}]},
          {type:'button',sub_type:'url',index:'0',parameters:[{type:'text',text:code}]}
        ]}})
    });
    if(!response.ok)throw new Error('Provider rejected the request.');
    const data=await response.json();if(!data.messages?.[0]?.id)throw new Error('No provider acceptance.');
    return String(data.messages[0].id);
  } catch {throw new Error('WhatsApp could not send the verification code. Please try again later or contact the hostel team.');}
}
export async function deliverCode(channel: DeliveryChannel, destination: string, code: string) {
  if(channel !== 'email') throw new Error('Only email authentication is supported.');
  const user=process.env.GMAIL_USER?.trim(), password=process.env.GMAIL_APP_PASSWORD?.replace(/\s/g,'');
  if(!user||!password)throw new Error('Gmail authentication email is not configured.');
  const requested=Number(process.env.GMAIL_DAILY_LIMIT||400);
  const limit=Number.isFinite(requested)?Math.max(1,Math.min(450,Math.floor(requested))):400;
  const {rows}=await db.query(`INSERT INTO rate_limits(key,count,expires_at) VALUES('gmail-daily-sends',1,NOW()+INTERVAL '1 day') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.expires_at<NOW() THEN 1 ELSE rate_limits.count+1 END,expires_at=CASE WHEN rate_limits.expires_at<NOW() THEN EXCLUDED.expires_at ELSE rate_limits.expires_at END RETURNING count`);
  if(rows[0].count>limit)throw new Error('Email sending limit reached. Please try again later or contact the hostel team.');
  const transport=nodemailer.createTransport({host:'smtp.gmail.com',port:465,secure:true,auth:{user,pass:password},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,tls:{minVersion:'TLSv1.2'},disableFileAccess:true,disableUrlAccess:true});
  try {
    await transport.sendMail({from:{name:'Ryuu',address:user},to:destination,subject:'Your Ryuu verification code',text:`Your Ryuu code is ${code}. It expires in 10 minutes. Do not share this code. If you did not request it, ignore this email.`});
  } catch {throw new Error('Gmail could not send the code. Please try again later or contact the hostel team.');}
  finally {transport.close();}
}

/** Plain-text email (welcome messages, weekly guardian updates). Shares the Gmail daily limit with login codes. */
export async function sendEmail(destination: string, subject: string, text: string) {
  const user=process.env.GMAIL_USER?.trim(), password=process.env.GMAIL_APP_PASSWORD?.replace(/\s/g,'');
  if(!user||!password)throw new Error('Gmail is not configured.');
  const requested=Number(process.env.GMAIL_DAILY_LIMIT||400);
  const limit=Number.isFinite(requested)?Math.max(1,Math.min(450,Math.floor(requested))):400;
  const {rows}=await db.query(`INSERT INTO rate_limits(key,count,expires_at) VALUES('gmail-daily-sends',1,NOW()+INTERVAL '1 day') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.expires_at<NOW() THEN 1 ELSE rate_limits.count+1 END,expires_at=CASE WHEN rate_limits.expires_at<NOW() THEN EXCLUDED.expires_at ELSE rate_limits.expires_at END RETURNING count`);
  if(rows[0].count>limit)throw new Error('Email sending limit reached for today.');
  const transport=nodemailer.createTransport({host:'smtp.gmail.com',port:465,secure:true,auth:{user,pass:password},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,tls:{minVersion:'TLSv1.2'},disableFileAccess:true,disableUrlAccess:true});
  try { const info=await transport.sendMail({from:{name:'Ryuu',address:user},to:destination,subject,text}); return String(info.messageId||''); }
  catch { throw new Error('Gmail could not send the email.'); }
  finally { transport.close(); }
}
