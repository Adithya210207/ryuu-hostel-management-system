import {db} from '../../../server/db';
import {json} from '../../../server/http';
export const runtime='nodejs';
export async function GET(){try{await db.query('SELECT 1');return json({status:'ok'});}catch{return json({status:'unavailable'},503);}}
