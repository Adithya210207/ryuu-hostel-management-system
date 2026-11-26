import { NextResponse } from 'next/server';
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const expected = process.env.APP_URL || new URL(request.url).origin;
  const allowed = [new URL(expected).origin];
  // Explicit, single-origin LAN preview; never expands production access.
  if (process.env.NODE_ENV === 'development' && process.env.DEV_LAN_ORIGIN) allowed.push(new URL(process.env.DEV_LAN_ORIGIN).origin);
  if (origin && !allowed.includes(origin)) throw new HttpError(403, 'This request must come from the Ryuu website.');
  if (!origin && process.env.NODE_ENV === 'production') throw new HttpError(403, 'Missing request origin.');
}
export async function readLimited(request:Request,limit:number){
  if(Number(request.headers.get('content-length')||0)>limit)throw new HttpError(413,'Request is too large.');
  const reader=request.body?.getReader();if(!reader)return new Uint8Array();let length=0;const chunks:Uint8Array[]=[];
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>limit){await reader.cancel();throw new HttpError(413,'Request is too large.');}chunks.push(value);}
  const result=new Uint8Array(length);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result;
}
export async function readBody(request: Request) {
  const text = new TextDecoder().decode(await readLimited(request,100_000));
  try { const result = JSON.parse(text); if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error(); return result as Record<string, any>; }
  catch { throw new HttpError(400, 'Invalid form data.'); }
}
export function json(value: unknown, status = 200) { return NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store' } }); }
export function failure(error: unknown) {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  const e = error as { message?: string; code?: string; status?: number; name?: string };
  if (e?.code === '23505') return json({ error: 'That email, phone number, or record is already in use.' }, 409);
  if (e?.name === 'ZodError') return json({ error: 'Please check all required fields and use valid values.' }, 400);
  if (e?.status && e.status < 500) return json({ error: e.message }, e.status);
  // Domain validation errors are actionable; infrastructure failures remain opaque.
  if (error instanceof Error && !e.code && !/database|relation|column|connect|syntax|fetch|ENOENT|ENOTFOUND|ECONN/i.test(error.message)) return json({ error: error.message }, 400);
  console.error('[Ryuu] Request failed:', e?.name || 'Error', e?.code || 'internal');
  return json({ error: 'The request could not be completed. Please try again or contact the admin team.' }, 500);
}
