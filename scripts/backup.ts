import {spawn} from 'node:child_process';
import {mkdir,copyFile,writeFile,readdir,rename} from 'node:fs/promises';
import path from 'node:path';
import {dataDirectory} from '../server/db';
import {writeBackupManifest,verifyBackup} from '../server/backup-manifest';
async function main(){
  if(!process.env.DATABASE_URL)throw new Error('Production backup requires DATABASE_URL. For a local preview, stop the server and copy .data to a safe folder.');
  if(process.env.BACKUP_WRITES_PAUSED!=='true')throw new Error('Stop the web and worker services first, then run the backup with BACKUP_WRITES_PAUSED=true.');
  const root=path.resolve(process.env.BACKUP_DIR||'backups'),name=new Date().toISOString().replace(/[:.]/g,'-');
  const target=path.join(root,`${name}.incomplete`),complete=path.join(root,name);await mkdir(target,{recursive:true,mode:0o700});
  const connection=new URL(process.env.DATABASE_URL);
  await new Promise<void>((resolve,reject)=>{const child=spawn('pg_dump',['--format=custom','--file',path.join(target,'database.dump')],{shell:false,env:{...process.env,PGHOST:connection.hostname,PGPORT:connection.port||'5432',PGDATABASE:connection.pathname.slice(1),PGUSER:decodeURIComponent(connection.username),PGPASSWORD:decodeURIComponent(connection.password),...(connection.searchParams.get('sslmode')?{PGSSLMODE:connection.searchParams.get('sslmode')!}:{})}});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('pg_dump failed.')));});
  const source=path.join(dataDirectory(),'private-uploads');await mkdir(path.join(target,'encrypted-files'),{mode:0o700});
  const entries=await readdir(source,{withFileTypes:true}).catch((error:NodeJS.ErrnoException)=>{if(error.code==='ENOENT')return [];throw error;});
  for(const entry of entries)if(entry.isFile()&&/^[a-f0-9-]{36}\.enc$/i.test(entry.name))await copyFile(path.join(source,entry.name),path.join(target,'encrypted-files',entry.name));
  await writeFile(path.join(target,'README.txt'),'Database dump and encrypted files. Encryption keys are intentionally excluded. Keep keys separately. Pause writes during a coordinated backup, or use database/file snapshot procedures. A backup is not verified until restored.\n');
  await writeBackupManifest(target);await verifyBackup(target);await rename(target,complete);
  console.log(`Backup saved and checksums verified at ${complete}. Transfer it to separate protected storage and perform a restore test. Restart web and worker services.`);
}
void main().catch(error=>{console.error(error.message);process.exit(1);});
