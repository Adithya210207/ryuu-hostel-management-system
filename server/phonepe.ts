// PhonePe Payment Gateway (Standard Checkout, PG v2) client.
// Docs: https://developer.phonepe.com/payment-gateway/website-integration/standard-checkout/api-integration/api-integration-website
// Settings (environment variables):
//   PHONEPE_ENV            sandbox | production            (default sandbox)
//   PHONEPE_CLIENT_ID, PHONEPE_CLIENT_SECRET, PHONEPE_CLIENT_VERSION   from PhonePe Business Dashboard > Developer Settings
//   PHONEPE_WEBHOOK_USERNAME, PHONEPE_WEBHOOK_PASSWORD                  the username/password you set on the webhook
//   PHONEPE_SIMULATE=true  local demo only: a fake checkout page so the flow can be tried without PhonePe keys
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { strictProduction } from './config';

export type PhonePeMode = 'off' | 'simulated' | 'sandbox' | 'production';
export interface PhonePeStatus { state: 'PENDING' | 'COMPLETED' | 'FAILED'; amountPaise: number; orderId: string; transactionId: string; paymentMode: string; errorCode?: string }

const demo = () => !strictProduction() && process.env.DEMO_MODE === 'true';
export function phonePeMode(): PhonePeMode {
  if (demo() && process.env.PHONEPE_SIMULATE === 'true') return 'simulated';
  if (!process.env.PHONEPE_CLIENT_ID || !process.env.PHONEPE_CLIENT_SECRET || !process.env.PHONEPE_CLIENT_VERSION) return 'off';
  return process.env.PHONEPE_ENV === 'production' ? 'production' : 'sandbox';
}
function urls() {
  return phonePeMode() === 'production'
    ? { token: 'https://api.phonepe.com/apis/identity-manager/v1/oauth/token', pg: 'https://api.phonepe.com/apis/pg' }
    : { token: 'https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token', pg: 'https://api-preprod.phonepe.com/apis/pg-sandbox' };
}

// ---- Auth token (cached until a minute before it expires)
const cache = globalThis as unknown as { phonepeToken?: { value: string; expiresAt: number; mode: PhonePeMode } };
async function token(): Promise<string> {
  const mode = phonePeMode(); const now = Date.now() / 1000;
  if (cache.phonepeToken && cache.phonepeToken.mode === mode && cache.phonepeToken.expiresAt - 60 > now) return cache.phonepeToken.value;
  const body = new URLSearchParams({ client_id: process.env.PHONEPE_CLIENT_ID!, client_version: process.env.PHONEPE_CLIENT_VERSION!, client_secret: process.env.PHONEPE_CLIENT_SECRET!, grant_type: 'client_credentials' });
  const res = await fetch(urls().token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(15000) });
  const data = await res.json().catch(() => ({})) as any;
  if (!res.ok || !data.access_token) throw new Error('PhonePe sign-in failed. Check the PhonePe client ID, secret and version.');
  cache.phonepeToken = { value: data.access_token, expiresAt: Number(data.expires_at) || now + 3000, mode };
  return data.access_token;
}
async function call(path: string, init: RequestInit = {}) {
  const res = await fetch(urls().pg + path, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `O-Bearer ${await token()}`, ...(init.headers || {}) }, signal: AbortSignal.timeout(15000) });
  const data = await res.json().catch(() => ({})) as any; return { ok: res.ok, status: res.status, data };
}

// ---- Local simulator (demo mode only): remembers the outcome the tester picked.
const sim = globalThis as unknown as { phonepeSim?: Map<string, { amountPaise: number; redirectUrl: string; state: PhonePeStatus['state'] }> };
const simStore = () => (sim.phonepeSim ??= new Map());
export function simulatorOrder(id: string) { return phonePeMode() === 'simulated' ? simStore().get(id) : undefined; }
export function simulatorFinish(id: string, success: boolean) { const o = simulatorOrder(id); if (o) o.state = success ? 'COMPLETED' : 'FAILED'; return o; }

