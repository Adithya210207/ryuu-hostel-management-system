import {productionConfigIssues} from '../server/config';
import {db} from '../server/db';
async function main(){
 Object.assign(process.env,{NODE_ENV:'production'});
 const issues=productionConfigIssues();
 if(issues.length){console.error('Production configuration is incomplete:\n'+issues.map(s=>`- ${s}`).join('\n'));process.exitCode=1;return;}
 if(process.argv.includes('--startup')){console.log('Required production security configuration is present.');return;}
 try{
  const {initializeDomain}=await import('../server/domain');await initializeDomain();
  const {launchReadiness}=await import('../server/readiness');const result=await launchReadiness();
  console.log(result.ready?'Automated launch checks passed. Manual commissioning is still required.':'Launch setup is incomplete.');
  for(const issue of result.issues)console.log(`- ${issue}`);
  console.log('\nManual launch checks:');for(const check of result.manualChecks)console.log(`- ${check}`);
  if(!result.ready)process.exitCode=1;
 }catch{console.error('Production database or readiness check failed. Check server connectivity and configuration.');process.exitCode=1;}
 finally{await db.close();}
}
void main().catch(()=>{console.error('Production preflight could not complete.');process.exitCode=1;});
