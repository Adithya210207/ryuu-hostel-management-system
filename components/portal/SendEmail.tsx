'use client';
// Admin: email residents (and optionally their guardians) from the hostel's Gmail account.
import { useState } from 'react';
import { date, label } from './api';
import { Badge, Button, Empty, PageTitle, Panel, Tabs, type PageProps } from './UI';

type Audience = 'active' | 'selected' | 'applicants' | 'all';
export function SendEmail({ data, act }: PageProps) {
  const x = data.extras; const [tab, setTab] = useState('compose');
  const [audience, setAudience] = useState<Audience>('active'); const [picked, setPicked] = useState<string[]>([]); const [guardians, setGuardians] = useState(false);
  const [subject, setSubject] = useState(''); const [body, setBody] = useState(''); const [search, setSearch] = useState(''); const [busy, setBusy] = useState(false); const [open, setOpen] = useState('');
  const people = data.residents.filter(r => r.status !== 'checked_out');
  const living = people.filter(r => ['active', 'booked'].includes(r.status)); const applicants = people.filter(r => r.status === 'applicant');
  const chosen = audience === 'all' ? people : audience === 'active' ? living : audience === 'applicants' ? applicants : people.filter(r => picked.includes(r.id));
  const count = chosen.length + (guardians ? chosen.filter(r => r.guardianUserId).length : 0);
  const visible = people.filter(r => `${r.name} ${r.residentNumber} ${r.email}`.toLowerCase().includes(search.toLowerCase()));
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  async function send() {
    if (!confirm(`Send "${subject}" to ${plural(count, 'person', 'people')}?`)) return;
    setBusy(true);
    try { const ok = await act('email.send', { audience, residentIds: picked, includeGuardians: guardians, subject, body }, `Email queued for ${plural(count, 'person', 'people')}. It goes out over the next few minutes.`); if (ok) { setSubject(''); setBody(''); setPicked([]); } }
    finally { setBusy(false); }
  }
  const status = (id: string) => { const rows = x.outbox.filter(e => e.batchId === id); const n = (s: string) => rows.filter(e => e.status === s).length; return { sent: n('sent'), simulated: n('simulated'), failed: n('failed'), queued: n('queued') }; };
  return <><PageTitle eyebrow="A WORD FROM THE TEAM" title="Send email" text="Write to residents by email. It goes from the hostel's Gmail account; replies come back to hello@example.com."/>
    <Tabs values={[{ value: 'compose', label: 'Compose' }, { value: 'history', label: `History (${x.sentEmails.length})` }]} selected={tab} set={setTab}/>
    {tab === 'history' ? <EmailHistory data={data}/> : <div className="jn-email-layout">
      <Panel className="jn-panel-padded" title="New email" eyebrow="COMPOSE">
        <div className="jn-form-grid">
          <label className="jn-field jn-span-2"><span>Send to</span><select value={audience} onChange={e => setAudience(e.target.value as Audience)}>
            <option value="active">Everyone living here ({living.length})</option>
            <option value="applicants">Applicants ({applicants.length})</option>
            <option value="all">All residents and applicants ({people.length})</option>
            <option value="selected">Choose residents…</option>
          </select></label>
          {audience === 'selected' && <div className="jn-span-2 jn-email-picker">
            <input type="search" placeholder="Search by name, ID or email…" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search residents"/>
            <div className="jn-email-picklist">{visible.map(r => <label key={r.id} className="jn-checkbox"><input type="checkbox" checked={picked.includes(r.id)} onChange={e => setPicked(p => e.target.checked ? [...p, r.id] : p.filter(id => id !== r.id))}/><span><strong>{r.name}</strong> · {r.residentNumber} · <small>{label(r.status)}</small></span></label>)}</div>
          </div>}
          <label className="jn-checkbox jn-span-2"><input type="checkbox" checked={guardians} onChange={e => setGuardians(e.target.checked)}/><span>Also send to their guardians</span></label>
          <label className="jn-field jn-span-2"><span>Subject</span><input value={subject} maxLength={150} onChange={e => setSubject(e.target.value)} placeholder="For example: Water supply break on Sunday"/></label>
          <label className="jn-field jn-span-2"><span>Message</span><textarea rows={9} value={body} maxLength={5000} onChange={e => setBody(e.target.value)} placeholder="Write your message. Each email starts with 'Hello <first name>,' and ends with your name."/><small className="jn-field-hint">{body.length}/5000</small></label>
        </div>
        <div className="jn-email-send"><span className="jn-muted">{plural(count, 'recipient', 'recipients')}{count > 300 ? ' · too many for one send (max 300)' : ''}</span><Button icon="arrow" onClick={send} disabled={busy || !subject.trim() || !body.trim() || count === 0 || count > 300}>{busy ? 'Sending…' : 'Send email'}</Button></div>
        <p className="jn-page-footnote">Gmail allows about 400 emails a day in total, including login codes. For short notices everyone should see in the portal, use the Noticeboard.</p>
      </Panel>
      <Panel className="jn-panel-padded" title="Recently sent" eyebrow="LATEST 3">{x.sentEmails.length ? <div className="jn-sent-list">{x.sentEmails.slice(-3).reverse().map(m => { const s = status(m.id); return <article key={m.id} className="jn-sent-item">
        <button type="button" className="jn-sent-head" onClick={() => setOpen(open === m.id ? '' : m.id)} aria-expanded={open === m.id}><strong>{m.subject}</strong><small>{date(m.createdAt, true)} · {m.sentBy} · {plural(m.recipients.length, 'recipient', 'recipients')}</small>
          <span className="jn-sent-status">{s.queued > 0 && <Badge status="pending">{s.queued} sending</Badge>}{s.sent > 0 && <Badge status="verified">{s.sent} sent</Badge>}{s.simulated > 0 && <Badge status="active">{s.simulated} simulated (demo)</Badge>}{s.failed > 0 && <Badge status="rejected">{s.failed} failed</Badge>}</span></button>
        {open === m.id && <div className="jn-sent-body"><p>{m.body}</p><small className="jn-block">To: {m.recipients.map(r => `${r.name}${r.role === 'guardian' ? ' (guardian)' : ''}`).join(', ')}</small></div>}
      </article>; })}<button type="button" className="jn-text-button" onClick={() => setTab('history')}>See the full history →</button></div> : <Empty icon="message" title="No emails sent yet">Emails you send from here are listed with their delivery status.</Empty>}</Panel>
    </div>}</>;
}

