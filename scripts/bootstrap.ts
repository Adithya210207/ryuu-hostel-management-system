import {createAccount,securityAudit} from '../server/auth';
import {db} from '../server/db';
async function main(){
  const user=await db.transaction(async tx=>{
    await tx.query('LOCK TABLE accounts IN EXCLUSIVE MODE');
    const count=(await tx.query("SELECT COUNT(*) AS count FROM accounts WHERE role='admin' AND active=TRUE")).rows[0].count;
    if(Number(count)>0)throw new Error('An admin already exists. Create additional admins through the authenticated portal.');
    const user=await createAccount({name:process.env.BOOTSTRAP_ADMIN_NAME,email:process.env.BOOTSTRAP_ADMIN_EMAIL,phone:process.env.BOOTSTRAP_ADMIN_PHONE,password:process.env.BOOTSTRAP_ADMIN_PASSWORD},'admin',tx);
    await securityAudit(user.id,'admin.bootstrap',{},tx);return user;
  });
  console.log(`Created first admin: ${user.email}. No default password is stored in source.`);await db.close();
}
void main().catch(error=>{console.error(error.message);process.exit(1);});
