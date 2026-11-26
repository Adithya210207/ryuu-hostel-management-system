import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import ExcelJS from 'exceljs';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {writeBackupManifest,verifyBackup} from '../server/backup-manifest';
import {productionConfigIssues,registrationOpen,deliveryConfigIssues} from '../server/config';
import {createInitialState} from '../server/domain';
import {register} from '../server/auth';
const valid={APP_URL:'https://hostel.example.test',DATABASE_URL:'postgres://user:synthetic@localhost/ryuu_test',FILE_ENCRYPTION_KEY:randomBytes(32).toString('base64'),DEMO_MODE:'false',CLAMSCAN_PATH:'/usr/bin/clamscan'};
test('production rejects missing security settings, insecure origins and development databases',()=>{
 assert.deepEqual(productionConfigIssues(valid),[]);
 for(const [key,value] of Object.entries({APP_URL:'http://localhost:3000',DATABASE_URL:'file:local',FILE_ENCRYPTION_KEY:Buffer.alloc(32).toString('base64'),DEMO_MODE:'true',CLAMSCAN_PATH:'',ALLOW_DEV_DATABASE:'true',TEST_DATABASE:'memory'}))assert.ok(productionConfigIssues({...valid,[key]:value}).length,key);
 assert.ok(deliveryConfigIssues({}).length>=3);
});
test('production has no synthetic inventory and refuses registration until explicitly opened',async()=>{
 const before={NODE_ENV:process.env.NODE_ENV,REGISTRATION_OPEN:process.env.REGISTRATION_OPEN};
 try{Object.assign(process.env,{NODE_ENV:'production',REGISTRATION_OPEN:'false'});assert.equal(registrationOpen(),false);assert.equal(createInitialState().rooms.length,0);assert.equal(createInitialState().demo,false);await assert.rejects(()=>register({}),/not open yet/);process.env.REGISTRATION_OPEN='true';assert.equal(registrationOpen(),true);}
 finally{for(const [key,value] of Object.entries(before))if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
test('Excel export dependency update retains readable workbooks and literal user text',async()=>{
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Residents');sheet.addRow(['Resident','Note']);sheet.addRow(['JN-2026-0001','=HYPERLINK("https://example.test","literal text")']);
 const bytes=await book.xlsx.writeBuffer(),read=new ExcelJS.Workbook();await read.xlsx.load(bytes);
 assert.equal(read.worksheets[0].getCell('A2').value,'JN-2026-0001');assert.equal(read.worksheets[0].getCell('B2').type,ExcelJS.ValueType.String);
});
test('backup verification detects corruption, extra files and unsafe manifest paths',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'ryuu-backup-test-'));
 try{
  await mkdir(path.join(root,'encrypted-files'));await writeFile(path.join(root,'database.dump'),'synthetic dump');await writeFile(path.join(root,'encrypted-files','fixture.enc'),'encrypted fixture');
  await writeBackupManifest(root);assert.equal((await verifyBackup(root)).files,2);
  await writeFile(path.join(root,'database.dump'),'corrupted dump');await assert.rejects(()=>verifyBackup(root),/integrity/);await writeFile(path.join(root,'database.dump'),'synthetic dump');
  await writeFile(path.join(root,'unexpected.txt'),'extra');await assert.rejects(()=>verifyBackup(root),/differ/);await rm(path.join(root,'unexpected.txt'));
  const manifest=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));manifest.files.push({file:'../outside',bytes:0,sha256:''});await writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest));await assert.rejects(()=>verifyBackup(root),/Invalid backup file path/);
 }finally{
  // mkdtemp creates this exact disposable child; never remove a caller-supplied path.
  if(path.dirname(root)===path.resolve(os.tmpdir())&&path.basename(root).startsWith('ryuu-backup-test-'))await rm(root,{recursive:true,force:true});
 }
});
