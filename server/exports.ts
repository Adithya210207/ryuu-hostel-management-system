import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import {getSnapshot,recordExternalAudit} from './domain';
import {HttpError} from './http';
import type {DomainUser,Snapshot} from '../shared/domain';
const validSections=['basic','guardian','payments','attendance','outpasses'];
function tables(snapshot:Snapshot,requested:string[],residentId?:string,from?:string,to?:string){
  const residents=snapshot.residents.filter(r=>!residentId||r.id===residentId||r.residentNumber===residentId);
  if(residentId&&!residents.length)throw new HttpError(404,'Resident not found.');
  const ids=new Set(residents.map(r=>r.id));const number=(id:string)=>residents.find(r=>r.id===id)?.residentNumber||id;
  const inDate=(date:string)=> (!from||date.slice(0,10)>=from)&&(!to||date.slice(0,10)<=to);
  const result:{name:string;headers:string[];rows:(string|number)[][]}[]=[];
  if(requested.includes('basic'))result.push({name:'Residents',headers:['Resident ID','Name','Email','Phone','DOB','Profession','Address','Status','Room / bed','Move-in'],rows:residents.map(r=>{const room=snapshot.rooms.find(room=>room.beds.some(b=>b.id===r.bedId));return[r.residentNumber,r.name,r.email,r.phone,r.dob,r.profession,r.address,r.status,room?`${room.label} / ${room.beds.find(b=>b.id===r.bedId)?.label}`:'',r.moveInDate||''];})});
  if(requested.includes('guardian'))result.push({name:'Guardians',headers:['Resident ID','Guardian','Relationship','Phone','Email','Profession'],rows:residents.map(r=>[r.residentNumber,r.guardianName,r.guardianRelationship,r.guardianPhone,r.guardianEmail,r.guardianProfession])});
  if(requested.includes('payments'))result.push({name:'Payments',headers:['Resident ID','Billing period','Amount INR','Reference','Payment date','Submitted UTC','Verification','Review reason'],rows:snapshot.payments.filter(p=>ids.has(p.residentId)&&inDate(p.paidOn)).map(p=>[number(p.residentId),snapshot.bills.find(b=>b.id===p.billId)?.period||'',p.amountPaise/100,p.reference,p.paidOn,p.submittedAt,p.status,p.reason||''])});
  if(requested.includes('attendance'))result.push({name:'Attendance',headers:['Resident ID','IST date','Status','Recorded UTC','Source','Reason'],rows:snapshot.attendance.filter(a=>ids.has(a.residentId)&&inDate(a.date)).map(a=>[number(a.residentId),a.date,a.status,a.recordedAt||'',a.source,a.reason||''])});
  if(requested.includes('outpasses'))result.push({name:'Outpasses',headers:['Resident ID','Destination','Status','Planned departure UTC','Approved return UTC','Actual departure UTC','Actual return UTC'],rows:snapshot.outpasses.filter(o=>ids.has(o.residentId)&&inDate(o.departureAt)).map(o=>[number(o.residentId),o.destination,o.status,o.departureAt,o.expectedReturnAt,o.actualDepartureAt||'',o.actualReturnAt||''])});
  return result;
}
export async function generateExport(user:DomainUser,params:URLSearchParams){
  if(user.role!=='admin')throw new HttpError(403,'Only admins can export resident records.');
  const format=params.get('format')||'xlsx';if(!['xlsx','pdf'].includes(format))throw new HttpError(400,'Choose Excel or PDF.');
  const sections=(params.get('sections')||'basic').split(',').filter(s=>validSections.includes(s));if(!sections.length)throw new HttpError(400,'Select at least one export section.');
  const data=tables(await getSnapshot(user),sections,params.get('residentId')||undefined,params.get('from')||undefined,params.get('to')||undefined);
  await recordExternalAudit(user,'export.create',params.get('residentId')||'all',`Format ${format}; sections ${sections.join(', ')}. Identity PDFs excluded.`);
  if(format==='xlsx'){
    const book=new ExcelJS.Workbook();book.creator='Ryuu';book.created=new Date();
    for(const table of data){const sheet=book.addWorksheet(table.name);sheet.addRow(table.headers);sheet.addRows(table.rows);sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF253B32'}};sheet.views=[{state:'frozen',ySplit:1}];sheet.columns=table.headers.map((h,i)=>({width:Math.min(46,Math.max(h.length+3,...table.rows.map(r=>String(r[i]||'').length+2)))}));sheet.autoFilter={from:'A1',to:{row:1,column:table.headers.length}};}
    return{bytes:Buffer.from(await book.xlsx.writeBuffer()),mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',extension:'xlsx'};
  }
  const doc=new PDFDocument({size:'A4',margin:44});const chunks:Buffer[]=[];
  const completion=new Promise<Buffer>((resolve,reject)=>{doc.on('data',c=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
  doc.font('Helvetica-Bold').fontSize(25).fillColor('#253b32').text('RYUU');doc.font('Helvetica').fontSize(10).fillColor('#555555').text(`Resident report • ${new Date().toISOString().slice(0,10)}\nConfidential — authorized hostel administration\nIdentity documents are excluded.`);doc.moveDown();
  for(const table of data){doc.font('Helvetica-Bold').fontSize(17).fillColor('#253b32').text(table.name);doc.moveDown(.5);if(!table.rows.length)doc.font('Helvetica').fontSize(10).text('No records for this selection.');for(const row of table.rows){const estimate=table.headers.length*15+22;if(doc.y+estimate>doc.page.height-55)doc.addPage();table.headers.forEach((header,i)=>{doc.font('Helvetica-Bold').fontSize(9).fillColor('#333333').text(`${header}: `,{continued:true});doc.font('Helvetica').text(String(row[i]??'').replace(/[^\x20-\x7E\n]/g,' '));});doc.moveDown();}doc.moveDown();}
  doc.end();return{bytes:await completion,mime:'application/pdf',extension:'pdf'};
}