/** Every email sent from the portal: when, what, by whom and to whom, with each recipient's delivery status. */
function EmailHistory({ data }: Pick<PageProps, 'data'>) {
  const x = data.extras; const [q, setQ] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [open, setOpen] = useState('');
  const istDay = (iso: string) => new Date(new Date(iso).getTime() + 19800000).toISOString().slice(0, 10);
  const rows = x.sentEmails.slice().reverse().filter(m => (!from || istDay(m.createdAt) >= from) && (!to || istDay(m.createdAt) <= to) && (!q || `${m.subject} ${m.body} ${m.sentBy} ${m.recipients.map(r => r.name + ' ' + r.email).join(' ')}`.toLowerCase().includes(q.toLowerCase())));
  const delivery = (batch: string, email: string) => x.outbox.find(e => e.batchId === batch && e.to.toLowerCase() === email.toLowerCase());
  const statusBadge = (st?: string) => !st ? <span className="jn-muted">—</span> : st === 'sent' ? <Badge status="verified">Sent</Badge> : st === 'simulated' ? <Badge status="active">Simulated</Badge> : st === 'failed' ? <Badge status="rejected">Failed</Badge> : <Badge status="pending">Sending</Badge>;
  const audienceLabel = (m: typeof x.sentEmails[number]) => ({ active: 'Everyone living here', applicants: 'Applicants', all: 'All residents and applicants', selected: 'Chosen residents' } as Record<string, string>)[m.audience] + (m.includeGuardians ? ' + guardians' : '');
  return <Panel className="jn-table-panel">
    <div className="jn-email-filters"><label className="jn-field"><span>Search</span><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Subject, message, name or email"/></label><label className="jn-field"><span>From</span><input type="date" value={from} onChange={e => setFrom(e.target.value)}/></label><label className="jn-field"><span>To</span><input type="date" value={to} onChange={e => setTo(e.target.value)}/></label>{(q || from || to) && <button type="button" className="jn-text-button" onClick={() => { setQ(''); setFrom(''); setTo(''); }}>Clear</button>}</div>
    {rows.length ? <div className="jn-table-scroll"><table className="jn-table jn-email-history"><thead><tr><th>Sent</th><th>Subject</th><th>Sent to</th><th>Sent by</th><th>Delivery</th><th/></tr></thead><tbody>{rows.map(m => {
      const st = m.recipients.map(r => delivery(m.id, r.email)?.status); const n = (v: string) => st.filter(s => s === v).length;
      return [<tr key={m.id}><td><strong>{date(m.createdAt)}</strong><small className="jn-block">{new Date(m.createdAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}</small></td><td><strong>{m.subject}</strong><small className="jn-block jn-email-snippet">{m.body.slice(0, 90)}{m.body.length > 90 ? '…' : ''}</small></td><td>{m.recipients.length} {m.recipients.length === 1 ? 'person' : 'people'}<small className="jn-block">{audienceLabel(m)}</small></td><td>{m.sentBy}</td><td><span className="jn-sent-status">{n('queued') > 0 && <Badge status="pending">{n('queued')} sending</Badge>}{n('sent') > 0 && <Badge status="verified">{n('sent')} sent</Badge>}{n('simulated') > 0 && <Badge status="active">{n('simulated')} simulated</Badge>}{n('failed') > 0 && <Badge status="rejected">{n('failed')} failed</Badge>}</span></td><td><button type="button" className="jn-table-link" aria-expanded={open === m.id} onClick={() => setOpen(open === m.id ? '' : m.id)}>{open === m.id ? 'Hide' : 'View'}</button></td></tr>,
        open === m.id && <tr key={m.id + '-detail'} className="jn-email-detail"><td colSpan={6}><div className="jn-email-detail-grid"><div><span className="jn-eyebrow">MESSAGE</span><p>{m.body}</p></div><div><span className="jn-eyebrow">RECIPIENTS</span><table className="jn-table"><thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Delivered at</th></tr></thead><tbody>{m.recipients.map(r => { const d = delivery(m.id, r.email); return <tr key={r.email}><td>{r.name}{r.role === 'guardian' && <small className="jn-block">Guardian</small>}</td><td>{r.email}</td><td>{statusBadge(d?.status)}{d?.error && <small className="jn-block jn-warning-text">{d.error}</small>}</td><td>{d?.sentAt ? date(d.sentAt, true) : '—'}</td></tr>; })}</tbody></table></div></div></td></tr>];
    })}</tbody></table></div> : <Empty icon="message" title={x.sentEmails.length ? 'No emails match' : 'No emails sent yet'}>{x.sentEmails.length ? 'Try a different search or date range.' : 'Emails sent from the Compose tab appear here.'}</Empty>}
    <p className="jn-page-footnote jn-email-note">Shows the last 100 emails. Delivery status is kept for 90 days; "Sent" means Gmail accepted the email, not that it was read.</p>
  </Panel>;
}