/** Creates a checkout and returns the PhonePe page to send the customer to. */
export async function createCheckout(o: { merchantOrderId: string; amountPaise: number; redirectUrl: string; phone?: string; residentNumber: string; billPeriod: string }): Promise<{ orderId: string; checkoutUrl: string }> {
  if (phonePeMode() === 'simulated') { simStore().set(o.merchantOrderId, { amountPaise: o.amountPaise, redirectUrl: o.redirectUrl, state: 'PENDING' }); return { orderId: `SIM-${o.merchantOrderId}`, checkoutUrl: `/api/payments/phonepe/simulator?order=${encodeURIComponent(o.merchantOrderId)}` }; }
  if (phonePeMode() === 'off') throw new Error('Online payment is not set up yet. Please pay by bank transfer or UPI and submit the details.');
  const phone = (o.phone || '').replace(/\s/g, '');
  const { ok, data } = await call('/checkout/v2/pay', { method: 'POST', body: JSON.stringify({
    merchantOrderId: o.merchantOrderId, amount: o.amountPaise, expireAfter: 1200,
    metaInfo: { udf1: `Ryuu ${o.billPeriod}`, udf11: o.residentNumber.replace(/[^A-Za-z0-9_\-+@.]/g, '') },
    paymentFlow: { type: 'PG_CHECKOUT', message: `Ryuu bill ${o.billPeriod}`, merchantUrls: { redirectUrl: o.redirectUrl } },
    ...(/^\+?\d{10,13}$/.test(phone) ? { prefillUserLoginDetails: { phoneNumber: phone.slice(-10) } } : {}),
  }) });
  if (!ok || !data.redirectUrl) throw new Error('PhonePe could not start the payment. Please try again in a minute.');
  return { orderId: String(data.orderId || ''), checkoutUrl: String(data.redirectUrl) };
}

/** The order's current state, straight from PhonePe. The browser's word is never trusted. */
export async function checkoutStatus(merchantOrderId: string): Promise<PhonePeStatus> {
  if (phonePeMode() === 'simulated') { const o = simStore().get(merchantOrderId); return { state: o?.state ?? 'FAILED', amountPaise: o?.amountPaise ?? 0, orderId: `SIM-${merchantOrderId}`, transactionId: o?.state === 'COMPLETED' ? `SIMTXN${merchantOrderId.slice(-8)}` : '', paymentMode: 'UPI_INTENT (simulated)' }; }
  const { ok, data } = await call(`/checkout/v2/order/${encodeURIComponent(merchantOrderId)}/status?details=false`);
  if (!ok) throw new Error(data?.code === 'INVALID_MERCHANT_ORDER_ID' ? 'PhonePe has no record of this payment.' : 'Could not reach PhonePe. The payment will be checked again shortly.');
  const latest = Array.isArray(data.paymentDetails) ? data.paymentDetails.at(-1) : undefined;
  const state = ['PENDING', 'COMPLETED', 'FAILED'].includes(data.state) ? data.state : 'PENDING';
  return { state, amountPaise: Number(data.amount) || 0, orderId: String(data.orderId || ''), transactionId: String(latest?.transactionId || ''), paymentMode: String(latest?.paymentMode || ''), errorCode: data.errorCode || latest?.errorCode };
}

/** Webhook check: PhonePe sends Authorization = SHA256("username:password"). */
export function webhookAuthorised(header: string | null): boolean {
  const user = process.env.PHONEPE_WEBHOOK_USERNAME, pass = process.env.PHONEPE_WEBHOOK_PASSWORD;
  if (!user || !pass || !header) return false;
  const expected = createHash('sha256').update(`${user}:${pass}`).digest('hex');
  const got = header.trim().replace(/^(SHA256|Bearer)\s+/i, '').toLowerCase();
  return got.length === expected.length && timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

/** Unique order ID: letters and digits only, well under PhonePe's 63-character limit. */
export function newMerchantOrderId() { return `JN${Date.now().toString(36).toUpperCase()}${randomBytes(4).toString('hex').toUpperCase()}`; }
