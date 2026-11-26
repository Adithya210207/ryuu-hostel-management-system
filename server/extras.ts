// Server logic for the November 2026 feature batch. domain.ts calls into this module and passes
// its helpers through `Ctx`, so this file never imports domain.ts (no circular imports).
import { randomUUID } from 'node:crypto';
import type { DomainUser, Resident, Room, Snapshot } from '../shared/domain';
import { DOCUMENT_KINDS, EXPENSE_CATEGORIES, LATE_ARRIVALS_PER_MONTH, LATE_RETURN_TIMES, LAUNDRY_HOURS, emptyExtras, timeLabel, type Extras, type MealName } from '../shared/extras';

const HOUR = 3_600_000, DAY = 24 * HOUR, IST = 330 * 60_000;
const id = () => randomUUID();
const businessDate = (now: Date) => new Date(now.getTime() + IST).toISOString().slice(0, 10);
const businessHour = (now: Date) => { const d = new Date(now.getTime() + IST); return d.getUTCHours() + d.getUTCMinutes() / 60; };
const localTime = (day: string, hour = 0) => new Date(new Date(`${day}T00:00:00Z`).getTime() - IST + hour * HOUR);
const addDays = (day: string, n: number) => new Date(new Date(`${day}T00:00:00Z`).getTime() + n * DAY).toISOString().slice(0, 10);
const weekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();
const hhmmHours = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h + m / 60; };

/** The slice of domain state this module needs. */
export interface ExtrasState { extras: Extras; residents: Resident[]; rooms: Room[]; actors: Record<string, DomainUser>; attendance: Snapshot['attendance']; outpasses: Snapshot['outpasses'] }
export interface Ctx {
  fail(message: string, status?: number): never;
  notify(userId: string | undefined, title: string, body: string, key: string): void;
  notifyAdmins(title: string, body: string, key: string): void;
  audit(action: string, subjectId: string, details: string): void;
}

/** Older saved states have no `extras`; fill in anything missing. */
export function ensureExtras(state: { extras?: Partial<Extras> }): Extras {
  const base = emptyExtras(); const current = (state.extras ??= base) as Extras;
  for (const [key, value] of Object.entries(base)) if ((current as any)[key] === undefined) (current as any)[key] = value;
  return current;
}

export function queueEmail(state: { extras?: Partial<Extras> }, email: { userId: string; to: string; subject: string; text: string; kind: string; batchId?: string }, now = new Date()): void {
  if (!email.to) return;
  ensureExtras(state).outbox.push({ id: id(), ...email, status: 'queued', createdAt: now.toISOString() });
}

function text(ctx: Ctx, value: unknown, field: string, max = 500, optional = false): string {
  if (optional && (value === undefined || value === null || value === '')) return '';
  if (typeof value !== 'string' || !value.trim()) ctx.fail(`${field} is required.`);
  const v = (value as string).trim(); if (v.length > max) ctx.fail(`${field} is too long.`); return v;
}
function day(ctx: Ctx, value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) ctx.fail(`${field} is invalid.`);
  return value as string;
}
function adminOnly(ctx: Ctx, user: DomainUser) { if (user.role !== 'admin') ctx.fail('Administrator access is required.', 403); }
function ownResident(ctx: Ctx, state: ExtrasState, user: DomainUser, statuses: Resident['status'][] = ['active']): Resident {
  if (user.role !== 'resident') ctx.fail('This action is available to residents.', 403);
  const r = state.residents.find(r => r.userId === user.id); if (!r) ctx.fail('Resident not found.', 404);
  if (!statuses.includes(r.status)) ctx.fail(statuses.includes('active') && statuses.length === 1 ? 'This feature is available after move-in.' : 'This is not available for your account right now.');
  return r;
}
function find<T extends { id: string }>(ctx: Ctx, rows: T[], rowId: unknown, what: string): T { const row = rows.find(r => r.id === rowId); if (!row) ctx.fail(`${what} not found.`, 404); return row; }

/** Returns true when the action belongs to this module. */
export function applyExtraAction(state: ExtrasState, user: DomainUser, action: string, input: Record<string, any>, now: Date, ctx: Ctx): boolean {
  const x = ensureExtras(state as any); const today = businessDate(now); const time = now.toISOString();
  switch (action) {
    // ---- Weekly menu and meal feedback
    case 'menu.update': {
      adminOnly(ctx, user); const wd = Number(input.weekday); if (!Number.isInteger(wd) || wd < 0 || wd > 6) ctx.fail('Choose a day of the week.');
      x.weeklyMenu[String(wd)] = { breakfast: text(ctx, input.breakfast, 'Breakfast', 300, true), lunch: text(ctx, input.lunch, 'Lunch', 300, true), dinner: text(ctx, input.dinner, 'Dinner', 300, true), nonVegLunch: text(ctx, input.nonVegLunch, 'Non-veg lunch', 300, true), nonVegDinner: text(ctx, input.nonVegDinner, 'Non-veg dinner', 300, true) };
      ctx.audit(action, String(wd), 'Weekly menu updated'); return true;
    }
    case 'feedback.submit': {
      const r = ownResident(ctx, state, user); const d = day(ctx, input.date, 'Meal date'); if (d !== today && d !== addDays(today, -1)) ctx.fail('You can rate today’s or yesterday’s meals.');
      if (!['breakfast', 'lunch', 'dinner'].includes(input.meal)) ctx.fail('Choose a meal.'); if (typeof input.liked !== 'boolean') ctx.fail('Choose thumbs up or down.');
      const comment = text(ctx, input.comment, 'Comment', 500, true); const existing = x.mealFeedback.find(f => f.residentId === r.id && f.date === d && f.meal === input.meal);
      if (existing) Object.assign(existing, { liked: input.liked, comment, createdAt: time }); else x.mealFeedback.push({ id: id(), residentId: r.id, date: d, meal: input.meal as MealName, liked: input.liked, comment, createdAt: time });
      return true;
    }
    // ---- Laundry
    case 'laundry.book': {
      const r = ownResident(ctx, state, user); const d = day(ctx, input.date, 'Laundry date'); if (d < today || d > addDays(today, 2)) ctx.fail('Book a slot for today or the next two days.');
      const hour = Number(input.hour); if (!LAUNDRY_HOURS.includes(hour)) ctx.fail('Choose a slot between 6 AM and 10 PM.');
      if (d === today && hour <= businessHour(now) - 1) ctx.fail('That slot has already passed.');
      const live = x.laundry.filter(b => b.status === 'booked');
      if (live.some(b => b.residentId === r.id && b.date === d)) ctx.fail('You already have a laundry slot that day.');
      const taken = new Set(live.filter(b => b.date === d && b.hour === hour).map(b => b.machine)); const machine = Array.from({ length: x.laundryMachines }, (_, i) => i + 1).find(m => !taken.has(m));
      if (!machine) ctx.fail('All machines are booked for that hour.');
      x.laundry.push({ id: id(), residentId: r.id, date: d, hour, machine, status: 'booked', createdAt: time }); return true;
    }
    case 'laundry.cancel': {
      const b = find(ctx, x.laundry, input.bookingId, 'Booking'); if (user.role !== 'admin') { const r = ownResident(ctx, state, user); if (b.residentId !== r.id) ctx.fail('Booking not found.', 404); }
      b.status = 'cancelled'; return true;
    }
    case 'laundry.settings': { adminOnly(ctx, user); const n = Number(input.machines); if (!Number.isInteger(n) || n < 1 || n > 10) ctx.fail('Enter between 1 and 10 machines.'); x.laundryMachines = n; ctx.audit(action, 'laundry', `${n} machines`); return true; }
    // ---- Visitors
    case 'visitor.register': {
      const r = ownResident(ctx, state, user); const d = day(ctx, input.date, 'Visit date'); if (d < today || d > addDays(today, 14)) ctx.fail('Register visits for today or the next two weeks.');
      const at = text(ctx, input.expectedAt, 'Expected time', 5); if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(at)) ctx.fail('Expected time is invalid.');
      const v = { id: id(), residentId: r.id, name: text(ctx, input.name, 'Visitor name', 120), phone: text(ctx, input.phone, 'Visitor phone', 30), relation: text(ctx, input.relation, 'Relation', 80), date: d, expectedAt: at, status: 'expected' as const, createdAt: time };
      x.visitors.push(v); ctx.notifyAdmins('Visitor expected', `${r.name} expects ${v.name} (${v.relation}) on ${d} at ${timeLabel(at)}.`, `visitor:${v.id}`); return true;
    }
    case 'visitor.cancel': { const r = ownResident(ctx, state, user); const v = find(ctx, x.visitors, input.visitorId, 'Visit'); if (v.residentId !== r.id || v.status !== 'expected') ctx.fail('Only expected visits can be cancelled.'); v.status = 'cancelled'; return true; }
    case 'visitor.mark': {
      adminOnly(ctx, user); const v = find(ctx, x.visitors, input.visitorId, 'Visit');
      if (input.status === 'arrived' && v.status === 'expected') { v.status = 'arrived'; v.arrivedAt = time; }
      else if (input.status === 'left' && v.status === 'arrived') { v.status = 'left'; v.leftAt = time; }
      else ctx.fail('That visitor update is not possible.');
      ctx.audit(action, v.id, `${v.name} ${v.status}`); const r = state.residents.find(r => r.id === v.residentId); ctx.notify(r?.userId, v.status === 'arrived' ? 'Your visitor has arrived' : 'Your visitor has left', `${v.name} ${v.status === 'arrived' ? 'is at the front desk' : 'has signed out'}.`, `visitor-${v.status}:${v.id}`); return true;
    }
    // ---- Late arrivals: 2 per month, back by 12 midnight at the latest
    case 'late.request': {
      const r = ownResident(ctx, state, user); const d = day(ctx, input.date, 'Date'); if (d !== today && d !== addDays(today, 1)) ctx.fail('Late returns can be requested for tonight or tomorrow night.');
      const returnBy = String(input.returnBy); if (!LATE_RETURN_TIMES.includes(returnBy)) ctx.fail('The latest return time is 12 midnight.');
      if (d === today && businessHour(now) >= hhmmHours(returnBy)) ctx.fail('That time has already passed.');
      if (x.lateArrivals.some(l => l.residentId === r.id && l.date === d && l.status === 'approved')) ctx.fail('You already have a late return for that night.');
      const used = x.lateArrivals.filter(l => l.residentId === r.id && l.status === 'approved' && l.date.slice(0, 7) === d.slice(0, 7)).length;
      if (used >= LATE_ARRIVALS_PER_MONTH) ctx.fail(`You have used both late returns for ${d.slice(0, 7)}. Contact the hostel team if it’s urgent.`);
      const l = { id: id(), residentId: r.id, date: d, returnBy, reason: text(ctx, input.reason, 'Reason', 300), status: 'approved' as const, createdAt: time }; x.lateArrivals.push(l);
      const body = `${r.name} will be back by ${timeLabel(returnBy)} on ${d}. Reason: ${l.reason}`;
      ctx.notifyAdmins('Late return', body, `late:${l.id}`); ctx.notify(r.guardianUserId, 'Late return planned', body, `late-guardian:${l.id}`); ctx.audit(action, l.id, body); return true;
    }
    case 'late.cancel': {
      const r = ownResident(ctx, state, user); const l = find(ctx, x.lateArrivals, input.lateId, 'Late return'); if (l.residentId !== r.id || l.status !== 'approved' || l.date < today) ctx.fail('Only upcoming late returns can be cancelled.');
      l.status = 'cancelled'; ctx.notifyAdmins('Late return cancelled', `${r.name} cancelled the late return for ${l.date}.`, `late-cancel:${l.id}`); ctx.notify(r.guardianUserId, 'Late return cancelled', `${r.name} will be back at the usual time on ${l.date}.`, `late-cancel-guardian:${l.id}`); return true;
    }
    // ---- Finances
    case 'expense.add': {
      adminOnly(ctx, user); const amount = Number(input.amountPaise); if (!Number.isSafeInteger(amount) || amount <= 0) ctx.fail('Enter an amount.');
      const category = text(ctx, input.category, 'Category', 80); if (!EXPENSE_CATEGORIES.includes(category)) ctx.fail('Choose a category.');
      const e = { id: id(), date: day(ctx, input.date, 'Date'), category, amountPaise: amount, note: text(ctx, input.note, 'Note', 300, true), createdAt: time, createdBy: user.name }; x.expenses.push(e); ctx.audit(action, e.id, `${category} ₹${amount / 100}`); return true;
    }
    case 'expense.remove': { adminOnly(ctx, user); const e = find(ctx, x.expenses, input.expenseId, 'Expense'); x.expenses = x.expenses.filter(r => r.id !== e.id); ctx.audit(action, e.id, `${e.category} ₹${e.amountPaise / 100} removed`); return true; }
    // ---- Maintenance schedule
    case 'maintenance.add': {
      adminOnly(ctx, user); const every = Number(input.everyDays); if (!Number.isInteger(every) || every < 1 || every > 730) ctx.fail('Repeat every 1 to 730 days.');
      const t = { id: id(), title: text(ctx, input.title, 'Task', 120), everyDays: every, nextDue: day(ctx, input.nextDue, 'First due date'), notes: text(ctx, input.notes, 'Notes', 500, true), createdAt: time }; x.maintenance.push(t); ctx.audit(action, t.id, t.title); return true;
    }
    case 'maintenance.done': { adminOnly(ctx, user); const t = find(ctx, x.maintenance, input.taskId, 'Task'); t.lastDone = today; t.nextDue = addDays(today, t.everyDays); ctx.audit(action, t.id, `${t.title} done; next ${t.nextDue}`); return true; }
    case 'maintenance.remove': { adminOnly(ctx, user); const t = find(ctx, x.maintenance, input.taskId, 'Task'); x.maintenance = x.maintenance.filter(r => r.id !== t.id); ctx.audit(action, t.id, `${t.title} removed`); return true; }
    // ---- Waitlist
    case 'waitlist.join': {
      const r = ownResident(ctx, state, user, ['applicant']); const sharing = Number(input.sharing); if (![0, 3, 4, 5].includes(sharing)) ctx.fail('Choose a room type.');
      if (x.waitlist.some(w => w.residentId === r.id && w.status === 'waiting')) ctx.fail('You are already on the waitlist.');
      x.waitlist.push({ id: id(), residentId: r.id, sharing, status: 'waiting', createdAt: time }); ctx.notifyAdmins('Joined the waitlist', `${r.name} is waiting for ${sharing ? `a ${sharing}-sharing bed` : 'any bed'}.`, `waitlist:${r.id}:${time}`); return true;
    }
    case 'waitlist.leave': { const r = ownResident(ctx, state, user, ['applicant', 'booked', 'active']); for (const w of x.waitlist.filter(w => w.residentId === r.id && w.status !== 'removed')) w.status = 'removed'; return true; }
    case 'waitlist.remove': { adminOnly(ctx, user); find(ctx, x.waitlist, input.entryId, 'Waitlist entry').status = 'removed'; return true; }
    // ---- Document expiry
    case 'expiry.set': {
      adminOnly(ctx, user); const r = find(ctx, state.residents, input.residentId, 'Resident'); const kind = text(ctx, input.kind, 'Document', 80); if (!DOCUMENT_KINDS.includes(kind)) ctx.fail('Choose a document type.');
      const expiresOn = day(ctx, input.expiresOn, 'Expiry date'); const existing = x.documentExpiries.find(e => e.residentId === r.id && e.kind === kind);
      if (existing) existing.expiresOn = expiresOn; else x.documentExpiries.push({ id: id(), residentId: r.id, kind, expiresOn, createdAt: time });
      ctx.audit(action, r.id, `${kind} expires ${expiresOn}`); return true;
    }
    case 'expiry.remove': { adminOnly(ctx, user); const e = find(ctx, x.documentExpiries, input.expiryId, 'Document date'); x.documentExpiries = x.documentExpiries.filter(r => r.id !== e.id); return true; }
    // ---- Visit requests (from the public homepage) and reviews
    case 'visit.update': { adminOnly(ctx, user); const v = find(ctx, x.visitRequests, input.requestId, 'Visit request'); if (!['new', 'confirmed', 'done', 'cancelled'].includes(input.status)) ctx.fail('Choose a status.'); v.status = input.status; ctx.audit(action, v.id, v.status); return true; }
    case 'review.submit': {
      const r = ownResident(ctx, state, user, ['active', 'checked_out']); const rating = Number(input.rating); if (!Number.isInteger(rating) || rating < 1 || rating > 5) ctx.fail('Choose 1 to 5 stars.');
      const [first, last] = r.name.split(/\s+/); const displayName = `${first}${last ? ` ${last[0]}.` : ''}`; const body = text(ctx, input.text, 'Review', 600);
      const existing = x.reviews.find(v => v.residentId === r.id); if (existing) Object.assign(existing, { rating, text: body, displayName, status: 'pending', createdAt: time }); else x.reviews.push({ id: id(), residentId: r.id, displayName, rating, text: body, status: 'pending', createdAt: time });
      ctx.notifyAdmins('New resident feedback', `${r.name} rated their stay ${rating} out of 5.`, `review:${r.id}:${time}`); return true;
    }
    // ---- Email from the admin team to residents (and optionally their guardians)
    case 'email.send': {
      adminOnly(ctx, user); const subject = text(ctx, input.subject, 'Subject', 150); const body = text(ctx, input.body, 'Message', 5000);
      const audience = String(input.audience) as 'active' | 'selected' | 'applicants' | 'all'; if (!['active', 'selected', 'applicants', 'all'].includes(audience)) ctx.fail('Choose who should get the email.');
      const ids = Array.isArray(input.residentIds) ? input.residentIds.map(String) : [];
      const chosen = state.residents.filter(r => audience === 'all' ? r.status !== 'checked_out' : audience === 'active' ? r.status === 'active' || r.status === 'booked' : audience === 'applicants' ? r.status === 'applicant' : ids.includes(r.id));
      if (!chosen.length) ctx.fail('No residents match. Choose at least one resident.');
      const recipients: Extras['sentEmails'][number]['recipients'] = []; const seen = new Set<string>();
      const add = (userId: string, name: string, email: string, role: 'resident' | 'guardian') => { const key = (email || '').trim().toLowerCase(); if (!key || seen.has(key)) return; seen.add(key); recipients.push({ userId, name, email: email.trim(), role }); };
      for (const r of chosen) { add(r.userId, r.name, state.actors[r.userId]?.email || r.email, 'resident'); if (input.includeGuardians === true && r.guardianUserId) { const g = state.actors[r.guardianUserId]; add(r.guardianUserId, g?.name || r.guardianName, g?.email || r.guardianEmail, 'guardian'); } }
      if (!recipients.length) ctx.fail('None of the chosen residents has an email address.');
      if (recipients.length > 300) ctx.fail('That is more than 300 emails at once. Send to a smaller group (Gmail allows about 400 a day).');
      const sent = { id: id(), subject, body, audience, includeGuardians: input.includeGuardians === true, recipients, sentBy: user.name, createdAt: time }; x.sentEmails.push(sent);
      for (const to of recipients) queueEmail(state as any, { userId: to.userId, to: to.email, kind: 'admin.email', batchId: sent.id, subject, text: `Hello ${to.name.split(' ')[0]},\n\n${body}\n\n— ${user.name}, Ryuu\nThis email was sent from the Ryuu portal. To reply, write to hello@example.com or call 00000 00000.` }, now);
      ctx.audit(action, sent.id, `"${subject}" to ${recipients.length} recipient(s)`); return true;
    }
    default: return false;
  }
}

/** True when a late return is planned for that resident and night (used to delay the 10 PM alert). */
export function hasLateArrival(state: { extras?: Extras }, residentId: string, onDay: string): boolean {
  return Boolean(state.extras?.lateArrivals.some(l => l.residentId === residentId && l.date === onDay && l.status === 'approved'));
}

export function processExtraJobs(state: ExtrasState, now: Date, ctx: Ctx): void {
  const x = ensureExtras(state as any); const today = businessDate(now);
  // Late return missed: still not checked in at the agreed time.
  for (const l of x.lateArrivals.filter(l => l.status === 'approved' && !l.missedNotified)) {
    if (now < localTime(l.date, hhmmHours(l.returnBy))) continue;
    const present = state.attendance.some(a => a.residentId === l.residentId && a.date === l.date && a.status === 'present');
    const r = state.residents.find(r => r.id === l.residentId); l.missedNotified = true;
    if (!present && r) ctx.notifyAdmins('Late return not recorded', `${r.name} planned to be back by ${timeLabel(l.returnBy)} on ${l.date} but has no attendance record.`, `late-missed:${l.id}`);
  }
  // Maintenance due
  for (const t of x.maintenance.filter(t => t.nextDue <= today)) ctx.notifyAdmins(t.nextDue < today ? 'Maintenance overdue' : 'Maintenance due today', `${t.title} was due on ${t.nextDue}.`, `maintenance:${t.id}:${t.nextDue}`);
  // Waitlist: tell people when a matching bed is free
  for (const w of x.waitlist.filter(w => w.status === 'waiting')) {
    const room = state.rooms.find(room => (!w.sharing || room.sharing === w.sharing) && room.beds.some(b => b.status === 'available'));
    const r = state.residents.find(r => r.id === w.residentId); if (!room || !r) continue;
    w.status = 'notified'; w.notifiedAt = now.toISOString();
    ctx.notify(r.userId, 'A bed is available', `A ${room.sharing}-sharing bed in room ${room.label} is free. Open Rooms & beds to apply.`, `waitlist-open:${w.id}`);
    ctx.notifyAdmins('Waitlist match', `${r.name} was told about a free bed in room ${room.label}.`, `waitlist-match:${w.id}`);
  }
  // Document expiry: 30 days, 7 days and on the day
  for (const e of x.documentExpiries) {
    const r = state.residents.find(r => r.id === e.residentId); if (!r || r.status === 'checked_out') continue;
    const daysLeft = Math.round((new Date(`${e.expiresOn}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / DAY);
    const stage = daysLeft <= 0 ? 'expired' : daysLeft <= 7 ? '7' : daysLeft <= 30 ? '30' : ''; if (!stage) continue;
    const msg = stage === 'expired' ? `${e.kind} for ${r.name} expired on ${e.expiresOn}.` : `${e.kind} for ${r.name} expires on ${e.expiresOn}.`;
    ctx.notifyAdmins('Document expiring', msg, `expiry:${e.id}:${e.expiresOn}:${stage}`); ctx.notify(r.userId, stage === 'expired' ? 'Document expired' : 'Document expiring soon', `${msg} Please share an updated copy with the hostel team.`, `expiry-resident:${e.id}:${e.expiresOn}:${stage}`);
  }
  // Weekly guardian summary email: Sundays from 7 PM IST
  if (weekday(today) === 0 && businessHour(now) >= 19) {
    for (const guardian of Object.values(state.actors).filter(a => a.role === 'guardian')) {
      if (x.guardianSummaries[guardian.id] === today || !guardian.email) continue;
      const linked = state.residents.filter(r => r.guardianUserId === guardian.id && r.status === 'active'); if (!linked.length) continue;
      const from = addDays(today, -6);
      const sections = linked.map(r => {
        const att = state.attendance.filter(a => a.residentId === r.id && a.date >= from && a.date <= today);
        const outs = state.outpasses.filter(o => o.residentId === r.id && o.status !== 'cancelled' && businessDate(new Date(o.departureAt)) >= from && businessDate(new Date(o.departureAt)) <= today);
        const lates = x.lateArrivals.filter(l => l.residentId === r.id && l.status === 'approved' && l.date >= from && l.date <= today);
        return [`${r.name} (${r.residentNumber})`, `  Attendance: ${att.filter(a => a.status === 'present').length} nights checked in, ${att.filter(a => a.status === 'away').length} away on an outpass, ${att.filter(a => a.status === 'not_recorded').length} not recorded.`, `  Outpasses: ${outs.length ? outs.map(o => `${o.destination} (${businessDate(new Date(o.departureAt))})`).join(', ') : 'none'}.`, `  Late returns: ${lates.length ? lates.map(l => `${l.date} by ${timeLabel(l.returnBy)}`).join(', ') : 'none'}.`].join('\n');
      });
      queueEmail(state as any, { userId: guardian.id, to: guardian.email, kind: 'guardian.weekly', subject: `Ryuu weekly update · ${from} to ${today}`, text: `Hello ${guardian.name},\n\nHere is the past week at Ryuu.\n\n${sections.join('\n\n')}\n\nSign in to the guardian portal for details: Outpasses and Attendance.\n\nRyuu` }, now);
      x.guardianSummaries[guardian.id] = today;
    }
  }
}

/** What each role may see. Other residents' laundry bookings are shown without names. */
export function extrasFor(state: { extras?: Extras }, user: DomainUser, visibleResidentIds: Set<string>): Extras {
  const x = ensureExtras(state as any); const isAdmin = user.role === 'admin'; const isResident = user.role === 'resident';
  const mine = <T extends { residentId: string }>(rows: T[]) => isAdmin ? rows : rows.filter(r => visibleResidentIds.has(r.residentId));
  return structuredClone({
    weeklyMenu: x.weeklyMenu, laundryMachines: x.laundryMachines,
    mealFeedback: isAdmin ? x.mealFeedback : isResident ? mine(x.mealFeedback) : [],
    laundry: isAdmin ? x.laundry : isResident ? x.laundry.filter(b => b.status === 'booked').map(b => visibleResidentIds.has(b.residentId) ? b : { ...b, residentId: '' }) : [],
    visitors: mine(x.visitors), lateArrivals: mine(x.lateArrivals),
    expenses: isAdmin ? x.expenses : [], maintenance: isAdmin ? x.maintenance : [],
    waitlist: isAdmin ? x.waitlist : isResident ? mine(x.waitlist) : [], documentExpiries: isAdmin ? x.documentExpiries : isResident ? mine(x.documentExpiries) : [],
    visitRequests: isAdmin ? x.visitRequests : [], reviews: isAdmin ? x.reviews : isResident ? mine(x.reviews) : [],
    outbox: isAdmin ? x.outbox.filter(e => e.kind === 'admin.email').map(e => ({ ...e, text: '' })) : [], sentEmails: isAdmin ? x.sentEmails.slice(-100) : [], guardianSummaries: {}, gatewayOrders: isAdmin ? x.gatewayOrders : isResident ? mine(x.gatewayOrders) : [],
  });
}

/** Public homepage data: free beds per room type. Resident feedback is private to admins. */
export function publicExtras(state: { extras?: Extras; rooms: Room[] }) {
  const x = ensureExtras(state as any); const freeBySharing: Record<string, number> = {};
  for (const room of state.rooms) freeBySharing[room.sharing] = (freeBySharing[room.sharing] || 0) + room.beds.filter(b => b.status === 'available').length;
  return { freeBySharing };
}

export function addVisitRequest(state: { extras?: Extras }, input: Record<string, any>, now: Date, ctx: Ctx): void {
  const x = ensureExtras(state as any); const today = businessDate(now);
  const preferredDate = day(ctx, input.preferredDate, 'Preferred date'); if (preferredDate < today || preferredDate > addDays(today, 60)) ctx.fail('Pick a date in the next two months.');
  const phone = text(ctx, input.phone, 'Phone number', 20); if (!/^[+\d][\d\s-]{7,18}$/.test(phone)) ctx.fail('Enter a valid phone number.');
  const email = text(ctx, input.email, 'Email', 200, true); if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) ctx.fail('Enter a valid email or leave it blank.');
  const v = { id: id(), name: text(ctx, input.name, 'Name', 120), phone, email, preferredDate, preferredTime: text(ctx, input.preferredTime, 'Preferred time', 40), message: text(ctx, input.message, 'Message', 600, true), status: 'new' as const, createdAt: now.toISOString() };
  if (x.visitRequests.filter(r => r.status === 'new').length >= 200) ctx.fail('We have a lot of requests right now. Please call us instead.', 429);
  x.visitRequests.push(v); ctx.notifyAdmins('New visit request', `${v.name} (${v.phone}) would like to visit on ${v.preferredDate}, ${v.preferredTime}.`, `visit-request:${v.id}`);
}
