import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { db, dataDirectory, type SqlClient } from './db';
import { HttpError } from './http';
import { securityAudit } from './auth';
import type { DomainUser } from '../shared/domain';
const execute=promisify(execFile);
export const UPLOAD_LIMIT=8*1024*1024;
const aliases:Record<string,string>={resident_aadhaar:'identity',resident_identity:'identity',guardian_aadhaar:'guardian_identity',payment_proof:'payment',payment_qr:'qr',residentDocument:'identity',guardianDocument:'guardian_identity'};
const purposes=['identity','guardian_identity','payment','ticket','message','qr','photo','employment_proof','address_proof','medical'];
export function canonicalPurpose(purpose:string){return aliases[purpose]||purpose;}
const storage=()=>path.join(dataDirectory(),'private-uploads');
let keyPromise:Promise<Buffer>|undefined;
async function encryptionKey(){
  return keyPromise??=(async()=>{
    if(process.env.FILE_ENCRYPTION_KEY){const key=Buffer.from(process.env.FILE_ENCRYPTION_KEY,'base64');if(key.length!==32)throw new Error('FILE_ENCRYPTION_KEY must contain 32 base64-encoded bytes.');return key;}
    if(process.env.NODE_ENV==='production')throw new Error('FILE_ENCRYPTION_KEY is required in production.');
    await mkdir(dataDirectory(),{recursive:true});const file=path.join(dataDirectory(),'development-file-key');
    try{return await readFile(file);}catch{const key=randomBytes(32);await writeFile(file,key,{mode:0o600,flag:'wx'}).catch(()=>{});return readFile(file);}
  })();
}
export function detectMime(bytes:Buffer){
  if(bytes.subarray(0,5).toString()==='%PDF-')return 'application/pdf';
  if(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return 'image/jpeg';
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
  if(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')return 'image/webp';
  throw new HttpError(400,'Upload a valid PDF, PNG, JPEG, or WebP file.');
}
export async function saveUpload(user:DomainUser,file:File,purposeInput:string){
  const purpose=canonicalPurpose(purposeInput);
  if(!purposes.includes(purpose))throw new HttpError(400,'Choose a supported document category.');
  if(purpose==='qr'&&user.role!=='admin')throw new HttpError(403,'Only admins can change the payment QR.');
  if(['identity','guardian_identity'].includes(purpose)&&user.role==='guardian')throw new HttpError(403,'Contact the admin team to replace your identity document.');
  if(file.size<10||file.size>UPLOAD_LIMIT)throw new HttpError(400,'Files must be between 10 bytes and 8 MB.');
  const bytes=Buffer.from(await file.arrayBuffer());const mime=detectMime(bytes);
  if(['identity','guardian_identity'].includes(purpose)&&mime!=='application/pdf')throw new HttpError(400,'Identity documents must be PDF files.');
  if(purpose==='photo'&&!mime.startsWith('image/'))throw new HttpError(400,'Upload the photo as a JPG, PNG or WebP image.');
  if(mime==='application/pdf'&&/\/Encrypt\b/.test(bytes.toString('latin1')))throw new HttpError(400,'Please upload a readable PDF without password protection.');
  const id=randomUUID();await mkdir(storage(),{recursive:true});
  let scanStatus='development_unscanned';
  if(process.env.CLAMSCAN_PATH){
    const temporary=path.join(storage(),`${id}.quarantine`);await writeFile(temporary,bytes,{mode:0o600});
    try{await execute(process.env.CLAMSCAN_PATH,['--no-summary',temporary],{timeout:30000});scanStatus='clean';}
    catch{throw new HttpError(400,'This file could not pass the document security scan. Try another file or contact the admin team.');}
    finally{await unlink(temporary).catch(()=>{});}
  }else if(process.env.NODE_ENV==='production')throw new HttpError(503,'Protected uploads are unavailable until the security scanner is configured.');
  const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',await encryptionKey(),iv);
  const encrypted=Buffer.concat([iv,cipher.update(bytes),cipher.final(),cipher.getAuthTag()]);
  const name=path.basename(file.name).replace(/[\x00-\x1f"<>]/g,'').slice(0,180)||'document';
  try{await db.transaction(async tx=>{
    // Serialize the quota check with the insert, including concurrent uploads.
    await tx.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE',[user.id]);
    const used=Number((await tx.query('SELECT COALESCE(SUM(bytes),0) AS used FROM uploads WHERE owner_id=$1',[user.id])).rows[0].used);
    const configured=Number(process.env.UPLOAD_STORAGE_LIMIT_MB||256);
    const limit=(Number.isFinite(configured)&&configured>=16?Math.min(configured,10240):256)*1024*1024;
    if(used+bytes.length>limit)throw new HttpError(413,'Your account’s document storage limit has been reached. Contact the hostel team.');
    await writeFile(path.join(storage(),`${id}.enc`),encrypted,{mode:0o600,flag:'wx'});
    await tx.query('INSERT INTO uploads(id,owner_id,purpose,name,mime,bytes,digest,scan_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,user.id,purpose,name,mime,bytes.length,createHash('sha256').update(bytes).digest('hex'),scanStatus]);
  });}
  catch(error){await unlink(path.join(storage(),`${id}.enc`)).catch(()=>{});throw error;}
  await securityAudit(user.id,'document.upload',{id,purpose,scanStatus});
  return{id,name,mime,bytes:bytes.length,purpose,scanStatus};
}
export async function assertUpload(id:string,ownerId:string,allowed?:string[],client:SqlClient=db){
  const {rows}=await client.query('SELECT * FROM uploads WHERE id=$1',[id]);const row=rows[0];
  if(!row||row.owner_id!==ownerId)throw new HttpError(400,'The uploaded document was not found for this account.');
  if(allowed?.length&&!allowed.map(canonicalPurpose).includes(row.purpose))throw new HttpError(400,'Upload the document under the correct category.');
  if(row.scan_status!=='clean'&&process.env.NODE_ENV==='production')throw new HttpError(400,'This document has not passed security scanning.');
  return{id:row.id,ownerId:row.owner_id,purpose:row.purpose,name:row.name,mime:row.mime,bytes:row.bytes,scanStatus:row.scan_status};
}
export async function downloadUpload(user:DomainUser,id:string){
  if(!/^[a-f0-9-]{36}$/i.test(id))throw new HttpError(404,'Document not found.');
  const row=(await db.query('SELECT * FROM uploads WHERE id=$1',[id])).rows[0];
  if(!row)throw new HttpError(404,'Document not found.');
  let allowed=user.role==='admin'||row.owner_id===user.id;
  if(!allowed){
    const {getSnapshot}=await import('./domain');const snapshot=await getSnapshot(user);
    if(row.purpose==='qr'&&snapshot.settings.qrDocumentId===id)allowed=true;
    if(row.purpose==='message'&&snapshot.messages.some(m=>m.attachmentId===id))allowed=true;
    if(row.purpose==='ticket'&&snapshot.tickets.some(t=>t.attachmentId===id))allowed=true;
  }
  if(!allowed)throw new HttpError(404,'Document not found.');
  if(process.env.NODE_ENV==='production'&&row.scan_status!=='clean')throw new HttpError(403,'Document security scan is pending.');
  const encrypted=await readFile(path.join(storage(),`${id}.enc`));
  const decipher=createDecipheriv('aes-256-gcm',await encryptionKey(),encrypted.subarray(0,12));decipher.setAuthTag(encrypted.subarray(-16));
  const bytes=Buffer.concat([decipher.update(encrypted.subarray(12,-16)),decipher.final()]);
  await securityAudit(user.id,'document.download',{id,purpose:row.purpose});
  return{bytes,name:row.name,mime:row.mime};
}
