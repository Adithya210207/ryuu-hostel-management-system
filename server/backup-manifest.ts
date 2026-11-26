import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {readdir,readFile,writeFile,lstat} from 'node:fs/promises';
import path from 'node:path';
async function digest(file:string){const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}
async function files(root:string,directory=''):Promise<string[]>{
 const result:string[]=[];for(const entry of await readdir(path.join(root,directory),{withFileTypes:true})){
  const relative=path.join(directory,entry.name);if(entry.isSymbolicLink())throw new Error('Backups must not contain symbolic links.');
  if(entry.isDirectory())result.push(...await files(root,relative));else if(entry.isFile()&&relative!=='manifest.json')result.push(relative.split(path.sep).join('/'));
 }return result.sort();
}
export async function writeBackupManifest(root:string){
 const entries=[];for(const file of await files(root))entries.push({file,bytes:(await lstat(path.join(root,file))).size,sha256:await digest(path.join(root,file))});
 await writeFile(path.join(root,'manifest.json'),JSON.stringify({version:1,createdAt:new Date().toISOString(),files:entries},null,2),{mode:0o600,flag:'wx'});
}
export async function verifyBackup(root:string){
 const manifest=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));
 if(manifest.version!==1||!Array.isArray(manifest.files)||!manifest.files.some((e:any)=>e.file==='database.dump'))throw new Error('Invalid or incomplete backup manifest.');
 const actual=await files(root),listed=new Set<string>();
 for(const entry of manifest.files){
  if(typeof entry.file!=='string'||entry.file.includes('\\')||entry.file.split('/').some((p:string)=>p==='..'||p==='.'||!p)||path.isAbsolute(entry.file)||entry.file.includes(':')||listed.has(entry.file))throw new Error('Invalid backup file path.');
  listed.add(entry.file);const file=path.resolve(root,entry.file),relative=path.relative(path.resolve(root),file);
  if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error('Backup path escaped its directory.');
  const stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==entry.bytes||await digest(file)!==entry.sha256)throw new Error('Backup integrity check failed.');
 }
 if(actual.length!==listed.size||actual.some(file=>!listed.has(file)))throw new Error('Backup contents differ from the manifest.');
 return {files:actual.length};
}
