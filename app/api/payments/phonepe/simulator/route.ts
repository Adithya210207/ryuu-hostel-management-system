// Local demo only (PHONEPE_SIMULATE=true): a stand-in for PhonePe's checkout page.
import {simulatorFinish,simulatorOrder} from '../../../../../server/phonepe';
const esc=(s:string)=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'} as Record<string,string>)[c]);
export async function GET(request:Request){
  const id=new URL(request.url).searchParams.get('order')||'';const o=simulatorOrder(id);
  if(!o)return new Response('Not found',{status:404});
  const html=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PhonePe test checkout</title><style>body{margin:0;font:16px/1.5 system-ui,sans-serif;background:#f3effa;display:grid;place-items:center;min-height:100vh}main{background:#fff;border-radius:20px;padding:28px;max-width:360px;width:calc(100% - 32px);box-shadow:0 10px 40px rgba(0,0,0,.08)}h1{font-size:20px;margin:0 0 4px;color:#5f259f}p{color:#555;margin:0 0 18px}strong{font-size:30px;display:block;margin:12px 0 20px}button{width:100%;padding:14px;border:0;border-radius:12px;font:inherit;font-weight:600;margin-top:10px;cursor:pointer}.ok{background:#5f259f;color:#fff}.no{background:#eee}</style><main><h1>PhonePe · test checkout</h1><p>Local simulation. No real money moves.</p><small>Order ${esc(id)}</small><strong>₹${(o.amountPaise/100).toLocaleString('en-IN')}</strong><form method="post"><input type="hidden" name="order" value="${esc(id)}"><button class="ok" name="result" value="success">Pay (simulate success)</button><button class="no" name="result" value="fail">Cancel (simulate failure)</button></form></main>`;
  return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
}
export async function POST(request:Request){
  const form=await request.formData();const o=simulatorFinish(String(form.get('order')||''),form.get('result')==='success');
  if(!o)return new Response('Not found',{status:404});
  return new Response(null,{status:303,headers:{Location:o.redirectUrl}});
}
