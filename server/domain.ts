import { randomUUID } from 'node:crypto';
import { db, type SqlClient } from './db';
import { strictProduction } from './config';
import { assertUpload } from './uploads';
import {enqueuePush} from './push';
import { DEFAULT_NON_VEG_DAYS, isNonVegDay, nonVegDays } from '../shared/domain';
import { emptyExtras } from '../shared/extras';
import { ADMISSION_DOCUMENTS, parseAdmission } from './admission';
import { newMerchantOrderId, phonePeMode, type PhonePeStatus } from './phonepe';
import { addVisitRequest, applyExtraAction, ensureExtras, extrasFor, hasLateArrival, processExtraJobs, type Ctx } from './extras';
import type { DomainUser, DomainAction, Snapshot, Settings, Resident, Room, Bill, BillLine, MealChoice, MealChoiceCounts, FoodPolicy, Outpass, Payment, DeviceEvent } from '../shared/domain';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const IST = 330 * 60_000;
const id = () => randomUUID();
export class DomainError extends Error {
  status: number; statusCode: number;
  constructor(message: string, status = 400) { super(message); this.name = 'DomainError'; this.status = status; this.statusCode = status; }
}
function requireThat(condition: unknown, message: string, status = 400): asserts condition { if (!condition) throw new DomainError(message, status); }
function str(value: unknown, field: string, max = 2000): string {
  requireThat(typeof value === 'string' && value.trim().length > 0, `${field} is required.`);
  const result = value.trim(); requireThat(result.length <= max, `${field} is too long.`); return result;
}
function money(value: unknown, field: string, allowNegative = false): number {
  requireThat(typeof value === 'number' && Number.isSafeInteger(value) && Math.abs(value) <= 100_000_000_000 && (allowNegative || value >= 0), `${field} must be a valid amount in paise.`); return value;
}
function timestamp(value: unknown, field: string): string {
  requireThat(typeof value === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(value), `${field} must include a timezone.`);
  const time = new Date(value); requireThat(Number.isFinite(time.getTime()), `${field} is invalid.`); return time.toISOString();
}
function date(value: unknown, field: string): string {
  requireThat(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value), `${field} is invalid.`);
  const parsed = new Date(`${value}T00:00:00Z`); requireThat(Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value, `${field} is invalid.`); return value;
}
export function businessDate(now: Date): string { return new Date(now.getTime() + IST).toISOString().slice(0, 10); }
/** A timestamp as residents read it, e.g. "16 Nov 2026, 8:00 am" (IST), for notification text. */
const IST_DATE_TIME = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
function istDateTime(iso: string): string { return IST_DATE_TIME.format(new Date(iso)); }
function businessHour(now: Date): number { const d = new Date(now.getTime() + IST); return d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600; }
export function localTime(day: string, hour = 0): Date { return new Date(new Date(`${day}T00:00:00Z`).getTime() - IST + hour * HOUR); }
function addDays(day: string, count: number): string { return new Date(new Date(`${day}T00:00:00Z`).getTime() + count * DAY).toISOString().slice(0, 10); }
function addMonths(period: string, count: number): string { const d = new Date(`${period}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + count); return d.toISOString().slice(0, 7); }
export function ageOn(dob: string, day: string): number { const year = Number(day.slice(0, 4)) - Number(dob.slice(0, 4)); return year - (day.slice(5) < dob.slice(5) ? 1 : 0); }
export function prorateRent(monthlyPaise: number, moveIn: string): number { date(moveIn, 'Move-in date'); money(monthlyPaise, 'Monthly rent'); const [year, month, d] = moveIn.split('-').map(Number); const days = new Date(Date.UTC(year, month, 0)).getUTCDate(); return Math.round(monthlyPaise * (days - d + 1) / days); }

export interface DomainState extends Omit<Snapshot, 'user' | 'meta'> {
  schemaVersion: number; revision: number; startedAt: string; workerLastRun?: string; actors: Record<string, DomainUser>;
  counters: Record<string, number>; eventKeys: Record<string, string>; demo: boolean;
  deviceReconciliations: Array<{ id: string; event: unknown; reason: string; receivedAt: string }>;
}
// Contact details from the owner's opening pamphlet (November 2026).
export const RYUU_CONTACT = { address: 'No. 00, 80 Feet Road, 5th Block, Koramangala, Bengaluru, Karnataka – 560034', phone: '00000 00000', email: 'hello@example.com' };
export function createInitialState(now = new Date()): DomainState {
  const settings: Settings = {
    hostelName: 'Ryuu', address: RYUU_CONTACT.address, phone: RYUU_CONTACT.phone, email: RYUU_CONTACT.email, openingDate: '',
    monthlyRentPaise: null, depositPaise: null, dailyPenaltyPaise: null,
    food: { mode: 'not_configured', monthlyPaise: 0, breakfastPaise: 0, lunchPaise: 0, dinnerPaise: 0, nonVegDays: [...DEFAULT_NON_VEG_DAYS] },
    paymentUpi: '', bankName: '', accountName: '', accountNumber: '', ifsc: '', qrDocumentId: '', checkoutNoticeDays: null, identityPolicy: 'pending_review',
    monthlyReminderDays: [1, 4, 5, 7, 15, 25], ticketCategories: ['Room / facilities', 'Food', 'Payment', 'Account / access', 'Other'], syntheticInventory: !strictProduction(),
  };
  const rooms: Room[] = ['101', '102', '103', '201', '202', '203'].map((label, index) => ({ id: `room-${label}`, label, floor: label[0] === '1' ? 'First floor' : 'Second floor', sharing: [3, 4, 5][index % 3], rentPaise: null, ac: true, bathroom: true, synthetic: true, beds: Array.from({ length: [3, 4, 5][index % 3] }, (_, i) => ({ id: `bed-${label}-${i + 1}`, label: `${label}-${String.fromCharCode(65 + i)}`, status: 'available' })) }));
  return { settings, rooms: strictProduction()?[]:rooms, schemaVersion: 1, revision: 0, startedAt: now.toISOString(), actors: {}, counters: {}, eventKeys: {}, demo: false, residents: [], applications: [], bills: [], payments: [], meals: [], mealLocks: [], mealRequests: [], outpasses: [], attendance: [], deviceEvents: [], transfers: [], messages: [], tickets: [], notices: [], notifications: [], audit: [], checkoutRecords: [], deviceReconciliations: [], extras: emptyExtras() };
}
// Preserve legacy delivery history, but never retry routine alerts on WhatsApp.
function cancelLegacyNotificationDelivery(state: DomainState): boolean {
  let changed = false;
  for (const notification of state.notifications) {
    if (notification.channel === 'whatsapp' && ['queued', 'failed', 'not_configured'].includes(notification.delivery)) {
      notification.delivery = 'cancelled';
      delete notification.nextAttemptAt;
      changed = true;
    }
  }
  return changed;
}
let initialized: Promise<void> | undefined;
export async function initializeDomain(): Promise<void> {
  initialized ??= (async () => {
    await db.query('CREATE TABLE IF NOT EXISTS domain_state (id integer PRIMARY KEY CHECK (id = 1), schema_version integer NOT NULL DEFAULT 1, revision bigint NOT NULL DEFAULT 0, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())');
    await db.query('INSERT INTO domain_state (id, data) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING', [JSON.stringify(createInitialState())]);
    await db.transaction(async tx => {
      const { rows } = await tx.query('SELECT data FROM domain_state WHERE id=1 FOR UPDATE');
      const state: DomainState = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
      if(strictProduction()&&(state.demo||state.rooms.some(r=>r.synthetic)||state.residents.some(r=>r.synthetic)))throw new Error('Production refuses demo records and illustrative rooms. Use a clean production database.');
      const contactUpdated = false;
      if (cancelLegacyNotificationDelivery(state) || contactUpdated) {
        state.revision++;
        await tx.query('UPDATE domain_state SET data=$1::jsonb,revision=revision+1,updated_at=NOW() WHERE id=1', [JSON.stringify(state)]);
      }
    });
  })().catch(error => { initialized = undefined; throw error; });
  return initialized;
}
async function mutate<T>(fn: (state: DomainState, tx: SqlClient) => T | Promise<T>): Promise<T> {
  await initializeDomain();
  return db.transaction(async tx => {
    const result = await tx.query('SELECT data FROM domain_state WHERE id = 1 FOR UPDATE');
    const state: DomainState = typeof result.rows[0].data === 'string' ? JSON.parse(result.rows[0].data) : result.rows[0].data as DomainState;
    cancelLegacyNotificationDelivery(state); ensureExtras(state);
    const existingNotificationIds = new Set(state.notifications.map(n => n.id));
    const answer = await fn(state, tx); state.revision += 1;
    await enqueuePush(tx,state.notifications.filter(n => !existingNotificationIds.has(n.id)));
    await tx.query('UPDATE domain_state SET data = $1::jsonb, revision = revision + 1, updated_at = now() WHERE id = 1', [JSON.stringify(state)]);
    return answer;
  });
}
function admin(user: DomainUser): void { requireThat(user.role === 'admin', 'Administrator access is required.', 403); }
function resident(state: DomainState, user: DomainUser): Resident { requireThat(user.role === 'resident', 'This action is available to residents.', 403); return findResident(state, user.id); }
function findResident(state: DomainState, residentId: unknown): Resident { const r = state.residents.find(r => r.id === residentId); requireThat(r, 'Resident not found.', 404); return r; }
function activeResident(state: DomainState, user: DomainUser): Resident { const r = resident(state, user); requireThat(r.status === 'active', 'This feature is available after move-in.'); return r; }
function findBed(state: DomainState, bedId: unknown) { for (const room of state.rooms) { const bed = room.beds.find(b => b.id === bedId); if (bed) return { room, bed }; } throw new DomainError('Bed not found.', 404); }
function audit(state: DomainState, user: DomainUser, action: string, subjectId: string, details: string, now: Date): void { state.audit.push({ id: id(), actorId: user.id, actorName: user.name, action, subjectId, details, createdAt: now.toISOString() }); }
const system: DomainUser = { id: 'system', role: 'admin', name: 'Scheduled service', email: '', phone: '' };
function notify(state: DomainState, userId: string | undefined, title: string, body: string, key: string, now: Date, link = '/portal'): void {
  if (!userId || state.notifications.some(n => n.userId === userId && n.eventKey === key)) return;
  state.notifications.push({ id: id(), userId, title, body, link, eventKey: key, createdAt: now.toISOString(), delivery: 'visible', channel: 'website', attempts: 0 });
}
function notifyAdmins(state: DomainState, title: string, body: string, key: string, now: Date): void { for (const actor of Object.values(state.actors).filter(u => u.role === 'admin')) notify(state, actor.id, title, body, key, now); }
/** Helpers handed to server/extras.ts. */
function extrasCtx(state: DomainState, actor: DomainUser, now: Date): Ctx {
  return { fail: (message, status) => { throw new DomainError(message, status); }, notify: (userId, title, body, key) => notify(state, userId, title, body, key, now), notifyAdmins: (title, body, key) => notifyAdmins(state, title, body, key, now), audit: (action, subjectId, details) => audit(state, actor, action, subjectId, details, now) };
}
function line(kind: BillLine['kind'], description: string, amountPaise: number, now: Date, day?: string): BillLine { return { id: id(), kind, description, amountPaise, createdAt: now.toISOString(), ...(day ? { date: day } : {}) }; }
function total(bill: Bill): number { bill.totalPaise = bill.lines.reduce((sum, item) => sum + item.amountPaise, 0); return bill.totalPaise; }
function outstanding(bill: Bill): number { return Math.max(0, total(bill) - bill.paidPaise); }
function newBill(state: DomainState, r: Resident, kind: Bill['kind'], period: string, dueAt: string, lines: BillLine[], now: Date): Bill {
  const bill: Bill = { id: id(), residentId: r.id, period, kind, status: 'unpaid', lines, totalPaise: 0, paidPaise: 0, dailyPenaltyPaise: state.settings.dailyPenaltyPaise ?? 0, dueAt, createdAt: now.toISOString(), foodPolicy: { ...state.settings.food } };
  total(bill); state.bills.push(bill); return bill;
}
function confirmBooking(state: DomainState, bill: Bill): void {
  const a = state.applications.find(a => a.billId === bill.id); if (!a) return;
  requireThat(a.status === 'approved', 'The admission is no longer approved.'); const r = findResident(state, a.residentId); const { bed } = findBed(state, a.bedId);
  requireThat(bed.status === 'reserved' && bed.residentId === r.id, 'The bed reservation is missing.'); a.status = 'confirmed'; r.status = 'booked'; r.bedId = bed.id;
}
function contactsVerified(state: DomainState, r: Resident): boolean { const actor = state.actors[r.userId]; return Boolean(actor?.emailVerified && actor?.phoneVerified); }
function requireAdmissionReady(state: DomainState, r: Resident): void {
  requireThat(contactsVerified(state, r), 'The resident must verify both email and phone before admission.');
  requireThat(r.synthetic || state.settings.identityPolicy !== 'pending_review', 'Set the identity-document policy before approving admission.');
  requireThat(r.documentStatus === 'verified', 'Review and verify the resident and guardian identity documents first.');
}
export function registerResident(state: DomainState, user: DomainUser, details: Record<string, unknown> = {}, now = new Date()): Resident {
  requireThat(user.role === 'resident', 'Only resident users have resident profiles.'); state.actors[user.id] = { ...user };
  let r = state.residents.find(r => r.userId === user.id); if (r) return r;
  const year = businessDate(now).slice(0, 4); state.counters[year] = (state.counters[year] ?? 0) + 1;
  const dob = typeof details.dob === 'string' && details.dob ? date(details.dob, 'Date of birth') : '';
  if (dob) requireThat(ageOn(dob, businessDate(now)) >= 18, 'Residents must be at least 18 years old.');
  const residentNumber = user.residentId || `JN-${year}-${String(state.counters[year]).padStart(4, '0')}`;
  requireThat(!state.residents.some(other => other.residentNumber === residentNumber), 'This resident number is already assigned.');
  r = { id: user.id, userId: user.id, residentNumber, name: user.name, email: user.email, phone: user.phone, dob, address: '', profession: '', organization: '', intendedMoveIn: '', guardianName: '', guardianPhone: '', guardianEmail: '', guardianDob: '', guardianProfession: '', guardianRelationship: '', documentStatus: 'pending', status: 'applicant', createdAt: now.toISOString(), updatedAt: now.toISOString() };
  for (const key of ['address', 'profession', 'organization', 'intendedMoveIn', 'guardianName', 'guardianPhone', 'guardianEmail', 'guardianDob', 'guardianProfession', 'guardianRelationship', 'emergencyContact', 'identityDocumentId', 'guardianDocumentId'] as const) if (typeof details[key] === 'string') (r as any)[key] = (details[key] as string).slice(0, 2000);
  if (details.admission !== undefined) r.admission = parseAdmission(details.admission, message => { throw new DomainError(message); }, now);
  state.residents.push(r); audit(state, user, 'resident.created', r.id, `Issued ${r.residentNumber}`, now); return r;
}
export async function ensureResident(user: DomainUser, details: Record<string, unknown> = {}): Promise<Resident> { return mutate(state => registerResident(state, user, details)); }
/** Links (or replaces) a resident's guardian inside the domain state and copies the guardian's contact details onto the resident record. */
export function attachGuardian(state: DomainState, actor: DomainUser, residentId: string, guardian: { id: string; name: string; email: string; phone: string; dob?: string; profession?: string }, relationship: string, now = new Date()): Resident {
  const r = findResident(state, residentId); const previous = r.guardianUserId;
  Object.assign(r, { guardianUserId: guardian.id, guardianName: guardian.name, guardianEmail: guardian.email, guardianPhone: guardian.phone, guardianDob: guardian.dob || '', guardianProfession: guardian.profession || '', guardianRelationship: relationship || 'Guardian', updatedAt: now.toISOString() });
  audit(state, actor, 'guardian.linked', r.id, previous && previous !== guardian.id ? `Guardian changed from ${previous} to ${guardian.id}` : `Guardian account ${guardian.id}`, now);
  return r;
}
export async function linkGuardian(residentUserId: string, guardianUserId: string): Promise<void> {
  await mutate(state => { const r = findResident(state, residentUserId); r.guardianUserId = guardianUserId; audit(state, system, 'guardian.linked', r.id, `Guardian account ${guardianUserId}`, new Date()); });
}

function selectedCounts(state: DomainState, day: string): MealChoiceCounts {
  // After cutoff an existing selection survives an outpass change until an admin
  // explicitly adjusts it. Before cutoff refreshMealEligibility marks exclusions.
  const eligible = state.residents.filter(r => activeOn(state, r, day) && (!fullDayAway(state, r.id, day) || state.meals.some(m => m.residentId === r.id && m.date === day && m.source !== 'outpass')));
  const meals = state.meals.filter(m => m.date === day && eligible.some(r => r.id === m.residentId) && m.source !== 'outpass');
  return { breakfast: meals.filter(m => m.breakfast).length, lunch: meals.filter(m => m.lunch).length, dinner: meals.filter(m => m.dinner).length, submitted: meals.length, missing: eligible.length - meals.length };
}
function activeOn(state: DomainState, r: Resident, day: string): boolean {
  return Boolean(r.moveInDate && r.moveInDate <= day && !state.checkoutRecords.some(c => c.residentId === r.id && c.date <= day));
}
function fullDayAway(state: DomainState, residentId: string, day: string): boolean {
  const start = localTime(day).getTime(), end = start + DAY;
  return state.outpasses.some(o => o.residentId === residentId && o.status !== 'cancelled' && new Date(o.actualDepartureAt ?? o.departureAt).getTime() < start && ((o.status === 'away' && !o.actualReturnAt && new Date(o.expectedReturnAt).getTime() <= start) || new Date(o.actualReturnAt ?? o.expectedReturnAt).getTime() >= end));
}
function actuallyAwayAt(state: DomainState, residentId: string, at: Date): boolean { return state.outpasses.some(o => o.residentId === residentId && o.actualDepartureAt && new Date(o.actualDepartureAt) <= at && (!o.actualReturnAt || new Date(o.actualReturnAt) > at)); }
function mealChoice(input: Record<string, unknown>): MealChoice { for (const field of ['breakfast', 'lunch', 'dinner']) requireThat(typeof input[field] === 'boolean', 'Choose Yes or No for each meal.'); return { breakfast: input.breakfast as boolean, lunch: input.lunch as boolean, dinner: input.dinner as boolean, nonVeg: input.nonVeg === true }; }
// Non-veg is only possible on the hostel's non-veg days; on other days the choice is always veg.
function dayChoice(state: DomainState, day: string, input: Record<string, unknown>): MealChoice { const c = mealChoice(input); if (!isNonVegDay(state.settings.food, day)) c.nonVeg = false; return c; }
function saveMeal(state: DomainState, r: Resident, day: string, choice: MealChoice, now: Date, source: 'resident' | 'admin'): void {
  let m = state.meals.find(m => m.residentId === r.id && m.date === day);
  if (m) Object.assign(m, choice, { updatedAt: now.toISOString(), source });
  else { m = { id: id(), residentId: r.id, date: day, ...choice, submittedAt: now.toISOString(), updatedAt: now.toISOString(), source, foodPolicy: { ...state.settings.food } }; state.meals.push(m); }
}
function refreshMealEligibility(state: DomainState, now: Date): void {
  for (const m of state.meals) if (now < localTime(addDays(m.date, -1), 23) && fullDayAway(state, m.residentId, m.date)) { m.breakfast = m.lunch = m.dinner = false; m.source = 'outpass'; m.updatedAt = now.toISOString(); }
}
function paymentWindow(state: DomainState, bill: Bill, now: Date): void {
  if (bill.kind !== 'admission') return;
  const application = state.applications.find(a => a.billId === bill.id);
  requireThat(application?.status === 'approved' && application.paymentDeadline && new Date(application.paymentDeadline) > now, 'The admission payment window has expired. Please contact the admin.');
}
function eventRecord(state: DomainState, actor: DomainUser, input: Record<string, unknown>, now: Date, source: 'manual' | 'device' | 'simulator', eventId?: string): void {
  const r = findResident(state, input.residentId); requireThat(r.status === 'active', 'The resident is not currently checked in.');
  const type = input.type; requireThat(type === 'attendance' || type === 'departure' || type === 'return', 'Select an attendance event type.');
  const eventAt = timestamp(input.eventAt, 'Event time'); const at = new Date(eventAt);
  requireThat(at.getTime() <= now.getTime() + 5 * 60_000, 'An attendance event cannot be in the future.');
  requireThat(!r.moveInDate || businessDate(at) >= r.moveInDate, 'An attendance event cannot predate move-in.');
  const reason = source === 'manual' ? str(input.reason, 'Manual record reason') : String(input.reason ?? 'Device event').slice(0, 2000);
  if (eventId && state.deviceEvents.some(e => e.id === eventId)) return;
  let outpass: Outpass | undefined;
  if (type !== 'attendance') {
    outpass = input.outpassId ? state.outpasses.find(o => o.id === input.outpassId && o.residentId === r.id) : state.outpasses.find(o => o.residentId === r.id && (type === 'departure' ? o.status === 'approved' : o.status === 'away'));
    requireThat(outpass, 'No matching outpass. The event needs admin reconciliation.');
    if (type === 'departure') {
      requireThat(outpass.status === 'approved', 'This outpass departure is already recorded or cancelled.');
      requireThat(!actuallyAwayAt(state, r.id, at), 'A departure is already active for this resident.');
      requireThat(at < new Date(outpass.expectedReturnAt), 'Departure must be before the expected return.');
      outpass.status = 'away'; outpass.actualDepartureAt = eventAt;
      notify(state, r.guardianUserId, 'Departure recorded', `${r.name} has left Ryuu. Expected return: ${istDateTime(outpass.expectedReturnAt)}.`, `departure:${outpass.id}`, now);
    } else {
      requireThat(outpass.status === 'away' && outpass.actualDepartureAt, 'Record the departure before the return.');
      requireThat(at >= new Date(outpass.actualDepartureAt), 'Return cannot be before departure.');
      outpass.status = 'returned'; outpass.actualReturnAt = eventAt;
      notify(state, r.guardianUserId, 'Return recorded', `${r.name} has returned to Ryuu.`, `return:${outpass.id}`, now);
    }
  }
  const day = businessDate(at); const hour = businessHour(at);
  if (type === 'attendance') {
    requireThat(source === 'manual' || (hour >= 18 && hour <= 22), 'Attendance scans are accepted from 6 PM to 10 PM IST.');
    requireThat(!actuallyAwayAt(state, r.id, at), 'The resident is away on an outpass. Record their return first.');
  }
  const evt: DeviceEvent = { id: eventId ?? id(), residentId: r.id, type, eventAt, receivedAt: now.toISOString(), source, reason, actorId: actor.id, ...(outpass ? { outpassId: outpass.id } : {}) }; state.deviceEvents.push(evt);
  if (type === 'attendance' || (type === 'return' && hour >= 18 && hour <= 22)) {
    let record = state.attendance.find(a => a.residentId === r.id && a.date === day);
    if (!record) { record = { id: id(), residentId: r.id, date: day, status: 'present', source: type === 'return' ? 'return' : source === 'manual' ? 'manual' : 'device' }; state.attendance.push(record); }
    if (record.status !== 'present' || !record.recordedAt || eventAt < record.recordedAt) Object.assign(record, { status: 'present', recordedAt: eventAt, reason, eventId: evt.id, source: type === 'return' ? 'return' : source === 'manual' ? 'manual' : 'device' });
  }
  // Delayed departure/return events reconcile already-closed attendance dates.
  // A return before the scan window restores the scan obligation; it does not
  // fabricate a successful daily scan. Earlier alerts remain in the audit trail.
  if (type === 'departure' || type === 'return') for (let checkDay = day; checkDay <= businessDate(now); checkDay = addDays(checkDay, 1)) {
    if (localTime(checkDay, 22) > now) continue;
    let record = state.attendance.find(a => a.residentId === r.id && a.date === checkDay);
    if (record?.status === 'present') continue;
    const away = actuallyAwayAt(state, r.id, localTime(checkDay, 22));
    if (!record) { record = { id: id(), residentId: r.id, date: checkDay, status: away ? 'away' : 'not_recorded', source: 'scheduler' }; state.attendance.push(record); }
    else record.status = away ? 'away' : 'not_recorded';
    if (!away) notifyAdmins(state, 'Attendance not recorded', `${r.name} (${r.residentNumber}) has no attendance record for ${checkDay}. Review the reconciled return event and contact the resident.`, `attendance-missing:${r.id}:${checkDay}`, now);
  }
  refreshMealEligibility(state, now); audit(state, actor, `attendance.${type}`, r.id, `${source}: ${eventAt}; ${reason}`, now);
}

/** Pure transactional state machine. Public mutations call this only inside a PostgreSQL lock. */
export function applyAction(state: DomainState, user: DomainUser, action: string, raw: unknown, now = new Date()): void {
  requireThat(raw !== null && typeof raw === 'object' && !Array.isArray(raw), 'Action input must be an object.');
  const input = raw as Record<string, unknown>; state.actors[user.id] = { ...user };
  const time = now.toISOString(); const today = businessDate(now);
  switch (action as DomainAction) {
    case 'profile.update': {
      const r = resident(state, user);
      for (const key of ['name', 'dob', 'address', 'profession', 'organization', 'intendedMoveIn', 'guardianName', 'guardianPhone', 'guardianEmail', 'guardianDob', 'guardianProfession', 'guardianRelationship', 'emergencyContact', 'identityDocumentId', 'guardianDocumentId'] as const) {
        if (input[key] === undefined) continue; requireThat(typeof input[key] === 'string' && String(input[key]).length <= 2000, `Invalid ${key}.`);
        if (key === 'dob') { date(input[key], 'Date of birth'); requireThat(ageOn(input[key] as string, today) >= 18, 'Residents must be at least 18 years old.'); }
        if ((key === 'guardianDob' || key === 'intendedMoveIn') && input[key]) date(input[key], key);
        if ((key === 'identityDocumentId' || key === 'guardianDocumentId') && input[key] !== r[key]) r.documentStatus = 'pending';
        (r as any)[key] = (input[key] as string).trim();
      }
      for (const key of Object.keys(ADMISSION_DOCUMENTS) as (keyof typeof ADMISSION_DOCUMENTS)[]) { if (typeof input[key] !== 'string' || !input[key]) continue; requireThat(r.admission, 'Complete the admission form first.'); r.admission[key] = String(input[key]); }
      r.updatedAt = time; audit(state, user, action, r.id, 'Profile updated', now); break;
    }
    case 'admission.submit': {
      const r = resident(state, user); requireThat(r.status !== 'checked_out', 'This account has checked out.');
      const docs = r.admission ? { photoDocumentId: r.admission.photoDocumentId, employmentProofId: r.admission.employmentProofId, addressProofId: r.admission.addressProofId, medicalCertificateId: r.admission.medicalCertificateId } : {};
      const keepId = r.admission && typeof input.idNumber === 'string' && input.idNumber === r.admission.idNumber && input.idType === r.admission.idType;
      const parsed = parseAdmission(keepId ? { ...input, idNumber: r.admission!.idType === 'aadhaar' ? '000000000000' : input.idNumber } : input, message => { throw new DomainError(message); }, now);
      if (keepId) parsed.idNumber = r.admission!.idNumber; // unchanged masked Aadhaar stays as it was
      if (typeof input.organization === 'string' && input.organization.trim()) r.organization = input.organization.trim().slice(0, 200);
      r.admission = { ...parsed, ...Object.fromEntries(Object.entries(docs).filter(([, v]) => v)) }; r.updatedAt = time;
      audit(state, user, action, r.id, 'Admission form saved', now); break;
    }
    case 'application.submit': {
      const r = resident(state, user); requireThat(r.status === 'applicant', 'An active or confirmed resident cannot submit another admission.');
      requireThat(contactsVerified(state, r), 'Verify your email and phone before applying.');
      requireThat(r.dob && ageOn(r.dob, today) >= 18 && r.address && r.profession && r.guardianName && r.guardianPhone, 'Complete the resident and guardian details before applying.');
      requireThat(!state.applications.some(a => a.residentId === r.id && ['submitted', 'approved', 'confirmed'].includes(a.status)), 'You already have an active application.');
      const { bed } = findBed(state, input.bedId); requireThat(bed.status === 'available', 'That bed is no longer available.');
      const moveIn = date(input.intendedMoveIn, 'Intended move-in date'); requireThat(moveIn >= today, 'Select today or a future move-in date.'); r.intendedMoveIn = moveIn;
      const application = { id: id(), residentId: r.id, bedId: bed.id, intendedMoveIn: moveIn, status: 'submitted' as const, submittedAt: time }; state.applications.push(application);
      notifyAdmins(state, 'Admission to review', `${r.name} (${r.residentNumber}) requested bed ${bed.label}.`, `application:${application.id}`, now); audit(state, user, action, application.id, `Bed preference ${bed.label}`, now); break;
    }
    case 'application.review': {
      admin(user); const a = state.applications.find(a => a.id === input.applicationId); requireThat(a, 'Application not found.', 404); requireThat(a.status === 'submitted', 'This application has already been reviewed.'); const r = findResident(state, a.residentId);
      requireThat(input.decision === 'approve' || input.decision === 'reject', 'Select approve or reject.');
      if (input.decision === 'reject') { a.status = 'rejected'; a.reason = str(input.reason, 'Rejection reason'); }
      else {
        requireAdmissionReady(state, r); const { room, bed } = findBed(state, a.bedId); requireThat(bed.status === 'available', 'Another admission already reserved this bed. Request a different choice.');
        const rent = room.rentPaise ?? state.settings.monthlyRentPaise; requireThat(rent !== null && state.settings.depositPaise !== null && state.settings.dailyPenaltyPaise !== null, 'Configure rent, deposit and daily penalty amounts before admission.');
        requireThat(a.intendedMoveIn >= today, 'The intended move-in date has passed. Reject the application so the resident can submit an updated date.');
        bed.status = 'reserved'; bed.residentId = r.id; a.status = 'approved'; a.paymentDeadline = new Date(now.getTime() + 48 * HOUR).toISOString();
        const bill = newBill(state, r, 'admission', a.intendedMoveIn.slice(0, 7), a.paymentDeadline, [line('rent', `First-month rent, ${a.intendedMoveIn} to month end (inclusive)`, prorateRent(rent, a.intendedMoveIn), now), line('deposit', 'Refundable security deposit', state.settings.depositPaise, now)], now); a.billId = bill.id;
      }
      a.decidedAt = time; a.decidedBy = user.id; notify(state, r.userId, a.status === 'approved' ? 'Admission approved' : 'Admission decision', a.status === 'approved' ? 'Submit first-month rent and security-deposit payment proof within 48 hours to keep your bed reserved.' : a.reason!, `application-decision:${a.id}`, now); audit(state, user, action, a.id, `${input.decision}: ${a.reason ?? '48-hour payment window opened'}`, now); break;
    }
    case 'document.review': {
      admin(user); const r = findResident(state, input.residentId); requireThat(input.decision === 'verify' || input.decision === 'reject', 'Choose verify or reject.');
      if (input.decision === 'verify') requireThat(r.synthetic || (r.identityDocumentId && r.guardianDocumentId), 'Both resident and guardian documents are required for review.');
      r.documentStatus = input.decision === 'verify' ? 'verified' : 'rejected'; r.documentReason = input.decision === 'reject' ? str(input.reason, 'Rejection reason') : String(input.reason ?? 'Documents reviewed');
      notify(state, r.id, 'Document review updated', r.documentStatus === 'verified' ? 'Your identity documents have been reviewed.' : r.documentReason, `documents:${r.id}:${id()}`, now); audit(state, user, action, r.id, r.documentReason, now); break;
    }
    case 'resident.checkin': {
      admin(user); const r = findResident(state, input.residentId); requireThat(r.status === 'booked' && r.bedId, 'A verified booking is required before check-in.');
      const day = date(input.date, 'Move-in date'); requireThat(day <= today, 'Actual move-in cannot be in the future.'); const app = state.applications.find(a => a.residentId === r.id && a.status === 'confirmed');
      requireThat(day === app?.intendedMoveIn || Boolean(input.reason), 'Record a reason and review the bill adjustment when changing the intended move-in date.');
      const { bed } = findBed(state, r.bedId); requireThat(bed.status === 'reserved' && bed.residentId === r.id, 'The reserved bed assignment is inconsistent.');
      bed.status = 'occupied'; r.status = 'active'; r.moveInDate = day; audit(state, user, action, r.id, `${day}; ${String(input.reason ?? 'Confirmed arrival')}`, now); break;
    }
    case 'resident.admitExisting': {
      admin(user); const r = findResident(state, input.residentId); requireThat(r.status === 'applicant' && !state.applications.some(a => a.residentId === r.id && ['approved', 'confirmed'].includes(a.status)), 'This resident already has a booking.');
      const { bed } = findBed(state, input.bedId); requireThat(bed.status === 'available', 'That bed is not available.');
      const day = date(input.moveInDate, 'Original move-in date'); requireThat(day <= today, 'An existing resident must already have moved in.'); const reason = str(input.reason, 'Existing-resident reason');
      bed.status = 'occupied'; bed.residentId = r.id; r.bedId = bed.id; r.status = 'active'; r.moveInDate = day;
      const amount = money(input.openingBalancePaise ?? 0, 'Opening balance'); if (amount) newBill(state, r, 'adjustment', today.slice(0, 7), new Date(now.getTime() + 5 * DAY).toISOString(), [line('adjustment', `Opening balance: ${reason}`, amount, now)], now);
      for (const a of state.applications.filter(a => a.residentId === r.id && a.status === 'submitted')) { a.status = 'rejected'; a.reason = 'Imported as an existing resident'; a.decidedBy = user.id; a.decidedAt = time; }
      audit(state, user, action, r.id, `${day}; ${reason}; no historical payment fabricated`, now); break;
    }
    case 'payment.submit': {
      const r = resident(state, user); const bill = state.bills.find(b => b.id === input.billId && b.residentId === r.id); requireThat(bill, 'Bill not found.', 404); requireThat(bill.status === 'unpaid', 'This bill is already paid, cancelled, or awaiting review.'); paymentWindow(state, bill, now);
      const amount = money(input.amountPaise, 'Amount paid'); requireThat(amount > 0 && amount === outstanding(bill), 'Submit the exact outstanding amount for this bill. Ask an admin about adjustments.');
      const paidOn = date(input.paidOn, 'Payment date'); requireThat(paidOn <= today, 'Payment date cannot be in the future.');
      const reference = str(input.reference, 'Transaction reference', 160); const payment: Payment = { id: id(), billId: bill.id, residentId: r.id, amountPaise: amount, paidOn, reference, method: str(input.method, 'Payment method', 80), proofId: str(input.proofId, 'Payment proof', 160), status: 'submitted', submittedAt: time, duplicateReference: state.payments.some(p => p.reference.toLowerCase() === reference.toLowerCase()) };
      state.payments.push(payment); bill.status = 'pending'; notifyAdmins(state, 'Payment awaiting verification', `${r.name} submitted a payment for ${bill.period}.`, `payment:${payment.id}`, now); audit(state, user, action, payment.id, `Submitted against ${bill.id}`, now); break;
    }
    case 'payment.review': {
      admin(user); const payment = state.payments.find(p => p.id === input.paymentId); requireThat(payment, 'Payment not found.', 404); requireThat(payment.status === 'submitted', 'Another admin already reviewed this payment.');
      const bill = state.bills.find(b => b.id === payment.billId)!; requireThat(bill.status === 'pending', 'This bill is not awaiting review.'); const r = findResident(state, payment.residentId);
      requireThat(input.decision === 'verify' || input.decision === 'reject', 'Select verify or reject.');
      if (input.decision === 'verify') {
        requireThat(payment.amountPaise === outstanding(bill), 'The amount does not match the outstanding bill. Reject it and review an adjustment.'); payment.status = 'verified'; bill.paidPaise += payment.amountPaise; bill.status = 'paid'; bill.settledAt = time;
        confirmBooking(state, bill);
      } else {
        payment.status = 'rejected'; payment.reason = str(input.reason, 'Rejection reason'); bill.status = 'unpaid';
        const a = state.applications.find(a => a.billId === bill.id && a.status === 'approved'); if (a) { a.paymentDeadline = new Date(now.getTime() + 48 * HOUR).toISOString(); bill.dueAt = a.paymentDeadline; }
      }
      payment.reviewedAt = time; payment.reviewedBy = user.id; notify(state, r.id, payment.status === 'verified' ? 'Payment verified' : 'Payment rejected — action needed', payment.status === 'verified' ? `Your ${bill.period} payment has been verified.` : `${payment.reason}${bill.kind === 'admission' ? ' A fresh 48-hour resubmission window is now open.' : ' Submit corrected proof through the payment tab.'}`, `payment-review:${payment.id}`, now); audit(state, user, action, payment.id, `${input.decision}; ${payment.reason ?? 'Ledger payment recorded'}`, now); break;
    }
    case 'bill.adjust': {
      admin(user); const bill = state.bills.find(b => b.id === input.billId); requireThat(bill, 'Bill not found.', 404); requireThat(bill.status === 'unpaid', 'Only an unpaid bill can be adjusted. Verified ledger entries remain immutable.');
      const amount = money(input.amountPaise, 'Adjustment amount', true); requireThat(amount !== 0, 'Enter a non-zero adjustment.'); requireThat(total(bill) + amount >= bill.paidPaise, 'The adjustment cannot reduce the bill below money already credited.');
      const reason = str(input.reason, 'Adjustment reason'); bill.lines.push(line('adjustment', reason, amount, now)); total(bill);
      if (outstanding(bill) === 0) { bill.status = 'paid'; bill.settledAt = time; confirmBooking(state, bill); notify(state, bill.residentId, 'Bill settled by adjustment', 'An admin adjustment settled the outstanding balance. No bank payment was recorded.', `bill-adjust-settle:${bill.id}`, now); }
      audit(state, user, action, bill.id, `${amount} paise; ${reason}`, now); break;
    }
    case 'meal.submit': {
      const r = activeResident(state, user); const day = date(input.date, 'Meal date'); requireThat(day === addDays(today, 1) && businessHour(now) >= 18 && businessHour(now) < 23, 'Tomorrow’s meal form is open from 6 PM to 11 PM IST.');
      requireThat(!state.mealLocks.some(l => l.date === day), 'The meal count is already locked. Use an emergency request.'); requireThat(!fullDayAway(state, r.id, day), 'This day is fully covered by an outpass.');
      saveMeal(state, r, day, dayChoice(state, day, input), now, 'resident'); audit(state, user, action, r.id, `Meal choices for ${day}`, now); break;
    }
    case 'meal.request': {
      const r = activeResident(state, user); const day = date(input.date, 'Meal date'); requireThat(day >= today && day <= addDays(today, 1), 'Emergency requests are available for today or tomorrow.');
      requireThat(!state.mealRequests.some(m => m.residentId === r.id && m.date === day && m.status === 'pending'), 'You already have a pending request for that date.');
      const request = { id: id(), residentId: r.id, date: day, ...dayChoice(state, day, input), reason: str(input.reason, 'Emergency reason'), status: 'pending' as const, requestedAt: time }; state.mealRequests.push(request); notifyAdmins(state, 'Emergency meal request', `${r.name} requests a meal change for ${day}.`, `meal-request:${request.id}`, now); break;
    }
    case 'meal.review': {
      admin(user); const request = state.mealRequests.find(m => m.id === input.requestId); requireThat(request && request.status === 'pending', 'Pending meal request not found.', 404); requireThat(input.decision === 'approve' || input.decision === 'reject', 'Choose approve or reject.');
      const reason = str(input.reason, 'Decision reason'); request.status = input.decision === 'approve' ? 'approved' : 'rejected'; request.reviewedAt = time; request.reviewedBy = user.id; request.decisionReason = reason;
      if (request.status === 'approved') { const r = findResident(state, request.residentId); requireThat(r.status === 'active', 'The resident has checked out.'); saveMeal(state, r, request.date, request, now, 'admin'); const lock = state.mealLocks.find(l => l.date === request.date); if (lock) { lock.current = selectedCounts(state, request.date); lock.revision++; } }
      notify(state, request.residentId, `Emergency meal request ${request.status}`, reason, `meal-decision:${request.id}`, now); audit(state, user, action, request.id, reason, now); break;
    }
    case 'outpass.create': {
      const r = activeResident(state, user); const departureAt = timestamp(input.departureAt, 'Departure time'); const expectedReturnAt = timestamp(input.expectedReturnAt, 'Expected return');
      requireThat(new Date(departureAt).getTime() >= now.getTime() - 5 * 60_000, 'Choose a current or future departure.'); requireThat(new Date(expectedReturnAt).getTime() - new Date(departureAt).getTime() > DAY, 'An outpass is for an absence longer than 24 hours.');
      requireThat(!state.outpasses.some(o => o.residentId === r.id && (o.status === 'away' || (o.status === 'approved' && new Date(o.departureAt) < new Date(expectedReturnAt) && new Date(o.expectedReturnAt) > new Date(departureAt)))), 'This overlaps an existing outpass or an unrecorded return.');
      const outpass: Outpass = { id: id(), residentId: r.id, departureAt, originalReturnAt: expectedReturnAt, expectedReturnAt, destination: str(input.destination, 'Destination', 500), reason: str(input.reason, 'Reason'), contact: str(input.contact, 'Contact number', 80), status: 'approved', createdAt: time, extensions: [] }; state.outpasses.push(outpass); refreshMealEligibility(state, now); audit(state, user, action, outpass.id, 'Automatically approved; actual departure not yet recorded', now); break;
    }
    case 'outpass.cancel': {
      const r = resident(state, user); const o = state.outpasses.find(o => o.id === input.outpassId && o.residentId === r.id); requireThat(o, 'Outpass not found.', 404); requireThat(o.status === 'approved', 'Only an outpass with no departure can be cancelled.'); o.status = 'cancelled'; audit(state, user, action, o.id, 'Cancelled before departure', now); break;
    }
    case 'outpass.extend': {
      const r = activeResident(state, user); const o = state.outpasses.find(o => o.id === input.outpassId && o.residentId === r.id); requireThat(o && ['approved', 'away'].includes(o.status), 'Active outpass not found.', 404);
      const expected = timestamp(input.expectedReturnAt, 'New expected return'); requireThat(new Date(expected) > new Date(o.expectedReturnAt), 'Extension must be after the current approved return.'); requireThat(new Date(expected).getTime() <= new Date(o.originalReturnAt).getTime() + 48 * HOUR, 'An outpass can be extended by at most 48 hours in total.');
      requireThat(!o.extensions.some(e => e.status === 'pending'), 'This outpass already has an extension awaiting review.');
      const extension = { id: id(), requestedReturnAt: expected, reason: str(input.reason, 'Extension reason'), status: 'pending' as const, requestedAt: time }; o.extensions.push(extension); notifyAdmins(state, 'Outpass extension requested', `${r.name} requested a later return. The approved deadline is unchanged until review.`, `extension:${extension.id}`, now); audit(state, user, action, o.id, `Requested ${expected}; current deadline unchanged`, now); break;
    }
    case 'outpass.reviewExtension': {
      admin(user); const o = state.outpasses.find(o => o.id === input.outpassId); const e = o?.extensions.find(e => e.id === input.extensionId); requireThat(o && e && e.status === 'pending', 'Pending extension not found.', 404); requireThat(['approved', 'away'].includes(o.status), 'This outpass is already closed.'); requireThat(input.decision === 'approve' || input.decision === 'reject', 'Choose approve or reject.');
      if (input.decision === 'approve') {
        requireThat(new Date(e.requestedReturnAt) > new Date(o.expectedReturnAt) && new Date(e.requestedReturnAt).getTime() <= new Date(o.originalReturnAt).getTime() + 48 * HOUR, 'The cumulative extension would exceed 48 hours or no longer extend this outpass.');
        requireThat(!state.outpasses.some(other => other.id !== o.id && other.residentId === o.residentId && ['approved', 'away'].includes(other.status) && new Date(other.departureAt) < new Date(e.requestedReturnAt) && new Date(other.expectedReturnAt) > new Date(o.departureAt)), 'The extension overlaps another outpass.'); o.expectedReturnAt = e.requestedReturnAt; e.status = 'approved'; refreshMealEligibility(state, now);
      } else { e.status = 'rejected'; e.decisionReason = str(input.reason, 'Rejection reason'); }
      e.reviewedAt = time; e.reviewedBy = user.id; e.decisionReason ??= String(input.reason ?? 'Approved'); notify(state, o.residentId, `Outpass extension ${e.status}`, `Approved expected return remains ${istDateTime(o.expectedReturnAt)}. ${e.decisionReason}`, `extension-decision:${e.id}`, now); audit(state, user, action, o.id, `${e.status}; ${e.decisionReason}`, now); break;
    }
    case 'attendance.record': admin(user); eventRecord(state, user, input, now, 'manual'); break;
    case 'attendance.escalate': { admin(user); const r = findResident(state, input.residentId); const day = date(input.date, 'Attendance date'); const reason = str(input.reason, 'Escalation reason'); requireThat(r.guardianUserId, 'This resident has no linked guardian account.'); notify(state, r.guardianUserId, 'Attendance follow-up', `${r.name}, ${day}: ${reason}`, `attendance-escalation:${r.id}:${day}:${id()}`, now); audit(state, user, action, r.id, reason, now); break; }
    case 'transfer.request': {
      const r = activeResident(state, user); requireThat(r.bedId, 'No current bed assignment.'); const { bed } = findBed(state, input.bedId); requireThat(bed.status === 'available', 'That bed is unavailable.'); requireThat(!state.transfers.some(t => t.residentId === r.id && t.status === 'pending'), 'A transfer is already awaiting review.');
      const transfer = { id: id(), residentId: r.id, fromBedId: r.bedId, toBedId: bed.id, reason: str(input.reason, 'Transfer reason'), status: 'pending' as const, requestedAt: time }; state.transfers.push(transfer); notifyAdmins(state, 'Room transfer requested', `${r.name} requested bed ${bed.label}.`, `transfer:${transfer.id}`, now); break;
    }
    case 'transfer.review': {
      admin(user); const t = state.transfers.find(t => t.id === input.transferId); requireThat(t && t.status === 'pending', 'Pending transfer not found.', 404); requireThat(input.decision === 'approve' || input.decision === 'reject', 'Choose approve or reject.'); const reason = str(input.reason, 'Decision and rate-adjustment reason');
      const r = findResident(state, t.residentId); requireThat(r.status === 'active' && r.bedId === t.fromBedId, 'The original bed assignment has changed.');
      if (input.decision === 'approve') { const old = findBed(state, t.fromBedId).bed; const target = findBed(state, t.toBedId).bed; requireThat(target.status === 'available', 'The target bed is no longer available.'); requireThat(old.residentId === r.id, 'The current bed assignment is inconsistent.'); old.status = 'available'; delete old.residentId; target.status = 'occupied'; target.residentId = r.id; r.bedId = target.id; t.status = 'approved'; } else t.status = 'rejected';
      t.reviewedAt = time; t.reviewedBy = user.id; t.decisionReason = reason; notify(state, r.id, `Bed transfer ${t.status}`, reason, `transfer-decision:${t.id}`, now); audit(state, user, action, t.id, reason, now); break;
    }
    case 'checkout.record': {
      admin(user); const r = findResident(state, input.residentId); requireThat(r.status === 'active' && r.bedId, 'Only an active resident can check out.');
      const day = date(input.date, 'Checkout date'); requireThat(day <= today && day >= r.moveInDate!, 'Checkout must be between move-in and today.'); requireThat(!state.outpasses.some(o => o.residentId === r.id && o.status === 'away'), 'Record the resident’s actual return or resolve the away record before checkout.');
      const reason = str(input.reason, 'Checkout reason'); const deposit = state.bills.filter(b => b.residentId === r.id && b.status === 'paid').flatMap(b => b.lines).filter(l => l.kind === 'deposit').reduce((s, l) => s + l.amountPaise, 0); const deductions = money(input.deductionsPaise, 'Deductions'); requireThat(deductions <= deposit, 'Deductions cannot exceed the recorded deposit.'); const deductionReason = deductions ? str(input.deductionReason, 'Deduction reason') : String(input.deductionReason ?? 'No deductions');
      const bed = findBed(state, r.bedId).bed; requireThat(bed.residentId === r.id, 'The bed assignment is inconsistent.'); bed.status = 'available'; delete bed.residentId; r.status = 'checked_out'; delete r.bedId;
      const checkout = { id: id(), residentId: r.id, date: day, reason, depositPaise: deposit, deductionsPaise: deductions, deductionReason, refundPaise: deposit - deductions, refundStatus: 'pending' as const, createdAt: time, createdBy: user.id }; state.checkoutRecords.push(checkout);
      for (const o of state.outpasses.filter(o => o.residentId === r.id && o.status === 'approved')) o.status = 'cancelled'; for (const t of state.transfers.filter(t => t.residentId === r.id && t.status === 'pending')) { t.status = 'rejected'; t.decisionReason = 'Resident checked out'; t.reviewedAt = time; t.reviewedBy = user.id; }
      audit(state, user, action, r.id, `${day}; ${reason}; refund must be recorded separately`, now); break;
    }
    case 'checkout.refund': { admin(user); const c = state.checkoutRecords.find(c => c.id === input.checkoutId); requireThat(c && c.refundStatus === 'pending', 'Pending refund not found.', 404); c.refundReference = str(input.reference, 'Refund transaction reference', 160); c.refundStatus = 'recorded'; audit(state, user, action, c.id, `${str(input.reason, 'Refund reason')}; externally transferred, reference ${c.refundReference}`, now); break; }
    case 'message.send': {
      const ownerId = user.role === 'admin' ? str(input.ownerId, 'Conversation account', 160) : user.id; requireThat(state.actors[ownerId] && state.actors[ownerId].role !== 'admin', 'Conversation account not found.', 404); const body = str(input.body, 'Message', 5000);
      const message = { id: id(), ownerId, senderId: user.id, senderName: user.name, senderRole: user.role, body, attachmentId: input.attachmentId ? str(input.attachmentId, 'Attachment', 160) : undefined, createdAt: time, readBy: [user.id] }; state.messages.push(message);
      if (user.role === 'admin') notify(state, ownerId, 'New private message', 'The Ryuu admin team sent you a message. Open your private inbox to read it.', `message:${message.id}`, now); else notifyAdmins(state, 'Private message received', `${user.name} sent a private message.`, `message:${message.id}`, now); break;
    }
    case 'message.read': { const ownerId = user.role === 'admin' ? str(input.ownerId, 'Conversation account', 160) : user.id; for (const m of state.messages.filter(m => m.ownerId === ownerId)) if (!m.readBy.includes(user.id)) m.readBy.push(user.id); break; }
    case 'ticket.create': {
      requireThat(user.role !== 'admin', 'Create tickets from a resident or guardian account.'); const category = str(input.category, 'Category', 100); requireThat(state.settings.ticketCategories.includes(category), 'Select an available ticket category.');
      const ticket = { id: id(), number: `JN-T${String(state.tickets.length + 1).padStart(5, '0')}`, ownerId: user.id, ownerName: user.name, category, subject: str(input.subject, 'Subject', 200), description: str(input.description, 'Description', 5000), priority: input.priority === 'urgent' ? 'urgent' as const : 'normal' as const, attachmentId: input.attachmentId ? str(input.attachmentId, 'Attachment', 160) : undefined, status: 'open' as const, replies: [], createdAt: time, updatedAt: time }; state.tickets.push(ticket); notifyAdmins(state, 'New support ticket', `${ticket.number}: ${ticket.subject}`, `ticket:${ticket.id}`, now); break;
    }
    case 'ticket.reply': {
      const ticket = state.tickets.find(t => t.id === input.ticketId && (user.role === 'admin' || t.ownerId === user.id)); requireThat(ticket, 'Ticket not found.', 404); const reply = { id: id(), senderId: user.id, senderName: user.name, body: str(input.body, 'Reply', 5000), createdAt: time }; ticket.replies.push(reply); ticket.updatedAt = time;
      if (user.role === 'admin') notify(state, ticket.ownerId, 'Ticket reply', `The admin team replied to ${ticket.number}.`, `ticket-reply:${reply.id}`, now); else notifyAdmins(state, 'Ticket reply', `${user.name} replied to ${ticket.number}.`, `ticket-reply:${reply.id}`, now); break;
    }
    case 'ticket.update': {
      const ticket = state.tickets.find(t => t.id === input.ticketId && (user.role === 'admin' || t.ownerId === user.id)); requireThat(ticket, 'Ticket not found.', 404);
      requireThat(['open', 'in_progress', 'resolved', 'closed'].includes(String(input.status)), 'Invalid ticket status.'); if (user.role !== 'admin') requireThat(input.status === 'open' && ['resolved', 'closed'].includes(ticket.status), 'Residents and guardians can reopen a resolved or closed ticket.');
      if (input.assignedTo !== undefined) { admin(user); requireThat(input.assignedTo === '' || state.actors[String(input.assignedTo)]?.role === 'admin', 'Select an administrator.'); ticket.assignedTo = String(input.assignedTo) || undefined; }
      ticket.status = input.status as typeof ticket.status; ticket.updatedAt = time; notify(state, ticket.ownerId, 'Ticket status changed', `${ticket.number} is now ${ticket.status.replace('_', ' ')}.`, `ticket-status:${ticket.id}:${id()}`, now); audit(state, user, action, ticket.id, ticket.status, now); break;
    }
    case 'notice.publish': {
      admin(user); requireThat(['residents', 'guardians', 'both'].includes(String(input.audience)), 'Choose residents, guardians or both.'); const audience = input.audience as 'residents' | 'guardians' | 'both';
      const current = state.residents.filter(r => r.status === 'active'); const recipients = new Set<string>(); for (const r of current) { if (audience !== 'guardians') recipients.add(r.userId); if (audience !== 'residents' && r.guardianUserId) recipients.add(r.guardianUserId); }
      const notice = { id: id(), title: str(input.title, 'Title', 200), body: str(input.body, 'Announcement', 10000), audience, authorId: user.id, authorName: user.name, createdAt: time, recipientIds: [...recipients] }; state.notices.push(notice); for (const recipient of recipients) notify(state, recipient, notice.title, 'A hostel announcement is available in your portal.', `notice:${notice.id}`, now); audit(state, user, action, notice.id, `${audience}; ${recipients.size} recipients`, now); break;
    }
    case 'notification.read': for (const n of state.notifications.filter(n => n.userId === user.id && (!input.notificationId || n.id === input.notificationId))) n.readAt ??= time; break;
    case 'settings.update': {
      admin(user); const next = state.settings;
      for (const key of ['hostelName', 'address', 'phone', 'email', 'openingDate', 'paymentUpi', 'bankName', 'accountName', 'accountNumber', 'ifsc', 'qrDocumentId'] as const) if (input[key] !== undefined) { requireThat(typeof input[key] === 'string' && String(input[key]).length < 2000, `Invalid ${key}.`); next[key] = String(input[key]).trim(); }
      for (const key of ['monthlyRentPaise', 'depositPaise', 'dailyPenaltyPaise', 'checkoutNoticeDays'] as const) if (input[key] !== undefined) next[key] = input[key] === null ? null : money(input[key], key);
      if (input.food !== undefined) { requireThat(input.food && typeof input.food === 'object', 'Invalid food policy.'); const food = input.food as Record<string, unknown>; requireThat(['not_configured', 'included', 'monthly', 'per_meal'].includes(String(food.mode)), 'Invalid food mode.'); next.food = { mode: food.mode as FoodPolicy['mode'], monthlyPaise: money(food.monthlyPaise, 'Monthly food amount'), breakfastPaise: money(food.breakfastPaise, 'Breakfast amount'), lunchPaise: money(food.lunchPaise, 'Lunch amount'), dinnerPaise: money(food.dinnerPaise, 'Dinner amount'), nonVegDays: nonVegDays(state.settings.food) };
        if (food.nonVegDays !== undefined) { requireThat(Array.isArray(food.nonVegDays) && food.nonVegDays.every(n => Number.isInteger(n) && n >= 0 && n <= 6), 'Choose valid non-veg days.'); next.food.nonVegDays = [...new Set(food.nonVegDays as number[])].sort(); } }
      if (input.identityPolicy !== undefined) { requireThat(['pending_review', 'aadhaar_required', 'alternative_id'].includes(String(input.identityPolicy)), 'Invalid identity policy.'); next.identityPolicy = input.identityPolicy as Settings['identityPolicy']; }
      if (input.monthlyReminderDays !== undefined) { requireThat(Array.isArray(input.monthlyReminderDays) && input.monthlyReminderDays.every(n => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 28), 'Monthly reminder days must be between 1 and 28.'); next.monthlyReminderDays = [...new Set(input.monthlyReminderDays as number[])]; }
      if (input.ticketCategories !== undefined) { requireThat(Array.isArray(input.ticketCategories) && input.ticketCategories.length > 0 && input.ticketCategories.length <= 30, 'Provide 1–30 ticket categories.'); next.ticketCategories = [...new Set(input.ticketCategories.map(c => str(c, 'Category', 100)))]; }
      audit(state, user, action, 'settings', `Changed: ${Object.keys(input).filter(k => k !== 'accountNumber').join(', ')}`, now); break;
    }
    case 'room.create': {
      admin(user); const label = str(input.label, 'Room label', 60); requireThat(!state.rooms.some(r => r.label === label), 'That room label already exists.'); const sharing = Number(input.sharing); requireThat(Number.isInteger(sharing) && sharing >= 1 && sharing <= 12, 'Sharing must be between 1 and 12.');
      const roomId = id(); state.rooms.push({ id: roomId, label, floor: str(input.floor, 'Floor', 100), sharing, rentPaise: input.rentPaise === undefined || input.rentPaise === null ? null : money(input.rentPaise, 'Room rent'), ac: input.ac !== false, bathroom: input.bathroom !== false, synthetic: false, beds: Array.from({ length: sharing }, (_, i) => ({ id: id(), label: `${label}-${String.fromCharCode(65 + i)}`, status: 'available' })) }); audit(state, user, action, roomId, `${label}; ${sharing} beds`, now); break;
    }
    case 'room.update': { admin(user); const room = state.rooms.find(r => r.id === input.roomId); requireThat(room, 'Room not found.', 404); if (input.label !== undefined) { const label = str(input.label, 'Room label', 60); requireThat(!state.rooms.some(r => r.id !== room.id && r.label === label), 'Room label already exists.'); room.label = label; } if (input.floor !== undefined) room.floor = str(input.floor, 'Floor', 100); if (input.rentPaise !== undefined) room.rentPaise = input.rentPaise === null ? null : money(input.rentPaise, 'Room rent'); if (input.ac !== undefined) { requireThat(typeof input.ac === 'boolean', 'Choose AC or non-AC.'); room.ac = input.ac; } audit(state, user, action, room.id, 'Room details updated', now); break; }
    case 'bed.status': { admin(user); const { bed } = findBed(state, input.bedId); requireThat(!bed.residentId && ['available', 'maintenance'].includes(bed.status), 'An assigned or reserved bed cannot be marked unavailable.'); requireThat(input.status === 'available' || input.status === 'maintenance', 'Select available or maintenance.'); bed.status = input.status; audit(state, user, action, bed.id, bed.status, now); break; }
    case 'jobs.run': admin(user); processScheduledJobs(state, now); audit(state, user, action, 'scheduler', 'Manual scheduler reconciliation', now); break;
    default: if (applyExtraAction(state, user, action, input, now, extrasCtx(state, user, now))) break; throw new DomainError('Unknown portal action.', 400);
  }
}

export function processScheduledJobs(state: DomainState, now = new Date()): void {
  const time = now.toISOString(), today = businessDate(now), hour = businessHour(now), period = today.slice(0, 7);
  for (const a of state.applications.filter(a => a.status === 'approved' && a.paymentDeadline && new Date(a.paymentDeadline) <= now)) {
    const bill = state.bills.find(b => b.id === a.billId); if (bill?.status === 'pending') continue;
    a.status = 'expired'; if (bill && bill.status !== 'paid') bill.status = 'cancelled'; const { bed } = findBed(state, a.bedId); if (bed.residentId === a.residentId && bed.status === 'reserved') { bed.status = 'available'; delete bed.residentId; }
    notify(state, a.residentId, 'Bed reservation expired', 'The payment-submission deadline passed. Select an available bed to apply again.', `application-expired:${a.id}`, now); audit(state, system, 'application.expired', a.id, '48-hour payment window elapsed without accepted proof', now);
  }
  for (const r of state.residents.filter(r => r.moveInDate)) {
    // Import starts at the profile creation month; historical opening balances are explicit.
    const first = [addMonths(r.moveInDate!.slice(0, 7), 1), r.createdAt.slice(0, 7)].sort().at(-1)!;
    for (let month = first; month <= period; month = addMonths(month, 1)) {
      if (!activeOn(state, r, `${month}-01`) || state.bills.some(b => b.residentId === r.id && b.period === month && b.kind === 'monthly')) continue;
      const room = r.bedId ? findBed(state, r.bedId).room : undefined; const rent = room?.rentPaise ?? state.settings.monthlyRentPaise;
      if (rent === null || state.settings.dailyPenaltyPaise === null) { notifyAdmins(state, 'Billing settings needed', 'Configure monthly rent and daily penalties to generate resident bills.', `billing-settings:${month}`, now); continue; }
      const lines = [line('rent', `Monthly rent — ${month}`, rent, now)];
      if (state.settings.food.mode === 'monthly') lines.push(line('food', 'Monthly food package', state.settings.food.monthlyPaise, now));
      const lastMonth = addMonths(month, -1); const foodTotal = state.meals.filter(m => m.residentId === r.id && m.date.startsWith(lastMonth) && m.foodPolicy.mode === 'per_meal').reduce((sum, m) => sum + (m.breakfast ? m.foodPolicy.breakfastPaise : 0) + (m.lunch ? m.foodPolicy.lunchPaise : 0) + (m.dinner ? m.foodPolicy.dinnerPaise : 0), 0);
      if (foodTotal) lines.push(line('food', `Selected meals in ${lastMonth}`, foodTotal, now));
      const bill = newBill(state, r, 'monthly', month, new Date(localTime(`${month}-06`).getTime() - 1).toISOString(), lines, now); notify(state, r.id, 'Monthly bill ready', `Your ${month} bill is ready. Submit payment proof by the 5th.`, `bill:${bill.id}`, now);
    }
  }
  // A whole IST day with any review interval is excluded, even after rejection.
  for (const bill of state.bills.filter(b => b.kind === 'monthly' && b.status !== 'cancelled')) {
    const last = bill.settledAt ? addDays(businessDate(new Date(bill.settledAt)), -1) : addDays(today, -1);
    let from = bill.penaltyThrough ? addDays(bill.penaltyThrough, 1) : `${bill.period}-06`;
    const payments = state.payments.filter(p => p.billId === bill.id);
    for (let day = from; day <= last; day = addDays(day, 1)) {
      const start = localTime(day), end = localTime(addDays(day, 1));
      const reviewDuringDay = payments.some(p => new Date(p.submittedAt) < end && (!p.reviewedAt || new Date(p.reviewedAt) > start));
      if (!reviewDuringDay && bill.dailyPenaltyPaise > 0 && !bill.lines.some(l => l.kind === 'penalty' && l.date === day) && (!bill.settledAt || new Date(bill.settledAt) >= end)) bill.lines.push(line('penalty', `Daily late fee — ${day}`, bill.dailyPenaltyPaise, now, day));
      bill.penaltyThrough = day;
    }
    total(bill);
    if (bill.status === 'unpaid' && state.settings.monthlyReminderDays.includes(Number(today.slice(-2))) && hour >= 9) notify(state, bill.residentId, new Date(bill.dueAt) < now ? 'Payment overdue' : 'Payment reminder', `Your ${bill.period} bill has ₹${(outstanding(bill) / 100).toFixed(2)} outstanding.`, `bill-reminder:${bill.id}:${today}`, now);
  }
  const tomorrow = addDays(today, 1);
  for (const r of state.residents.filter(r => r.status === 'active' && !fullDayAway(state, r.id, tomorrow))) {
    if (hour >= 18 && hour < 23) {
      const submitted = state.meals.some(m => m.residentId === r.id && m.date === tomorrow && m.source !== 'outpass');
      if (!submitted) {
        const slot = hour >= 22 ? 22 : hour >= 21 ? 21 : 18;
        notify(state, r.id, slot === 18 ? 'Choose tomorrow’s meals' : 'Meal form reminder', `Select breakfast, lunch and dinner for ${tomorrow} before 11 PM IST.`, `meal-reminder:${r.id}:${tomorrow}:${slot}`, now);
      }
    }
  }
  const startDay = businessDate(new Date(state.startedAt));
  for (let day = startDay; day <= today; day = addDays(day, 1)) {
    if (now >= localTime(day, 22)) for (const r of state.residents.filter(r => activeOn(state, r, day))) {
      if (state.attendance.some(a => a.residentId === r.id && a.date === day)) continue;
      const away = actuallyAwayAt(state, r.id, localTime(day, 22)); state.attendance.push({ id: id(), residentId: r.id, date: day, status: away ? 'away' : 'not_recorded', source: 'scheduler' });
      if (!away && !hasLateArrival(state, r.id, day)) notifyAdmins(state, 'Attendance not recorded', `${r.name} (${r.residentNumber}) has no attendance record for ${day}. Check device/outpass history and contact the resident before guardian escalation.`, `attendance-missing:${r.id}:${day}`, now);
    }
    const mealDay = addDays(day, 1); if (now >= localTime(day, 23) && !state.mealLocks.some(l => l.date === mealDay)) { const counts = selectedCounts(state, mealDay); state.mealLocks.push({ date: mealDay, lockedAt: time, original: { ...counts }, current: { ...counts }, revision: 1 }); }
  }
  for (const o of state.outpasses.filter(o => o.status === 'away' && !o.actualReturnAt)) if (now.getTime() >= new Date(o.expectedReturnAt).getTime() + DAY && o.overdueNotifiedFor !== o.expectedReturnAt) { const r = findResident(state, o.residentId); notifyAdmins(state, 'Return overdue by 24 hours', `${r.name} has not returned. Approved return: ${istDateTime(o.expectedReturnAt)}.`, `outpass-overdue:${o.id}:${o.expectedReturnAt}`, now); o.overdueNotifiedFor = o.expectedReturnAt; audit(state, system, 'outpass.overdue', o.id, `24 hours after approved return ${o.expectedReturnAt}`, now); }
  processExtraJobs(state, now, extrasCtx(state, system, now));
  state.workerLastRun = time;
}

export function snapshotFor(state: DomainState, user: DomainUser, now = new Date()): Snapshot {
  const isAdmin = user.role === 'admin'; const isGuardian = user.role === 'guardian'; const allowed = state.residents.filter(r => isAdmin || (isGuardian ? r.guardianUserId === user.id : r.userId === user.id)); const ids = new Set(allowed.map(r => r.id));
  const finance = isAdmin || user.role === 'resident'; const filtered = <T extends { residentId: string }>(rows: T[]) => rows.filter(r => isAdmin || ids.has(r.residentId));
  const residents = allowed.map(r => isAdmin ? { ...r, emailVerified: Boolean(state.actors[r.userId]?.emailVerified), phoneVerified: Boolean(state.actors[r.userId]?.phoneVerified) } : isGuardian ? ({ id: r.id, userId: r.userId, residentNumber: r.residentNumber, name: r.name, status: r.status, bedId: r.bedId, moveInDate: r.moveInDate, createdAt: r.createdAt, updatedAt: r.updatedAt, email: '', phone: '', dob: '', address: '', profession: '', organization: '', intendedMoveIn: '', guardianName: '', guardianPhone: '', guardianEmail: '', guardianDob: '', guardianProfession: '', guardianRelationship: '', documentStatus: 'pending' as const, synthetic: r.synthetic }) : { ...r });
  const rooms = state.rooms.map(room => ({ ...room, beds: room.beds.map(bed => { const copy = { ...bed }; if (!isAdmin && copy.residentId && !ids.has(copy.residentId)) delete copy.residentId; return copy; }) }));
  const settings = { ...state.settings, food: { ...state.settings.food } }; if (isGuardian) { settings.accountNumber = ''; settings.accountName = ''; settings.bankName = ''; settings.ifsc = ''; settings.paymentUpi = ''; settings.qrDocumentId = ''; }
  return structuredClone({ user, settings, residents, rooms: isGuardian ? rooms.filter(room => room.beds.some(b => b.residentId && ids.has(b.residentId))) : rooms,
    applications: finance ? filtered(state.applications) : [], bills: finance ? filtered(state.bills) : [], payments: finance ? filtered(state.payments) : [], meals: finance ? filtered(state.meals) : [], mealLocks: isAdmin ? state.mealLocks : [], mealRequests: finance ? filtered(state.mealRequests) : [],
    outpasses: filtered(state.outpasses), attendance: filtered(state.attendance), deviceEvents: isAdmin ? state.deviceEvents : [], transfers: finance ? filtered(state.transfers) : [], messages: state.messages.filter(m => isAdmin || m.ownerId === user.id), tickets: state.tickets.filter(t => isAdmin || t.ownerId === user.id), notices: state.notices.filter(n => isAdmin || n.recipientIds.includes(user.id)).map(n => ({ ...n, recipientIds: isAdmin ? n.recipientIds : [user.id] })), notifications: state.notifications.filter(n => n.userId === user.id), audit: isAdmin ? state.audit.slice(-500).reverse() : [], checkoutRecords: finance ? filtered(state.checkoutRecords) : [], extras: extrasFor(state, user, ids),
    meta: { now: now.toISOString(), businessDate: businessDate(now), tomorrow: addDays(businessDate(now), 1), timezone: 'Asia/Kolkata' as const, mealWindowOpen: businessHour(now) >= 18 && businessHour(now) < 23, attendanceWindowOpen: businessHour(now) >= 18 && businessHour(now) <= 22, workerLastRun: state.workerLastRun, revision: state.revision, demo: state.demo, integrations: { biometrics: 'not_configured' as const, email: 'not_configured' as const }, phonepe: phonePeMode() },
  });
}
async function validateUploads(state: DomainState, user: DomainUser, action: string, input: any, tx: SqlClient): Promise<void> {
  if (action === 'payment.submit') await assertUpload(String(input.proofId), user.id, ['payment'], tx);
  if (action === 'profile.update') for (const field of ['identityDocumentId', 'guardianDocumentId']) if (input[field]) await assertUpload(String(input[field]), user.id, field === 'identityDocumentId' ? ['identity'] : ['guardian_identity'], tx);
  if (action === 'profile.update') for (const [field, purpose] of Object.entries(ADMISSION_DOCUMENTS)) if (input[field]) await assertUpload(String(input[field]), user.id, [purpose], tx);
  if ((action === 'message.send' || action === 'ticket.create') && input.attachmentId) await assertUpload(String(input.attachmentId), user.id, [action === 'message.send' ? 'message' : 'ticket'], tx);
  if (action === 'document.review' && input.decision === 'verify') { admin(user); const r = findResident(state, input.residentId); if (!r.synthetic) { await assertUpload(String(r.identityDocumentId), r.id, ['identity'], tx); await assertUpload(String(r.guardianDocumentId), r.id, ['guardian_identity'], tx); } }
  if (action === 'settings.update' && input.qrDocumentId) { admin(user); await assertUpload(String(input.qrDocumentId), user.id, ['qr'], tx); }
}
export async function getSnapshot(user: DomainUser): Promise<Snapshot> { return mutate(state => { state.actors[user.id] = { ...user }; const r = state.residents.find(r => r.userId === user.id); if (r) { r.email = user.email; r.phone = user.phone; } return snapshotFor(state, user); }); }
export async function executeAction(user: DomainUser, action: string, input: unknown): Promise<Snapshot> {
  if (action === 'profile.update' && input && typeof input === 'object') requireThat(Object.keys(input).every(key => ['identityDocumentId', 'guardianDocumentId', 'residentDocumentId', ...Object.keys(ADMISSION_DOCUMENTS)].includes(key)), 'Use About / My details to change personal information.');
  return mutate(async (state, tx) => { const now = new Date(); state.actors[user.id] = { ...user }; processScheduledJobs(state, now); await validateUploads(state, user, action, input ?? {}, tx); applyAction(state, user, action, input, now); return snapshotFor(state, user, now); });
}
export async function markPhoneVerified(adminUser: DomainUser, userId: string): Promise<void> {
  await mutate(state => { const actor = state.actors[userId]; requireThat(actor, 'Account not found.', 404); actor.phoneVerified = true; audit(state, adminUser, 'contact.confirmPhone', userId, `Phone ${actor.phone} confirmed by an admin`, new Date()); notify(state, userId, 'Phone number confirmed', 'The hostel team confirmed your phone number.', `phone-confirmed:${userId}`, new Date()); });
}
export async function runScheduledJobs(now = new Date()): Promise<void> { await mutate(state => processScheduledJobs(state, now)); }
export async function recordExternalAudit(user: DomainUser, action: string, subjectId: string, details: string): Promise<void> { await mutate(state => { state.actors[user.id] = { ...user }; audit(state, user, action, subjectId, details.slice(0, 2000), new Date()); }); }
export async function recordDeviceEvent(event: { id: string; residentId: string; type: 'attendance' | 'departure' | 'return'; eventAt: string; outpassId?: string; deviceId: string }): Promise<{ accepted: boolean; reconciliation?: boolean }> {
  return mutate(state => {
    if (state.deviceEvents.some(e => e.id === event.id) || state.deviceReconciliations.some(e => e.id === event.id)) return { accepted: true };
    const now = new Date(); try { eventRecord(state, system, { ...event, reason: `Verified device ${event.deviceId}` }, now, 'device', str(event.id, 'Device event ID', 200)); return { accepted: true }; }
    catch (error) { state.deviceReconciliations.push({ id: event.id, event, reason: error instanceof Error ? error.message : 'Unmatched event', receivedAt: now.toISOString() }); notifyAdmins(state, 'Device event needs reconciliation', 'A delayed or unmatched device event needs a reasoned manual correction.', `device-reconciliation:${event.id}`, now); return { accepted: false, reconciliation: true }; }
  });
}
export async function seedDemo(users: DomainUser[]): Promise<void> {
  requireThat(!strictProduction() && process.env.DEMO_MODE === 'true', 'Demo seeding requires DEMO_MODE=true and is disabled in production.', 403);
  await mutate(state => {
    if (state.demo || state.residents.length) return; const now = new Date(), today = businessDate(now); state.demo = true; for (const user of users) state.actors[user.id] = { ...user, emailVerified: true, phoneVerified: true };
    Object.assign(state.settings, { monthlyRentPaise: 850000, depositPaise: 1500000, dailyPenaltyPaise: 5000 }); state.settings.food = { mode: 'included', monthlyPaise: 0, breakfastPaise: 0, lunchPaise: 0, dinnerPaise: 0 };
    const rs = users.filter(u => u.role === 'resident'); const guardian = users.find(u => u.role === 'guardian'); const owner = users.find(u => u.role === 'admin') ?? system;
    rs.forEach((u, index) => { const r = registerResident(state, { ...u, emailVerified: true, phoneVerified: true }, { dob: '2001-06-15', address: 'Synthetic demonstration address, Bengaluru', profession: 'Working professional', organization: 'Demo company', guardianName: guardian?.name ?? 'Demo guardian', guardianPhone: guardian?.phone ?? '0000000000', guardianEmail: guardian?.email ?? '', guardianRelationship: 'Parent' }, now); r.synthetic = true; r.documentStatus = 'verified'; r.guardianUserId = guardian?.id; if (index === 0) { const bed = state.rooms[0].beds[0]; r.status = 'active'; r.bedId = bed.id; r.moveInDate = `${today.slice(0, 7)}-01`; bed.status = 'occupied'; bed.residentId = r.id; const bill = newBill(state, r, 'monthly', today.slice(0, 7), new Date(localTime(`${today.slice(0, 7)}-06`).getTime() - 1).toISOString(), [line('rent', 'Synthetic demo monthly rent', 850000, now)], now); bill.penaltyThrough = addDays(today, -1); } });
    state.notices.push({ id: id(), title: 'Welcome to your Ryuu portal', body: 'This is a synthetic demonstration. Explore the room map, daily meals, payments and outpasses. No real money is collected. Authentication email and phone notification delivery require separate setup.', audience: 'both', authorId: owner.id, authorName: owner.name, createdAt: now.toISOString(), recipientIds: users.filter(u => u.role !== 'admin').map(u => u.id) });
    audit(state, owner, 'demo.seeded', 'demo', 'Explicit synthetic sample data created', now);
  });
}
export async function submitVisitRequest(input: Record<string, unknown>): Promise<void> { await mutate(state => addVisitRequest(state, input, new Date(), extrasCtx(state, system, new Date()))); }

/* ---------------- PhonePe online payments ---------------- */
/** Starts a PhonePe order for the bill's full outstanding amount. */
export async function startGatewayOrder(user: DomainUser, billId: string) {
  return mutate(state => {
    const r = resident(state, user); const bill = state.bills.find(b => b.id === billId && b.residentId === r.id); requireThat(bill, 'Bill not found.', 404);
    requireThat(bill.status === 'unpaid', bill.status === 'pending' ? 'Your transfer details are already being checked by the hostel team.' : 'This bill is already paid or cancelled.');
    paymentWindow(state, bill, new Date()); const amountPaise = outstanding(bill); requireThat(amountPaise >= 100, 'Online payment needs an amount of at least ₹1.');
    const x = ensureExtras(state); const now = new Date().toISOString(); const order = { id: newMerchantOrderId(), billId: bill.id, residentId: r.id, amountPaise, state: 'CREATED' as const, createdAt: now, updatedAt: now };
    x.gatewayOrders.push(order); audit(state, user, 'phonepe.start', order.id, `₹${amountPaise / 100} for ${bill.period}`, new Date());
    return { merchantOrderId: order.id, amountPaise, phone: user.phone, residentNumber: r.residentNumber, billPeriod: bill.period };
  });
}
export async function setGatewayCheckout(merchantOrderId: string, update: { phonepeOrderId?: string; error?: string }) {
  await mutate(state => { const o = ensureExtras(state).gatewayOrders.find(o => o.id === merchantOrderId); if (!o) return; if (update.error) { o.state = 'FAILED'; o.error = update.error.slice(0, 300); } else { o.state = 'PENDING'; o.phonepeOrderId = update.phonepeOrderId; } o.updatedAt = new Date().toISOString(); });
}
export async function gatewayOrderFor(user: DomainUser, merchantOrderId: string) {
  return mutate(state => { const o = ensureExtras(state).gatewayOrders.find(o => o.id === merchantOrderId); requireThat(o && (user.role === 'admin' || o.residentId === user.id), 'Payment not found.', 404); return { ...o }; });
}
/** Orders still waiting for a result (checked by the background worker in case a webhook is missed). */
export async function openGatewayOrders(): Promise<string[]> {
  await initializeDomain(); const row = (await db.query('SELECT data FROM domain_state WHERE id=1')).rows[0]; const state = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
  const cutoff = Date.now() - 2 * DAY, young = Date.now() - 90_000;
  return (state.extras?.gatewayOrders ?? []).filter((o: any) => ['CREATED', 'PENDING'].includes(o.state) && new Date(o.createdAt).getTime() > cutoff && new Date(o.createdAt).getTime() < young).map((o: any) => o.id);
}
/** Applies PhonePe's answer. Idempotent: duplicate webhooks and repeated checks change nothing. */
export function applyGatewayResult(state: DomainState, merchantOrderId: string, result: PhonePeStatus, now = new Date()): 'COMPLETED' | 'FAILED' | 'PENDING' | 'UNKNOWN' {
  const x = ensureExtras(state); const o = x.gatewayOrders.find(o => o.id === merchantOrderId); if (!o) return 'UNKNOWN';
  if (o.state === 'COMPLETED' || o.state === 'FAILED') return o.state;
  o.updatedAt = now.toISOString(); if (result.orderId) o.phonepeOrderId ||= result.orderId;
  if (result.state === 'PENDING') { o.state = 'PENDING'; return 'PENDING'; }
  const r = findResident(state, o.residentId); const bill = state.bills.find(b => b.id === o.billId);
  if (result.state === 'FAILED') { o.state = 'FAILED'; o.error = result.errorCode || 'Payment failed or was cancelled'; notify(state, r.userId, 'Payment not completed', 'Your PhonePe payment did not go through. No money was taken, or it will be returned by your bank. You can try again.', `phonepe-failed:${o.id}`, now); return 'FAILED'; }
  // COMPLETED: money has been taken. Record it, and flag anything unusual to the admins.
  o.state = 'COMPLETED'; o.transactionId = result.transactionId; o.paymentMode = result.paymentMode;
  const reference = result.transactionId || o.phonepeOrderId || o.id; const time = now.toISOString();
  const problem = result.amountPaise !== o.amountPaise ? `PhonePe reports ₹${result.amountPaise / 100}, expected ₹${o.amountPaise / 100}` : !bill ? 'The bill no longer exists' : bill.status !== 'unpaid' ? `The bill was already ${bill.status === 'paid' ? 'paid' : bill.status === 'pending' ? 'under review for a bank transfer' : bill.status}` : outstanding(bill) !== o.amountPaise ? 'The bill amount changed after the payment started' : '';
  const payment: Payment = { id: id(), billId: o.billId, residentId: r.id, amountPaise: result.amountPaise, paidOn: businessDate(now), reference, method: 'PhonePe', proofId: '', status: problem ? 'submitted' : 'verified', submittedAt: time, duplicateReference: false, ...(problem ? {} : { reviewedAt: time, reviewedBy: 'phonepe' }) };
  state.payments.push(payment); o.paymentId = payment.id;
  if (problem) {
    if (bill && bill.status === 'unpaid') bill.status = 'pending';
    notifyAdmins(state, 'PhonePe payment needs a look', `${r.name} paid ₹${result.amountPaise / 100} by PhonePe (${reference}). ${problem}. Review it in Payments; a refund may be needed.`, `phonepe-problem:${o.id}`, now);
    notify(state, r.userId, 'Payment received', `We received ₹${result.amountPaise / 100} by PhonePe. The hostel team will confirm it shortly.`, `phonepe-received:${o.id}`, now);
  } else {
    bill!.paidPaise += payment.amountPaise; bill!.status = 'paid'; bill!.settledAt = time;
    try { confirmBooking(state, bill!); } catch (error) { notifyAdmins(state, 'Booking needs attention', `${r.name} paid the admission bill by PhonePe, but the bed reservation could not be confirmed: ${(error as Error).message}`, `phonepe-booking:${o.id}`, now); }
    notify(state, r.userId, 'Payment successful', `₹${payment.amountPaise / 100} received by PhonePe for ${bill!.period}. Your receipt is ready in Payments.`, `phonepe-paid:${o.id}`, now);
    notifyAdmins(state, 'PhonePe payment received', `${r.name} paid ₹${payment.amountPaise / 100} for ${bill!.period} (${reference}).`, `phonepe-paid-admin:${o.id}`, now);
  }
  audit(state, system, 'phonepe.result', o.id, `${result.state} ${reference}${problem ? ' — ' + problem : ''}`, now); return 'COMPLETED';
}
export async function recordGatewayResult(merchantOrderId: string, result: PhonePeStatus) { return mutate(state => applyGatewayResult(state, merchantOrderId, result)); }
