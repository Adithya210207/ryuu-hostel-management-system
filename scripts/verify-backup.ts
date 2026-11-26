import path from 'node:path';
import {verifyBackup} from '../server/backup-manifest';
async function main(){if(!process.argv[2])throw new Error('Specify the backup folder.');const result=await verifyBackup(path.resolve(process.argv[2]));console.log(`Backup checksums match for ${result.files} files. This is not a database restore test.`);}
void main().catch(error=>{console.error(error.message);process.exitCode=1;});
