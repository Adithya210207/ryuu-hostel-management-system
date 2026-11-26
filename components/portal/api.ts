export async function api<T = any>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: { ...(options?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...options?.headers }, cache: 'no-store' });
  const result = await response.json().catch(() => ({ error: 'The server could not complete this request.' }));
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : result.error?.message || result.message || 'Please try again.');
  return result;
}
export const post = <T = any>(url: string, input: unknown) => api<T>(url, { method: 'POST', body: JSON.stringify(input) });
export async function upload(file: File, purpose: string) {
  const data = new FormData(); data.append('file', file); data.append('purpose', purpose);
  return api<{ id: string; name: string }>('/api/uploads', { method: 'POST', body: data });
}
export function money(paise: number | null | undefined) { return paise == null ? 'Not configured' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100); }
export function date(value: string | null | undefined, time = false) { if (!value) return '—'; const d = new Date(value); return Number.isNaN(+d) ? value : new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', ...(time ? { hour: 'numeric', minute: '2-digit' } : {}), timeZone: 'Asia/Kolkata' }).format(d); }
export function istDate(offset = 0) { return new Date(Date.now() + 19800000 + offset * 86400000).toISOString().slice(0, 10); }
export function label(value: unknown) { return String(value || 'Pending').replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }
