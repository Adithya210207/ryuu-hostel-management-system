'use client';
// Portal pages for the November 2026 feature batch.
import { useEffect, useState, type ReactNode } from 'react';
import { WEEKDAYS, isNonVegDay, type Resident } from '../../shared/domain';
import { DOCUMENT_KINDS, EXPENSE_CATEGORIES, LATE_ARRIVALS_PER_MONTH, LATE_RETURN_TIMES, LAUNDRY_HOURS, hourLabel, timeLabel, type MealName, type MenuDay } from '../../shared/extras';
import { api, date, istDate, label, money, post } from './api';
import Icon from './Icon';
import { Badge, Button, Empty, FormDialog, PageTitle, Panel, Person, Stat, Tabs, type FieldDef, type PageProps } from './UI';

type DialogSpec = { title: string; fields: FieldDef[]; submit?: string; note?: ReactNode; save: (values: Record<string, any>) => Promise<boolean | void> };
function useDialog() {
  const [spec, setSpec] = useState<DialogSpec | null>(null);
  const node = spec && <FormDialog title={spec.title} fields={spec.fields} note={spec.note} submit={spec.submit} onClose={() => setSpec(null)} onSubmit={v => spec.save(v)}/>;
  return [node, setSpec] as const;
}
const MEALS: MealName[] = ['breakfast', 'lunch', 'dinner'];
const weekdayOf = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();
const nameOf = (data: PageProps['data'], residentId: string) => data.residents.find(r => r.id === residentId)?.name || 'Resident';
const rupeesToPaise = (v: unknown) => Math.round(Number(v) * 100);

/* ---------------- Weekly menu and meal feedback ---------------- */
function menuLine(menu: MenuDay | undefined, meal: MealName, nonVegDay: boolean) {
  if (!menu) return '';
  const base = menu[meal]; const nv = meal === 'lunch' ? menu.nonVegLunch : meal === 'dinner' ? menu.nonVegDinner : '';
  return nonVegDay && nv ? `${base || 'Veg option'} · Non-veg: ${nv}` : base;
}
/** Residents: tomorrow's menu, the whole week, and thumbs up / down for today's and yesterday's meals. */
export function MenuAndFeedback({ data, act }: PageProps) {
  const menu = data.extras.weeklyMenu; const tomorrow = data.meta.tomorrow; const today = data.meta.businessDate; const yesterday = istDate(-1);
  const [day, setDay] = useState(today); const [dialog, open] = useDialog(); const self = data.residents.find(r => r.userId === data.user.id);
  const hasMenu = Object.values(menu).some(m => m && (m.breakfast || m.lunch || m.dinner));
  function rate(meal: MealName, liked: boolean) { open({ title: `${liked ? 'Liked' : 'Didn’t like'} ${label(meal).toLowerCase()} · ${date(day)}`, fields: [{ name: 'comment', label: 'Anything to add? (optional)', type: 'textarea', required: false, wide: true }], submit: 'Send feedback', save: v => act('feedback.submit', { date: day, meal, liked, comment: v.comment || '' }, 'Thanks. The kitchen will see your feedback.') }); }
  return <><Panel className="jn-panel-padded" title="This week’s menu" eyebrow="WHAT’S COOKING">{hasMenu ? <>
    <div className="jn-menu-tomorrow"><span className="jn-eyebrow">TOMORROW · {WEEKDAYS[weekdayOf(tomorrow)].toUpperCase()}</span>{MEALS.map(m => <p key={m}><strong>{label(m)}</strong>{menuLine(menu[String(weekdayOf(tomorrow))], m, isNonVegDay(data.settings.food, tomorrow)) || '—'}</p>)}</div>
    <div className="jn-table-scroll"><table className="jn-table jn-menu-table"><thead><tr><th>Day</th>{MEALS.map(m => <th key={m}>{label(m)}</th>)}</tr></thead><tbody>{WEEKDAYS.map((w, i) => { const nv = (data.settings.food.nonVegDays ?? [0, 1, 2, 3, 4, 5, 6]).includes(i); return <tr key={w}><td><strong>{w}</strong>{nv && <small className="jn-block jn-nonveg-tag">Non-veg day</small>}</td>{MEALS.map(m => <td key={m}>{menuLine(menu[String(i)], m, nv) || '—'}</td>)}</tr>; })}</tbody></table></div></> : <Empty icon="food" title="The menu is on its way">The hostel team will post this week’s menu here.</Empty>}</Panel>
    {self?.status === 'active' && <Panel className="jn-panel-padded" title="How was the food?" eyebrow="A QUICK THUMBS UP OR DOWN"><Tabs values={[{ value: today, label: 'Today' }, { value: yesterday, label: 'Yesterday' }]} selected={day} set={setDay}/><div className="jn-feedback-grid">{MEALS.map(m => { const mine = data.extras.mealFeedback.find(f => f.date === day && f.meal === m); return <div key={m} className="jn-feedback-item"><strong>{label(m)}</strong><small>{menuLine(menu[String(weekdayOf(day))], m, isNonVegDay(data.settings.food, day)) || 'Menu not posted'}</small><div className="jn-yes-no">{[true, false].map(liked => <button key={String(liked)} type="button" className={mine?.liked === liked ? 'selected' : ''} aria-pressed={mine?.liked === liked} onClick={() => rate(m, liked)}>{liked ? '👍 Good' : '👎 Not great'}</button>)}</div></div>; })}</div></Panel>}{dialog}</>;
}
/** Admin (Kitchen tab): edit the weekly menu and read recent feedback. */
export function KitchenExtras({ data, act }: PageProps) {
  const [dialog, open] = useDialog(); const menu = data.extras.weeklyMenu;
  function edit(i: number) { const m = menu[String(i)]; open({ title: `Menu for ${WEEKDAYS[i]}`, note: (data.settings.food.nonVegDays ?? [0, 1, 2, 3, 4, 5, 6]).includes(i) ? 'This is a non-veg day: add the non-veg dishes too.' : 'Leave the non-veg fields empty on veg days.', fields: [{ name: 'breakfast', label: 'Breakfast', value: m?.breakfast, required: false, wide: true }, { name: 'lunch', label: 'Lunch (veg)', value: m?.lunch, required: false, wide: true }, { name: 'dinner', label: 'Dinner (veg)', value: m?.dinner, required: false, wide: true }, { name: 'nonVegLunch', label: 'Non-veg lunch', value: m?.nonVegLunch, required: false }, { name: 'nonVegDinner', label: 'Non-veg dinner', value: m?.nonVegDinner, required: false }], submit: 'Save menu', save: v => act('menu.update', { weekday: i, ...v }, `${WEEKDAYS[i]} menu saved.`) }); }
  const since = istDate(-13); const recent = data.extras.mealFeedback.filter(f => f.date >= since);
  const byDay = Array.from(new Set(recent.map(f => f.date))).sort().reverse();
  return <><Panel className="jn-panel-padded" title="Weekly menu" eyebrow="RESIDENTS SEE THIS IN DAILY MEALS"><div className="jn-table-scroll"><table className="jn-table jn-menu-table"><thead><tr><th>Day</th>{MEALS.map(m => <th key={m}>{label(m)}</th>)}<th/></tr></thead><tbody>{WEEKDAYS.map((w, i) => { const nv = (data.settings.food.nonVegDays ?? [0, 1, 2, 3, 4, 5, 6]).includes(i); return <tr key={w}><td><strong>{w}</strong>{nv && <small className="jn-block jn-nonveg-tag">Non-veg day</small>}</td>{MEALS.map(m => <td key={m}>{menuLine(menu[String(i)], m, nv) || <span className="jn-muted">Not set</span>}</td>)}<td><button className="jn-small-button" onClick={() => edit(i)}>Edit</button></td></tr>; })}</tbody></table></div></Panel>
    <Panel className="jn-panel-padded" title="Food feedback · last 14 days" eyebrow="WHAT RESIDENTS THOUGHT">{byDay.length ? <div className="jn-table-scroll"><table className="jn-table"><thead><tr><th>Date</th>{MEALS.map(m => <th key={m}>{label(m)}</th>)}</tr></thead><tbody>{byDay.map(d => <tr key={d}><td>{date(d)}</td>{MEALS.map(m => { const rows = recent.filter(f => f.date === d && f.meal === m); const up = rows.filter(f => f.liked).length; return <td key={m}>{rows.length ? <><strong>👍 {up} · 👎 {rows.length - up}</strong>{rows.filter(f => f.comment).map(f => <small key={f.id} className="jn-block">“{f.comment}” — {nameOf(data, f.residentId).split(' ')[0]}</small>)}</> : '—'}</td>; })}</tr>)}</tbody></table></div> : <Empty icon="food" title="No feedback yet">Residents can rate each meal from their Daily meals page.</Empty>}</Panel>{dialog}</>;
}

/* ---------------- Laundry ---------------- */
export function Laundry({ data, act }: PageProps) {
  const admin = data.user.role === 'admin'; const self = data.residents.find(r => r.userId === data.user.id); const x = data.extras;
  const days = [0, 1, 2].map(n => istDate(n)); const [day, setDay] = useState(days[0]); const [dialog, open] = useDialog();
  const booked = x.laundry.filter(b => b.status === 'booked' && b.date === day); const mine = self ? x.laundry.filter(b => b.status === 'booked' && b.residentId === self.id && b.date >= days[0]) : [];
  const nowHour = new Date(Date.now() + 19800000).getUTCHours();
  return <><PageTitle eyebrow="LAUNDRY DAY, SORTED" title="Laundry" text={admin ? 'See who booked the washing machines, and set how many machines there are.' : 'Book a one-hour washing machine slot for today or the next two days.'} action={admin && <Button secondary icon="settings" onClick={() => open({ title: 'Washing machines', fields: [{ name: 'machines', label: 'Number of machines', type: 'number', min: 1, max: 10, value: x.laundryMachines }], save: v => act('laundry.settings', { machines: Number(v.machines) }, 'Machine count saved.') })}>{`${x.laundryMachines} machines`}</Button>}/>
    {!admin && mine.length > 0 && <Panel className="jn-panel-padded" title="Your bookings">{mine.map(b => <div key={b.id} className="jn-row-line"><span><strong>{date(b.date)}</strong> · {hourLabel(b.hour)}–{hourLabel(b.hour + 1)} · Machine {b.machine}</span><button className="jn-small-button" onClick={() => act('laundry.cancel', { bookingId: b.id }, 'Booking cancelled.')}>Cancel</button></div>)}</Panel>}
    <Tabs values={days.map((d, i) => ({ value: d, label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : date(d) }))} selected={day} set={setDay}/>
    <Panel className="jn-laundry-panel jn-panel-padded"><div className="jn-laundry-grid">{LAUNDRY_HOURS.map(h => { const rows = booked.filter(b => b.hour === h); const full = rows.length >= x.laundryMachines; const past = day === days[0] && h < nowHour; const own = rows.find(b => self && b.residentId === self.id);
      return <div key={h} className={`jn-laundry-slot ${full ? 'full' : ''} ${past ? 'past' : ''} ${own ? 'mine' : ''}`}><strong>{hourLabel(h)}</strong><small>{own ? `Your slot · machine ${own.machine}` : `${x.laundryMachines - rows.length} of ${x.laundryMachines} free`}</small>
        {admin ? rows.map(b => <small key={b.id} className="jn-block">M{b.machine}: {nameOf(data, b.residentId)} <button className="jn-text-button" onClick={() => act('laundry.cancel', { bookingId: b.id }, 'Booking cancelled.')}>cancel</button></small>) : !own && !full && !past && self?.status === 'active' && <button className="jn-small-button good" onClick={() => act('laundry.book', { date: day, hour: h }, `Booked ${hourLabel(h)} on ${date(day)}.`)}>Book</button>}</div>; })}</div></Panel>
    <p className="jn-page-footnote">One slot per resident per day. Please be on time, and take your clothes out when your hour ends.</p>{dialog}</>;
}

/* ---------------- Visitors and late returns ---------------- */
export function Visitors({ data, act }: PageProps) {
  const role = data.user.role; const admin = role === 'admin'; const self = data.residents.find(r => r.userId === data.user.id); const x = data.extras; const today = data.meta.businessDate;
  const [tab, setTab] = useState(admin ? 'today' : 'visitors'); const [dialog, open] = useDialog();
  const month = today.slice(0, 7); const used = self ? x.lateArrivals.filter(l => l.residentId === self.id && l.status === 'approved' && l.date.slice(0, 7) === month).length : 0;
  function registerVisitor() { open({ title: 'Register a visitor', note: 'The front desk will check your visitor’s name against this list.', fields: [{ name: 'name', label: 'Visitor’s name' }, { name: 'phone', label: 'Visitor’s phone', type: 'tel' }, { name: 'relation', label: 'Relation', value: 'Parent' }, { name: 'date', label: 'Date', type: 'date', value: today, min: today }, { name: 'expectedAt', label: 'Expected time', type: 'time', value: '17:00' }], submit: 'Register visitor', save: v => act('visitor.register', v, 'Visitor registered. The front desk has been told.') }); }
  function lateReturn() { open({ title: 'Request a late return', note: `You can use ${LATE_ARRIVALS_PER_MONTH} late returns each month, and the latest return time is 12 midnight. Your guardian and the hostel team are told straight away. ${LATE_ARRIVALS_PER_MONTH - used} left this month.`, fields: [{ name: 'date', label: 'Night', options: [{ value: today, label: `Tonight (${date(today)})` }, { value: data.meta.tomorrow, label: `Tomorrow (${date(data.meta.tomorrow)})` }] }, { name: 'returnBy', label: 'I’ll be back by', options: LATE_RETURN_TIMES.map(t => ({ value: t, label: timeLabel(t) })), value: '23:00' }, { name: 'reason', label: 'Reason', type: 'textarea', wide: true }], submit: 'Request late return', save: v => act('late.request', v, 'Late return confirmed.') }); }
  const visitors = x.visitors.filter(v => admin ? (tab === 'today' ? v.date === today : tab === 'upcoming' ? v.date > today : true) : true).slice().sort((a, b) => (a.date + a.expectedAt).localeCompare(b.date + b.expectedAt));
  const lates = x.lateArrivals.slice().sort((a, b) => b.date.localeCompare(a.date));
  const visitorTable = <Panel title={admin ? 'Visitors' : 'Your visitors'} className="jn-table-panel">{visitors.length ? <div className="jn-table-scroll"><table className="jn-table"><thead><tr>{role !== 'resident' && <th>Resident</th>}<th>Visitor</th><th>When</th><th>Status</th><th/></tr></thead><tbody>{visitors.map(v => <tr key={v.id}>{role !== 'resident' && <td>{nameOf(data, v.residentId)}</td>}<td><Person name={v.name} subtitle={`${v.relation} · ${v.phone}`}/></td><td>{date(v.date)} · {timeLabel(v.expectedAt)}</td><td><Badge status={v.status === 'arrived' ? 'active' : v.status === 'left' ? 'verified' : v.status === 'cancelled' ? 'rejected' : 'pending'}>{label(v.status)}{v.arrivedAt ? ` ${date(v.arrivedAt, true).split(',').pop()}` : ''}</Badge></td><td>{admin && v.status === 'expected' && <button className="jn-small-button good" onClick={() => act('visitor.mark', { visitorId: v.id, status: 'arrived' }, `${v.name} marked as arrived.`)}>Mark arrived</button>}{admin && v.status === 'arrived' && <button className="jn-small-button" onClick={() => act('visitor.mark', { visitorId: v.id, status: 'left' }, `${v.name} signed out.`)}>Mark left</button>}{role === 'resident' && v.status === 'expected' && <button className="jn-small-button" onClick={() => act('visitor.cancel', { visitorId: v.id }, 'Visit cancelled.')}>Cancel</button>}</td></tr>)}</tbody></table></div> : <Empty icon="users" title="No visitors here">{role === 'resident' ? 'Register a visitor so the front desk knows to expect them.' : 'Registered visitors will appear here.'}</Empty>}</Panel>;
  const lateTable = <Panel title={role === 'resident' ? `Late returns · ${LATE_ARRIVALS_PER_MONTH - used} of ${LATE_ARRIVALS_PER_MONTH} left this month` : 'Late returns'} className="jn-table-panel">{lates.length ? <div className="jn-table-scroll"><table className="jn-table"><thead><tr>{role !== 'resident' && <th>Resident</th>}<th>Night</th><th>Back by</th><th>Reason</th><th>Status</th><th/></tr></thead><tbody>{lates.map(l => <tr key={l.id}>{role !== 'resident' && <td>{nameOf(data, l.residentId)}</td>}<td>{date(l.date)}</td><td>{timeLabel(l.returnBy)}</td><td>{l.reason}</td><td><Badge status={l.status === 'approved' ? 'verified' : 'rejected'}>{l.status === 'approved' ? 'Confirmed' : 'Cancelled'}</Badge></td><td>{role === 'resident' && l.status === 'approved' && l.date >= today && <button className="jn-small-button" onClick={() => act('late.cancel', { lateId: l.id }, 'Late return cancelled.')}>Cancel</button>}</td></tr>)}</tbody></table></div> : <Empty icon="clock" title="No late returns">{role === 'resident' ? `You can come back as late as 12 midnight, ${LATE_ARRIVALS_PER_MONTH} times a month.` : 'Planned late returns will appear here.'}</Empty>}</Panel>;
  return <><PageTitle eyebrow="SAFE COMINGS AND GOINGS" title="Visitors & late returns" text={admin ? 'Who is expected at the front desk, and who will be back after 10 PM.' : role === 'guardian' ? 'Visitors and planned late returns for your resident.' : `Register visitors, and plan a late return up to 12 midnight (${LATE_ARRIVALS_PER_MONTH} a month).`} action={role === 'resident' && self?.status === 'active' && <div className="jn-inline-actions"><Button secondary icon="clock" onClick={lateReturn} disabled={used >= LATE_ARRIVALS_PER_MONTH}>Late return</Button><Button icon="plus" onClick={registerVisitor}>Register visitor</Button></div>}/>
    {admin && <Tabs values={[{ value: 'today', label: `Today (${x.visitors.filter(v => v.date === today).length})` }, { value: 'upcoming', label: 'Upcoming' }, { value: 'all', label: 'All visitors' }, { value: 'late', label: `Late returns (${x.lateArrivals.filter(l => l.date >= today && l.status === 'approved').length})` }]} selected={tab} set={setTab}/>}
    {admin ? (tab === 'late' ? lateTable : visitorTable) : <>{visitorTable}{lateTable}</>}{dialog}</>;
}

/* ---------------- Finances ---------------- */
export function Finances({ data, act }: PageProps) {
  const [dialog, open] = useDialog(); const month = data.meta.businessDate.slice(0, 7); const x = data.extras;
  const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(`${month}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - (5 - i)); return d.toISOString().slice(0, 7); });
  const istMonth = (iso?: string) => iso ? new Date(new Date(iso).getTime() + 19800000).toISOString().slice(0, 7) : '';
  const collected = (m: string) => data.payments.filter(p => p.status === 'verified' && istMonth(p.reviewedAt) === m).reduce((s, p) => s + p.amountPaise, 0);
  const billed = (m: string) => data.bills.filter(b => b.status !== 'cancelled' && b.period === m).reduce((s, b) => s + b.totalPaise, 0);
  const spent = (m: string) => x.expenses.filter(e => e.date.slice(0, 7) === m).reduce((s, e) => s + e.amountPaise, 0);
  const outstanding = data.bills.filter(b => b.status === 'unpaid' || b.status === 'pending').reduce((s, b) => s + Math.max(0, b.totalPaise - b.paidPaise), 0);
  const beds = data.rooms.flatMap(r => r.beds); const occupied = beds.filter(b => b.status === 'occupied').length;
  const peak = Math.max(1, ...months.flatMap(m => [collected(m), billed(m), spent(m)]));
  function addExpense() { open({ title: 'Record an expense', fields: [{ name: 'date', label: 'Date', type: 'date', value: data.meta.businessDate }, { name: 'category', label: 'Category', options: EXPENSE_CATEGORIES.map(c => ({ value: c, label: c })) }, { name: 'amount', label: 'Amount (₹)', type: 'number', min: 1, step: '.01' }, { name: 'note', label: 'Note', required: false, wide: true }], submit: 'Save expense', save: v => act('expense.add', { date: v.date, category: v.category, amountPaise: rupeesToPaise(v.amount), note: v.note || '' }, 'Expense recorded.') }); }
  const thisMonth = x.expenses.filter(e => e.date.slice(0, 7) === month); const byCategory = EXPENSE_CATEGORIES.map(c => ({ c, total: thisMonth.filter(e => e.category === c).reduce((s, e) => s + e.amountPaise, 0) })).filter(r => r.total);
  return <><PageTitle eyebrow="EVERY RUPEE, AT A GLANCE" title="Finances" text="Money collected, money owed, money spent, and how full Ryuu is." action={<Button icon="plus" onClick={addExpense}>Record expense</Button>}/>
    <div className="jn-stats-grid"><Stat title="Collected this month" value={money(collected(month))} detail="Verified payments" icon="wallet" accent/><Stat title="Still owed" value={money(outstanding)} detail="Unpaid and in-review bills" icon="clock"/><Stat title="Spent this month" value={money(spent(month))} detail={`Net ${money(collected(month) - spent(month))}`} icon="download"/><Stat title="Occupancy" value={`${beds.length ? Math.round(occupied / beds.length * 100) : 0}%`} detail={`${occupied} of ${beds.length} beds`} icon="bed"/></div>
    <Panel className="jn-panel-padded" title="Last six months" eyebrow="BILLED · COLLECTED · SPENT"><div className="jn-finance-chart" role="img" aria-label="Billed, collected and spent for the last six months">{months.map(m => <div key={m} className="jn-finance-month"><div className="jn-finance-bars">{[['billed', billed(m)], ['collected', collected(m)], ['spent', spent(m)]].map(([k, v]) => <span key={k as string} className={`bar ${k}`} style={{ height: `${Math.max(2, (v as number) / peak * 100)}%` }} title={`${label(k)}: ${money(v as number)}`}/>)}</div><small>{new Date(`${m}-01T00:00:00Z`).toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' })}</small></div>)}</div><div className="jn-finance-legend"><span><i className="billed"/>Billed</span><span><i className="collected"/>Collected</span><span><i className="spent"/>Spent</span></div></Panel>
    <div className="jn-two-col"><Panel className="jn-panel-padded" title="Spending by category · this month">{byCategory.length ? byCategory.map(r => <div key={r.c} className="jn-row-line"><span>{r.c}</span><strong>{money(r.total)}</strong></div>) : <Empty icon="wallet" title="No expenses this month"/>}</Panel>
    <Panel title="Recent expenses" className="jn-table-panel">{x.expenses.length ? <div className="jn-table-scroll"><table className="jn-table"><thead><tr><th>Date</th><th>Category</th><th>Amount</th><th>Note</th><th/></tr></thead><tbody>{x.expenses.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30).map(e => <tr key={e.id}><td>{date(e.date)}</td><td>{e.category}</td><td>{money(e.amountPaise)}</td><td>{e.note || '—'}<small className="jn-block">by {e.createdBy}</small></td><td><button className="jn-text-button" onClick={() => { if (confirm('Remove this expense?')) act('expense.remove', { expenseId: e.id }, 'Expense removed.'); }}>Remove</button></td></tr>)}</tbody></table></div> : <Empty icon="wallet" title="No expenses yet">Record groceries, salaries, bills and repairs to see where money goes.</Empty>}</Panel></div>{dialog}</>;
}

/* ---------------- Maintenance schedule ---------------- */
export function Maintenance({ data, act }: PageProps) {
  const [dialog, open] = useDialog(); const today = data.meta.businessDate; const tasks = data.extras.maintenance.slice().sort((a, b) => a.nextDue.localeCompare(b.nextDue));
  function add() { open({ title: 'Add a recurring task', fields: [{ name: 'title', label: 'Task', wide: true, hint: 'For example: Clean water purifier filters' }, { name: 'everyDays', label: 'Repeat every (days)', type: 'number', min: 1, max: 730, value: 30 }, { name: 'nextDue', label: 'First due date', type: 'date', value: today }, { name: 'notes', label: 'Notes', type: 'textarea', required: false, wide: true }], submit: 'Add task', save: v => act('maintenance.add', { ...v, everyDays: Number(v.everyDays) }, 'Task added.') }); }
  function suggest() { return [['Water purifier filter change', 90], ['AC servicing', 120], ['Pest control', 60], ['Water tank cleaning', 180], ['Fire extinguisher check', 365], ['Washing machine cleaning', 30]].filter(([t]) => !tasks.some(k => k.title === t)); }
  return <><PageTitle eyebrow="LOOK AFTER RYUU" title="Maintenance" text="Recurring jobs, with a reminder to admins when each one is due." action={<Button icon="plus" onClick={add}>Add task</Button>}/>
    <Panel className="jn-table-panel">{tasks.length ? <div className="jn-table-scroll"><table className="jn-table"><thead><tr><th>Task</th><th>Repeats</th><th>Next due</th><th>Last done</th><th/></tr></thead><tbody>{tasks.map(t => <tr key={t.id}><td><strong>{t.title}</strong>{t.notes && <small className="jn-block">{t.notes}</small>}</td><td>Every {t.everyDays} days</td><td><Badge status={t.nextDue < today ? 'rejected' : t.nextDue === today ? 'pending' : 'verified'}>{t.nextDue < today ? `Overdue · ${date(t.nextDue)}` : t.nextDue === today ? 'Due today' : date(t.nextDue)}</Badge></td><td>{t.lastDone ? date(t.lastDone) : '—'}</td><td><div className="jn-row-actions"><button className="jn-small-button good" onClick={() => act('maintenance.done', { taskId: t.id }, `${t.title} marked done.`)}>Mark done</button><button className="jn-text-button" onClick={() => { if (confirm(`Remove “${t.title}”?`)) act('maintenance.remove', { taskId: t.id }, 'Task removed.'); }}>Remove</button></div></td></tr>)}</tbody></table></div> : <Empty icon="settings" title="No recurring tasks yet">Add jobs like filter changes and AC servicing to get reminders.</Empty>}</Panel>
    {suggest().length > 0 && <Panel className="jn-panel-padded" title="Common tasks" eyebrow="ONE TAP TO ADD"><div className="jn-chip-row">{suggest().map(([t, d]) => <button key={t as string} className="jn-small-button" onClick={() => act('maintenance.add', { title: t, everyDays: d, nextDue: today, notes: '' }, `${t} added.`)}>+ {t} · every {d} days</button>)}</div></Panel>}{dialog}</>;
}

/* ---------------- Enquiries: visit requests, reviews, waitlist ---------------- */
export function Enquiries({ data, act }: PageProps) {
  const x = data.extras; const [tab, setTab] = useState('visits');
  const visits = x.visitRequests.slice().reverse(); const reviews = x.reviews.slice().reverse(); const waiting = x.waitlist.filter(w => w.status !== 'removed').slice().reverse();
  return <><PageTitle eyebrow="NEW FACES, KIND WORDS" title="Enquiries & feedback" text="Visit requests from the website, private feedback from residents, and the waitlist."/>
    <Tabs values={[{ value: 'visits', label: `Visit requests (${x.visitRequests.filter(v => v.status === 'new').length} new)` }, { value: 'reviews', label: `Resident feedback (${x.reviews.length})` }, { value: 'waitlist', label: `Waitlist (${x.waitlist.filter(w => w.status === 'waiting').length})` }]} selected={tab} set={setTab}/>
    {tab === 'visits' && <Panel className="jn-table-panel">{visits.length ? <div className="jn-table-scroll"><table className="jn-table"><thead><tr><th>Visitor</th><th>Preferred</th><th>Message</th><th>Status</th><th/></tr></thead><tbody>{visits.map(v => <tr key={v.id}><td><Person name={v.name} subtitle={[v.phone, v.email].filter(Boolean).join(' · ')}/></td><td>{date(v.preferredDate)} · {v.preferredTime}<small className="jn-block">Asked {date(v.createdAt, true)}</small></td><td>{v.message || '—'}</td><td><Badge status={v.status === 'new' ? 'pending' : v.status === 'cancelled' ? 'rejected' : 'verified'}>{label(v.status)}</Badge></td><td><select aria-label="Update status" value={v.status} onChange={e => act('visit.update', { requestId: v.id, status: e.target.value }, 'Visit request updated.')}>{['new', 'confirmed', 'done', 'cancelled'].map(s => <option key={s} value={s}>{label(s)}</option>)}</select></td></tr>)}</tbody></table></div> : <Empty icon="home" title="No visit requests yet">People can book a visit from the homepage.</Empty>}</Panel>}
    {tab === 'reviews' && <Panel className="jn-table-panel">{reviews.length ? <div className="jn-review-list">{reviews.map(r => <article key={r.id} className="jn-review-card"><div><strong>{nameOf(data, r.residentId)}</strong><span className="jn-stars" aria-label={`${r.rating} out of 5`}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span><small className="jn-muted">{date(r.createdAt, true)}</small></div><p>{r.text}</p></article>)}</div> : <Empty icon="message" title="No feedback yet">Residents can give feedback from About / My details. Only admins see it.</Empty>}</Panel>}
    {tab === 'waitlist' && <Panel className="jn-table-panel">{waiting.length ? <div className="jn-table-scroll"><table className="jn-table"><thead><tr><th>Applicant</th><th>Wants</th><th>Joined</th><th>Status</th><th/></tr></thead><tbody>{waiting.map(w => <tr key={w.id}><td>{nameOf(data, w.residentId)}</td><td>{w.sharing ? `${w.sharing} sharing` : 'Any room'}</td><td>{date(w.createdAt)}</td><td><Badge status={w.status === 'notified' ? 'verified' : 'pending'}>{w.status === 'notified' ? `Told about a bed ${date(w.notifiedAt)}` : 'Waiting'}</Badge></td><td><button className="jn-text-button" onClick={() => act('waitlist.remove', { entryId: w.id }, 'Removed from the waitlist.')}>Remove</button></td></tr>)}</tbody></table></div> : <Empty icon="bed" title="Nobody is waiting">When beds are full, applicants can join the waitlist from Rooms & beds.</Empty>}</Panel>}</>;
}

/* ---------------- Small panels used inside existing pages ---------------- */
/** Rooms page, applicants only: join the waitlist when nothing suitable is free. */
export function WaitlistPanel({ data, act }: Pick<PageProps, 'data' | 'act'>) {
  const [sharing, setSharing] = useState('0'); const self = data.residents.find(r => r.userId === data.user.id); if (!self || self.status !== 'applicant') return null;
  const entry = data.extras.waitlist.find(w => w.residentId === self.id && w.status !== 'removed');
  return <Panel className="jn-panel-padded" title="Can’t find the right bed?" eyebrow="WAITLIST">{entry ? <div className="jn-row-line"><span>{entry.status === 'notified' ? 'A bed matching your choice is free. Pick it on the floor plan above.' : `You’re on the waitlist for ${entry.sharing ? `a ${entry.sharing}-sharing room` : 'any room'}. We’ll tell you as soon as a bed opens.`}</span><button className="jn-small-button" onClick={() => act('waitlist.leave', {}, 'You left the waitlist.')}>Leave waitlist</button></div> : <div className="jn-row-line"><label className="jn-field jn-inline-field"><span>Room type</span><select value={sharing} onChange={e => setSharing(e.target.value)}><option value="0">Any room</option><option value="3">3 sharing</option><option value="4">4 sharing</option><option value="5">5 sharing</option></select></label><Button icon="bell" onClick={() => act('waitlist.join', { sharing: Number(sharing) }, 'You’re on the waitlist.')}>Join the waitlist</Button></div>}</Panel>;
}
/** Profile page, residents: write a review that admins approve for the homepage. */
export function ReviewPanel({ data, act }: Pick<PageProps, 'data' | 'act'>) {
  const [dialog, open] = useDialog(); const self = data.residents.find(r => r.userId === data.user.id); if (!self || !['active', 'checked_out'].includes(self.status)) return null;
  const mine = data.extras.reviews[0]; const expiries = data.extras.documentExpiries;
  return <>{expiries.length > 0 && <Panel className="jn-panel-padded" title="Document dates" eyebrow="KEEP THESE UP TO DATE">{expiries.map(e => <div key={e.id} className="jn-row-line"><span>{e.kind}</span><Badge status={e.expiresOn < data.meta.businessDate ? 'rejected' : 'verified'}>Expires {date(e.expiresOn)}</Badge></div>)}</Panel>}
    <Panel className="jn-panel-padded" title="Share your feedback" eyebrow="PRIVATE, FOR THE HOSTEL TEAM">{mine ? <div className="jn-review-card"><div><span className="jn-stars">{'★'.repeat(mine.rating)}{'☆'.repeat(5 - mine.rating)}</span><Badge status="verified">Sent {date(mine.createdAt)}</Badge></div><p>{mine.text}</p></div> : <p className="jn-muted">How is your stay? Tell the hostel team what’s working and what could be better. Only the admins see this.</p>}
      <Button secondary icon="message" onClick={() => open({ title: mine ? 'Update your feedback' : 'Give feedback', fields: [{ name: 'rating', label: 'Rating', options: [5, 4, 3, 2, 1].map(n => ({ value: String(n), label: `${'★'.repeat(n)} (${n})` })), value: String(mine?.rating ?? 5) }, { name: 'text', label: 'Your feedback', type: 'textarea', wide: true, value: mine?.text }], submit: 'Send feedback', save: v => act('review.submit', { rating: Number(v.rating), text: v.text }, 'Thank you. The hostel team will read your feedback.') })}>{mine ? 'Update feedback' : 'Give feedback'}</Button></Panel>{dialog}</>;
}
/** Resident record (admin): confirm phone by call, and track document expiry dates. */
export function ResidentAdminExtras({ data, act, refresh, resident }: Pick<PageProps, 'data' | 'act' | 'refresh'> & { resident: Resident }) {
  const [dialog, open] = useDialog(); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const expiries = data.extras.documentExpiries.filter(e => e.residentId === resident.id);
  async function confirmPhone() { if (!confirm(`Confirm ${resident.phone} belongs to ${resident.name}? Only do this after calling them on this number.`)) return; setBusy(true); setError(''); try { await post('/api/admin/verify-phone', { userId: resident.userId }); await refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  return <div className="jn-guardian-actions"><h3>Contacts & document dates</h3>{error && <div className="jn-alert jn-alert-error">{error}</div>}
    <div className="jn-row-line"><span>Email {resident.emailVerified ? 'verified' : 'not verified yet'} · Phone {resident.phoneVerified ? 'verified' : 'not verified yet'}</span>{!resident.phoneVerified && <button className="jn-small-button good" disabled={busy} onClick={confirmPhone}>Confirm phone (after a call)</button>}</div>
    {expiries.map(e => <div key={e.id} className="jn-row-line"><span>{e.kind}</span><span><Badge status={e.expiresOn < data.meta.businessDate ? 'rejected' : 'verified'}>Expires {date(e.expiresOn)}</Badge> <button className="jn-text-button" onClick={() => act('expiry.remove', { expiryId: e.id }, 'Date removed.')}>Remove</button></span></div>)}
    <button className="jn-small-button" onClick={() => open({ title: 'Add a document expiry date', note: 'Admins and the resident get reminders 30 days and 7 days before, and on the day.', fields: [{ name: 'kind', label: 'Document', options: DOCUMENT_KINDS.map(k => ({ value: k, label: k })) }, { name: 'expiresOn', label: 'Expires on', type: 'date' }], submit: 'Save date', save: v => act('expiry.set', { residentId: resident.id, ...v }, 'Expiry date saved.') })}>Add expiry date</button>{dialog}</div>;
}
/** Payments page: receipt link for a verified payment. */
export function ReceiptLink({ paymentId }: { paymentId: string }) { return <a className="jn-file-link" href={`/api/receipts/${paymentId}`}><Icon name="download" size={15}/>Download receipt</a>; }
/** Keeps a page's data fresh while it is open (used by the visitor desk). */
export function useAutoRefresh(refresh: () => Promise<void>, ms = 20000) { useEffect(() => { const t = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, ms); return () => clearInterval(t); }, [refresh, ms]); }
export { api };

/** Weekly menu: admins set it, residents see it (with tomorrow highlighted) and rate meals. */
export function WeeklyMenu(props: PageProps) {
  const admin = props.data.user.role === 'admin';
  return <><PageTitle eyebrow="WHAT’S COOKING THIS WEEK" title="Weekly menu" text={admin ? 'Set breakfast, lunch and dinner for each day. Residents see it in their portal straight away.' : 'Breakfast, lunch and dinner for every day of the week.'}/>{admin ? <KitchenExtras {...props}/> : <MenuAndFeedback {...props}/>}</>;
}

/* ---------------- Admission form answers ---------------- */
const ADMISSION_LABELS: Record<string, Record<string, string>> = {
  maritalStatus: { single: 'Single', married: 'Married' }, idType: { aadhaar: 'Aadhaar', passport: 'Passport', voter_id: 'Voter ID' },
  acPreference: { ac: 'AC', non_ac: 'Non-AC', either: 'No preference' }, roomType: { double: 'Double sharing', triple: 'Triple sharing', four: 'Four sharing', five: 'Five sharing' },
  stayDuration: { below_1_month: 'Below 1 month', '1_3_months': '1–3 months', '3_6_months': '3–6 months', '6_plus_months': '6+ months' },
  foodType: { veg: 'Veg', non_veg: 'Non-veg' }, parking: { none: 'Not needed', bike: 'Bike', car: 'Car', both: 'Bike and car' },
};
const ADMISSION_DOCS = [
  { field: 'photoDocumentId', purpose: 'photo', title: 'Passport-size photo', accept: 'image/jpeg,image/png,image/webp' },
  { field: 'employmentProofId', purpose: 'employment_proof', title: 'Employment / college proof', accept: 'application/pdf,image/*' },
  { field: 'addressProofId', purpose: 'address_proof', title: 'Address proof', accept: 'application/pdf,image/*' },
  { field: 'medicalCertificateId', purpose: 'medical', title: 'Medical fitness certificate', accept: 'application/pdf,image/*' },
] as const;
/** The admission form, grouped into the same numbered sections as the printed form. Residents can upload missing documents. */
export function AdmissionPanel({ data, act, refresh, resident, compact = false }: Pick<PageProps, 'data' | 'refresh'> & { act?: PageProps['act']; resident: Resident; compact?: boolean }) {
  const a = resident.admission; const own = data.user.id === resident.userId; const [busy, setBusy] = useState(''); const [error, setError] = useState(''); const [dialog, open] = useDialog();
  const opt = (key: string) => Object.entries(ADMISSION_LABELS[key]).map(([value, text]) => ({ value, label: text }));
  const student = resident.profession === 'student';
  function fill() { if (!act) return; open({ title: a ? 'Edit your admission form' : 'Fill in your admission form', note: a ? 'Your uploaded documents stay as they are.' : 'These are the questions from the Ryuu admission form. It takes about 3 minutes.', submit: 'Save admission form', fields: [
    { name: 'maritalStatus', label: 'Marital status', options: opt('maritalStatus'), value: a?.maritalStatus }, { name: 'nationality', label: 'Nationality', value: a?.nationality || 'Indian' },
    { name: 'idType', label: 'ID type', options: opt('idType'), value: a?.idType || 'aadhaar' }, { name: 'idNumber', label: 'ID number', value: a?.idNumber, hint: a?.idType === 'aadhaar' ? 'Leave as it is to keep your saved Aadhaar number.' : 'Aadhaar: 12 digits. Only the last 4 are kept.' },
    { name: 'currentAddress', label: 'Current address', type: 'textarea', wide: true, value: a?.currentAddress || resident.address }, { name: 'city', label: 'City', value: a?.city }, { name: 'state', label: 'State', value: a?.state || 'Karnataka' }, { name: 'pincode', label: 'PIN code', value: a?.pincode },
    { name: 'organization', label: student ? 'College / institution' : 'Company / organisation', value: resident.organization, required: false }, { name: 'designation', label: student ? 'Course and year' : 'Designation', value: a?.designation },
    { name: 'officeAddress', label: student ? 'College address' : 'Office address', type: 'textarea', wide: true, value: a?.officeAddress, required: false }, { name: 'officeContact', label: 'Office / college contact number', type: 'tel', value: a?.officeContact, required: false },
    ...(!student ? [{ name: 'monthlyIncome', label: 'Monthly income (₹)', value: a?.monthlyIncome, required: false }] : []),
    { name: 'emergencyName', label: 'Emergency contact name', value: a?.emergencyName }, { name: 'emergencyRelationship', label: 'Relationship', value: a?.emergencyRelationship }, { name: 'emergencyPhone', label: 'Emergency mobile', type: 'tel', value: a?.emergencyPhone }, { name: 'emergencyAddress', label: 'Emergency contact address', type: 'textarea', wide: true, value: a?.emergencyAddress },
    { name: 'acPreference', label: 'Air-conditioning', options: opt('acPreference'), value: a?.acPreference }, { name: 'roomType', label: 'Room type', options: opt('roomType'), value: a?.roomType }, { name: 'stayDuration', label: 'Duration of stay', options: opt('stayDuration'), value: a?.stayDuration }, { name: 'foodType', label: 'Food type', options: opt('foodType'), value: a?.foodType }, { name: 'parking', label: 'Parking', options: opt('parking'), value: a?.parking },
  ], save: v => act('admission.submit', v, 'Admission form saved.') }); }
  if (!a) return compact ? <div className="jn-guardian-actions"><h3>Admission form</h3><p className="jn-muted">Not filled in yet. This account was created before the admission form was added, or by an admin. The resident can fill it in from About / My details.</p></div>
    : <Panel className="jn-panel-padded jn-adm-empty" title="Admission form" eyebrow="NOT FILLED IN YET" action={own && act ? <Button icon="plus" onClick={fill}>Fill in the admission form</Button> : undefined}><p className="jn-muted">Your account was set up before the admission form was added, so the hostel doesn’t have these details yet: marital status, ID number, current address, work or college details, emergency contact, room and food preferences, and a few documents.</p>{dialog}</Panel>;
  const v = (key: string, value: string) => ADMISSION_LABELS[key]?.[value] || value;

  const sections: { title: string; rows: [string, string | undefined][] }[] = [
    { title: 'Personal details', rows: [['Marital status', v('maritalStatus', a.maritalStatus)], ['Nationality', a.nationality], [v('idType', a.idType) + ' number', a.idNumber], ...(compact ? [['Date of birth', resident.dob ? date(resident.dob) : undefined] as [string, string | undefined]] : [])] },
    { title: 'Address', rows: [['Current address', a.currentAddress], ['City', a.city], ['State', a.state], ['PIN code', a.pincode]] },
    { title: student ? 'College details' : 'Employment details', rows: [[student ? 'College' : 'Company', resident.organization], [student ? 'Course' : 'Designation', a.designation], [student ? 'College address' : 'Office address', a.officeAddress], ['Contact number', a.officeContact], ...(!student ? [['Monthly income', a.monthlyIncome ? money(Number(a.monthlyIncome) * 100) : undefined] as [string, string | undefined]] : [])] },
    { title: 'Emergency contact', rows: [['Name', a.emergencyName], ['Relationship', a.emergencyRelationship], ['Mobile', a.emergencyPhone], ['Address', a.emergencyAddress]] },
    { title: 'Accommodation', rows: [['Room type', v('roomType', a.roomType)], ['Air-conditioning', v('acPreference', a.acPreference)], ['Duration', v('stayDuration', a.stayDuration)], ['Food', v('foodType', a.foodType)], ['Parking', v('parking', a.parking)], ['Expected joining', resident.intendedMoveIn ? date(resident.intendedMoveIn) : undefined]] },
  ];
  async function add(doc: typeof ADMISSION_DOCS[number], file?: File) { if (!file) return; setBusy(doc.field); setError(''); try { const form = new FormData(); form.append('file', file); form.append('purpose', doc.purpose); const up = await api<{ id: string }>('/api/uploads', { method: 'POST', body: form }); await post('/api/auth/profile', { [doc.field]: up.id }); await refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(''); } }
  const uploaded = ADMISSION_DOCS.filter(d => a[d.field]).length;
  const body = <>{error && <div className="jn-alert jn-alert-error">{error}</div>}
    <div className={`jn-adm-grid ${compact ? 'compact' : ''}`}>{sections.map((sec, i) => { const rows = sec.rows.filter(([, val]) => val); return <section key={sec.title} className="jn-adm-section"><header><span>{String(i + 1).padStart(2, '0')}</span><h4>{sec.title}</h4></header>{rows.length ? <dl>{rows.map(([k, val]) => <div key={k}><dt>{k}</dt><dd>{val}</dd></div>)}</dl> : <p className="jn-muted">Not filled in.</p>}</section>; })}
      <section className="jn-adm-section jn-adm-docs"><header><span>06</span><h4>Documents</h4><Badge status={uploaded === ADMISSION_DOCS.length ? 'verified' : 'pending'}>{uploaded} of {ADMISSION_DOCS.length}</Badge></header>
        {ADMISSION_DOCS.map(doc => { const id = a[doc.field]; return <div key={doc.field} className="jn-adm-doc"><span><strong>{doc.title}</strong>{id ? <a className="jn-file-link" href={`/api/uploads/${id}`} target="_blank" rel="noreferrer"><Icon name="download" size={14}/>View file</a> : <small className="jn-muted">Not uploaded</small>}</span>{own && <label className="jn-small-button">{busy === doc.field ? 'Uploading…' : id ? 'Replace' : 'Upload'}<input type="file" hidden accept={doc.accept} onChange={e => add(doc, e.target.files?.[0])}/></label>}</div>; })}
        <p className="jn-adm-note">{own ? 'ID proofs for you and your guardian are under Identity documents.' : 'ID proofs are checked under Identity review.'}</p>
      </section>
    </div>
    <p className="jn-adm-declared"><Icon name="check" size={15}/>Declaration accepted on {date(a.declaredAt, true)}</p></>;
  return compact ? <div className="jn-guardian-actions"><h3>Admission form</h3>{body}</div> : <Panel className="jn-panel-padded" title="Admission form" eyebrow="WHAT YOU TOLD US" action={own && act ? <Button secondary icon="settings" onClick={fill}>Edit answers</Button> : undefined}>{body}{dialog}</Panel>;
}

/* ---------------- PhonePe online payment ---------------- */
/** "Pay with PhonePe" for one bill: the server creates the order, then the browser goes to PhonePe. */
export function PhonePePayButton({ data, billId, amountPaise }: { data: PageProps['data']; billId: string; amountPaise: number }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  if (!data.meta.phonepe || data.meta.phonepe === 'off') return null;
  async function pay() { setBusy(true); setError(''); try { const r = await post<{ checkoutUrl: string }>('/api/payments/phonepe', { billId }); window.location.assign(r.checkoutUrl); } catch (e) { setError((e as Error).message); setBusy(false); } }
  return <span className="jn-phonepe"><button type="button" className="jn-button primary jn-phonepe-button" disabled={busy} onClick={pay}>{busy ? 'Opening PhonePe…' : `Pay ${money(amountPaise)} with PhonePe`}</button>{data.meta.phonepe !== 'production' && <small className="jn-muted">{data.meta.phonepe === 'simulated' ? 'Test mode: no real money moves.' : 'PhonePe sandbox: test payments only.'}</small>}{error && <small className="jn-warning-text">{error}</small>}</span>;
}
/** Shown when PhonePe sends the resident back (?phonepe=<order>): asks the server for the real result. */
export function PhonePeReturn({ refresh }: { refresh: () => Promise<void> }) {
  const [state, setState] = useState<'checking' | 'COMPLETED' | 'FAILED' | 'PENDING' | 'error' | ''>(''); const [message, setMessage] = useState('');
  useEffect(() => {
    const params = new URLSearchParams(window.location.search); const order = params.get('phonepe'); if (!order) return;
    let tries = 0; setState('checking');
    const check = async () => {
      try { const r = await post<{ state: string }>('/api/payments/phonepe/status', { merchantOrderId: order }); tries++;
        if (r.state === 'PENDING' && tries < 6) { setState('PENDING'); setTimeout(check, 5000); return; }
        setState(r.state as any); await refresh();
        params.delete('phonepe'); window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
      } catch (e) { setState('error'); setMessage((e as Error).message); }
    };
    void check();
  }, [refresh]);
  if (!state) return null;
  const text = state === 'checking' ? 'Checking your PhonePe payment…' : state === 'COMPLETED' ? 'Payment successful. Your bill is paid and the receipt is ready below.' : state === 'FAILED' ? 'The payment did not go through. No money was taken, or your bank will return it. You can try again.' : state === 'PENDING' ? 'PhonePe is still confirming the payment. This page will update; you can also check back in a few minutes.' : message || 'Could not check the payment. We will keep checking in the background.';
  return <div role="status" className={`jn-alert ${state === 'COMPLETED' ? 'jn-alert-success' : state === 'FAILED' || state === 'error' ? 'jn-alert-error' : ''} jn-phonepe-result`}>{text}</div>;
}
