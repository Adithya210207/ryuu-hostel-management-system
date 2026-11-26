import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, registerResident, applyAction, processScheduledJobs, snapshotFor, ageOn, prorateRent, businessDate, localTime, initializeDomain, ensureResident, executeAction, getSnapshot, type DomainState } from '../server/domain';
import type { DomainUser, Bill } from '../shared/domain';
import { db } from '../server/db';

const at = (text: string) => new Date(text);
const owner: DomainUser = { id: 'admin', role: 'admin', name: 'Admin One', email: 'admin@example.test', phone: '+919000000001', emailVerified: true, phoneVerified: true };
const secondAdmin: DomainUser = { ...owner, id: 'admin-two', name: 'Admin Two' };
const woman: DomainUser = { id: 'resident', role: 'resident', name: 'Resident One', email: 'resident@example.test', phone: '+919000000002', emailVerified: true, phoneVerified: true };
const other: DomainUser = { ...woman, id: 'resident-two', name: 'Resident Two', email: 'other@example.test' };
const guardian: DomainUser = { id: 'guardian', role: 'guardian', name: 'Guardian', email: 'guardian@example.test', phone: '+919000000003', emailVerified: true, phoneVerified: true };
const start = at('2026-09-01T03:30:00Z');
function fixture(active = false, now = start) {
  const state = createInitialState(now); state.actors[owner.id] = owner; state.actors[secondAdmin.id] = secondAdmin; state.actors[guardian.id] = guardian;
  Object.assign(state.settings, { monthlyRentPaise: 900000, depositPaise: 1200000, dailyPenaltyPaise: 5000, identityPolicy: 'alternative_id' });
  const r = registerResident(state, woman, { dob: '2000-09-01', address: 'Synthetic address', profession: 'Student', guardianName: 'Guardian', guardianPhone: '+919000000003' }, now);
  r.synthetic = true; r.documentStatus = 'verified'; r.guardianUserId = guardian.id;
  if (active) { r.status = 'active'; r.moveInDate = businessDate(now); r.bedId = state.rooms[0].beds[0].id; state.rooms[0].beds[0].residentId = r.id; state.rooms[0].beds[0].status = 'occupied'; }
  return state;
}
function approve(state: DomainState, now = start) {
  applyAction(state, woman, 'application.submit', { bedId: state.rooms[0].beds[0].id, intendedMoveIn: '2026-09-20' }, now);
  const application = state.applications[0]; applyAction(state, owner, 'application.review', { applicationId: application.id, decision: 'approve' }, now); return application;
}
function submit(state: DomainState, bill: Bill, now: Date) {
  applyAction(state, woman, 'payment.submit', { billId: bill.id, amountPaise: bill.totalPaise - bill.paidPaise, paidOn: businessDate(now), reference: 'SYNTHETIC-UTR', method: 'UPI', proofId: 'synthetic-proof' }, now); return state.payments.at(-1)!;
}
function monthly(state: DomainState, now = at('2026-09-01T03:30:00Z')): Bill {
  state.residents[0].moveInDate = '2026-08-15'; processScheduledJobs(state, now); return state.bills.find(b => b.kind === 'monthly')!;
}
function outpass(state: DomainState, now = at('2026-09-02T03:30:00Z')) {
  applyAction(state, woman, 'outpass.create', { departureAt: '2026-09-02T04:30:00Z', expectedReturnAt: '2026-09-05T14:30:00Z', destination: 'Synthetic destination', reason: 'Family visit', contact: '+919000000002' }, now); return state.outpasses.at(-1)!;
}

test('18th birthday is accepted; the previous day and underage profile edits are rejected', () => {
  assert.equal(ageOn('2008-09-16', '2026-09-16'), 18); assert.equal(ageOn('2008-09-16', '2026-09-15'), 17);
  assert.throws(() => registerResident(createInitialState(start), woman, { dob: '2010-01-01' }, start), /at least 18/);
  const s = fixture(); assert.throws(() => applyAction(s, woman, 'profile.update', { dob: '2015-01-01' }, start), /at least 18/);
  assert.throws(() => applyAction(s, woman, 'profile.update', { dob: '2000-99-01' }, start), /Date of birth is invalid/);
});
test('first-month proration includes arrival day in leap February and 30/31-day months', () => {
  assert.equal(prorateRent(290000, '2028-02-29'), 10000); assert.equal(prorateRent(280000, '2027-02-28'), 10000);
  assert.equal(prorateRent(300000, '2026-09-16'), 150000); assert.equal(prorateRent(310000, '2026-10-31'), 10000); assert.equal(prorateRent(310000, '2026-10-01'), 310000);
});
test('resident identifiers use auth-issued permanent IDs and never collide', () => {
  const s = fixture(); const r = registerResident(s, { ...other, residentId: 'JN-2026-0123' }, { dob: '2001-01-01' }, start);
  assert.equal(r.residentNumber, 'JN-2026-0123'); assert.notEqual(r.residentNumber, s.residents[0].residentNumber);
  assert.equal(registerResident(s, other, {}, start).residentNumber, r.residentNumber);
  assert.throws(() => registerResident(s, { ...other, id: 'third', residentId: r.residentNumber }, {}, start), /already assigned/);
});
test('unverified contacts block bed application; document review is required before approval', () => {
  const s = fixture(); assert.throws(() => applyAction(s, { ...woman, emailVerified: false }, 'application.submit', { bedId: 'bed-101-1', intendedMoveIn: '2026-09-20' }, start), /Verify your email/);
  assert.throws(()=>applyAction(s,{...woman,phoneVerified:false},'application.submit',{bedId:'bed-101-1',intendedMoveIn:'2026-09-20'},start),/Verify your email and phone/); s.actors[woman.id] = woman; applyAction(s, woman, 'application.submit', { bedId: 'bed-101-1', intendedMoveIn: '2026-09-20' }, start); s.residents[0].documentStatus = 'pending';
  assert.throws(() => applyAction(s, owner, 'application.review', { applicationId: s.applications[0].id, decision: 'approve' }, start), /identity documents/);
});
test('bed preference is shared, but only one approval can reserve the bed', () => {
  const s = fixture(); const r = registerResident(s, other, { dob: '2000-01-01', address: 'Address', profession: 'Student', guardianName: 'G', guardianPhone: '9999999999' }, start); r.synthetic = true; r.documentStatus = 'verified';
  for (const u of [woman, other]) applyAction(s, u, 'application.submit', { bedId: 'bed-101-1', intendedMoveIn: '2026-09-20' }, start);
  assert.equal(s.rooms[0].beds[0].status, 'available'); applyAction(s, owner, 'application.review', { applicationId: s.applications[0].id, decision: 'approve' }, start);
  assert.throws(() => applyAction(s, secondAdmin, 'application.review', { applicationId: s.applications[1].id, decision: 'approve' }, start), /already reserved/); assert.equal(s.rooms[0].beds[0].residentId, woman.id);
});
test('admission expires at the exact 48-hour boundary and releases the bed', () => {
  const s = fixture(); const a = approve(s); processScheduledJobs(s, at('2026-09-03T03:29:59Z')); assert.equal(a.status, 'approved'); processScheduledJobs(s, at('2026-09-03T03:30:00Z')); assert.equal(a.status, 'expired'); assert.equal(s.rooms[0].beds[0].status, 'available'); assert.equal(s.bills[0].status, 'cancelled');
});
test('timely admission proof holds the bed during review; rejection opens a fresh 48 hours', () => {
  const s = fixture(); const a = approve(s); const p = submit(s, s.bills[0], at('2026-09-02T10:00:00Z')); processScheduledJobs(s, at('2026-09-05T10:00:00Z')); assert.equal(a.status, 'approved'); assert.equal(s.rooms[0].beds[0].status, 'reserved');
  applyAction(s, owner, 'payment.review', { paymentId: p.id, decision: 'reject', reason: 'Proof unreadable' }, at('2026-09-05T10:00:00Z')); assert.equal(a.paymentDeadline, '2026-09-07T10:00:00.000Z');
  const replacement = submit(s, s.bills[0], at('2026-09-07T09:59:59Z')); processScheduledJobs(s, at('2026-09-10T10:00:00Z')); assert.equal(a.status, 'approved');
  applyAction(s, owner, 'payment.review', { paymentId: replacement.id, decision: 'verify' }, at('2026-09-10T10:00:00Z')); assert.equal(a.status, 'confirmed'); assert.equal(s.residents[0].status, 'booked'); assert.equal(s.rooms[0].beds[0].status, 'reserved'); assert.equal(s.payments.length, 2);
});
test('rejected proof without resubmission expires; proof cannot arrive at or after deadline', () => {
  const s = fixture(); const a = approve(s); const p = submit(s, s.bills[0], at('2026-09-02T10:00:00Z')); const rejectAt = at('2026-09-05T10:00:00Z'); applyAction(s, owner, 'payment.review', { paymentId: p.id, decision: 'reject', reason: 'Wrong amount' }, rejectAt);
  assert.throws(() => submit(s, s.bills[0], at(a.paymentDeadline!)), /window has expired/); processScheduledJobs(s, at(a.paymentDeadline!)); assert.equal(a.status, 'expired');
});
test('payment cannot be underpaid, viewed cross-resident or verified twice', () => {
  const s = fixture(); approve(s); const b = s.bills[0];
  assert.throws(() => applyAction(s, woman, 'payment.submit', { billId: b.id, amountPaise: 100, paidOn: '2026-09-01', reference: 'x', method: 'UPI', proofId: 'p' }, start), /exact outstanding/);
  registerResident(s, other, {}, start); assert.throws(() => applyAction(s, other, 'payment.submit', { billId: b.id }, start), /Bill not found/);
  const p = submit(s, b, start); applyAction(s, owner, 'payment.review', { paymentId: p.id, decision: 'verify' }, start); assert.throws(() => applyAction(s, secondAdmin, 'payment.review', { paymentId: p.id, decision: 'verify' }, start), /already reviewed/); assert.equal(b.paidPaise, b.totalPaise);
});
test('monthly bills are idempotent, due by IST 5th, and charge from the 6th only', () => {
  const s = fixture(true); const b = monthly(s); assert.equal(b.dueAt, '2026-09-05T18:29:59.999Z'); processScheduledJobs(s, at('2026-09-05T18:30:00Z')); assert.equal(b.lines.filter(l => l.kind === 'penalty').length, 0);
  processScheduledJobs(s, at('2026-09-06T18:30:00Z')); processScheduledJobs(s, at('2026-09-06T18:30:00Z')); assert.equal(b.lines.filter(l => l.kind === 'penalty').length, 1); assert.equal(b.lines.find(l => l.kind === 'penalty')?.date, '2026-09-06'); assert.equal(s.bills.length, 1);
});
test('daily penalties exclude every review-wait day, resume after rejection, pause on resubmission', () => {
  const s = fixture(true); const b = monthly(s); processScheduledJobs(s, localTime('2026-09-07'));
  const p = submit(s, b, localTime('2026-09-07', 12)); processScheduledJobs(s, localTime('2026-09-10', 12)); applyAction(s, owner, 'payment.review', { paymentId: p.id, decision: 'reject', reason: 'Incorrect proof' }, localTime('2026-09-10', 12));
  processScheduledJobs(s, localTime('2026-09-12', 9)); const next = submit(s, b, localTime('2026-09-12', 12)); processScheduledJobs(s, localTime('2026-09-15', 12)); applyAction(s, owner, 'payment.review', { paymentId: next.id, decision: 'verify' }, localTime('2026-09-15', 12)); processScheduledJobs(s, localTime('2026-09-20'));
  assert.deepEqual(b.lines.filter(l => l.kind === 'penalty').map(l => l.date), ['2026-09-06', '2026-09-11']); assert.equal(b.paidPaise, b.totalPaise); assert.equal(b.status, 'paid');
});
test('bill penalty policy is snapshotted; changing rates does not rewrite past bills', () => {
  const s = fixture(true); const b = monthly(s); applyAction(s, owner, 'settings.update', { dailyPenaltyPaise: 99999 }, start); processScheduledJobs(s, localTime('2026-09-07')); assert.equal(b.lines.find(l => l.kind === 'penalty')?.amountPaise, 5000);
});
test('6/9/10 PM meal reminders skip submitted all-No choices and stop after cutoff', () => {
  const s = fixture(true); processScheduledJobs(s, localTime('2026-09-01', 18)); assert.equal(s.notifications.filter(n => n.eventKey.startsWith('meal-reminder')).length, 1);
  applyAction(s, woman, 'meal.submit', { date: '2026-09-02', breakfast: false, lunch: false, dinner: false }, localTime('2026-09-01', 20)); processScheduledJobs(s, localTime('2026-09-01', 21)); processScheduledJobs(s, localTime('2026-09-01', 22)); processScheduledJobs(s, localTime('2026-09-01', 23));
  assert.equal(s.notifications.filter(n => n.eventKey.startsWith('meal-reminder')).length, 1); assert.deepEqual(s.mealLocks[0].current, { breakfast: 0, lunch: 0, dinner: 0, submitted: 1, missing: 0 });
  assert.throws(() => applyAction(s, woman, 'meal.submit', { date: '2026-09-02', breakfast: true, lunch: true, dinner: true }, localTime('2026-09-01', 23)), /6 PM to 11 PM/);
});
test('missing meals count zero, late emergency approval preserves the original locked snapshot', () => {
  const s = fixture(true); processScheduledJobs(s, localTime('2026-09-01', 23)); assert.equal(s.mealLocks[0].original.missing, 1);
  applyAction(s, woman, 'meal.request', { date: '2026-09-02', breakfast: true, lunch: false, dinner: true, reason: 'Travel cancelled' }, localTime('2026-09-02', 7));
  applyAction(s, owner, 'meal.review', { requestId: s.mealRequests[0].id, decision: 'approve', reason: 'Kitchen confirmed capacity' }, localTime('2026-09-02', 7.5)); assert.equal(s.mealLocks[0].original.breakfast, 0); assert.equal(s.mealLocks[0].current.breakfast, 1); assert.equal(s.mealLocks[0].revision, 2);
});
test('outpass auto approval is a plan and does not excuse daily attendance without departure', () => {
  const s = fixture(true); const o = outpass(s); assert.equal(o.status, 'approved'); assert.equal(o.actualDepartureAt, undefined); processScheduledJobs(s, localTime('2026-09-02', 22)); assert.equal(s.attendance.find(a => a.date === '2026-09-02')?.status, 'not_recorded'); assert.equal(s.notifications.some(n => n.userId === guardian.id && n.eventKey.startsWith('attendance-missing')), false);
});
test('manual departure and return require reasons, preserve raw history, and notify guardian once each', () => {
  const s = fixture(true); const o = outpass(s); const eventAt = '2026-09-02T04:30:00Z';
  assert.throws(() => applyAction(s, owner, 'attendance.record', { residentId: woman.id, type: 'departure', eventAt, outpassId: o.id, reason: '' }, at(eventAt)), /Manual record reason/);
  applyAction(s, owner, 'attendance.record', { residentId: woman.id, type: 'departure', eventAt, outpassId: o.id, reason: 'Scanner unavailable' }, at(eventAt)); processScheduledJobs(s, localTime('2026-09-02', 22)); assert.equal(s.attendance.find(a => a.date === '2026-09-02')?.status, 'away');
  applyAction(s, owner, 'attendance.record', { residentId: woman.id, type: 'return', eventAt: '2026-09-05T13:00:00Z', outpassId: o.id, reason: 'Scanner unavailable' }, at('2026-09-05T13:00:00Z'));
  assert.equal(o.status, 'returned'); assert.equal(s.attendance.find(a => a.date === '2026-09-05')?.status, 'present'); assert.equal(s.deviceEvents.length, 2); assert.equal(s.notifications.filter(n => n.userId === guardian.id).length, 2);
});
test('unapproved extensions do not shift deadlines; cumulative approved cap is 48 hours', () => {
  const s = fixture(true); const o = outpass(s); const original = o.expectedReturnAt;
  applyAction(s, woman, 'outpass.extend', { outpassId: o.id, expectedReturnAt: '2026-09-06T14:30:00Z', reason: 'Visit extended' }, at('2026-09-03T10:00:00Z')); assert.equal(o.expectedReturnAt, original);
  applyAction(s, owner, 'outpass.reviewExtension', { outpassId: o.id, extensionId: o.extensions[0].id, decision: 'approve' }, at('2026-09-03T11:00:00Z')); assert.equal(o.expectedReturnAt, '2026-09-06T14:30:00.000Z');
  const decision = s.notifications.find(n => n.title === 'Outpass extension approved'); assert.match(decision?.body ?? '', /remains 6 Sept? 2026, 8:00 pm\./); assert.doesNotMatch(decision?.body ?? '', /T\d\d:\d\d/);
  assert.throws(() => applyAction(s, woman, 'outpass.extend', { outpassId: o.id, expectedReturnAt: '2026-09-08T14:30:00Z', reason: 'More time' }, at('2026-09-04T10:00:00Z')), /48 hours in total/);
  applyAction(s, woman, 'outpass.extend', { outpassId: o.id, expectedReturnAt: '2026-09-07T14:30:00Z', reason: 'Final day' }, at('2026-09-04T10:00:00Z')); applyAction(s, owner, 'outpass.reviewExtension', { outpassId: o.id, extensionId: o.extensions[1].id, decision: 'approve' }, at('2026-09-04T11:00:00Z')); assert.equal(o.expectedReturnAt, '2026-09-07T14:30:00.000Z');
});
test('no extension, pending extension and rejected extension all alert at approved return plus 24 hours', () => {
  for (const extensionState of ['none', 'pending', 'rejected']) {
    const s = fixture(true); const o = outpass(s); applyAction(s, owner, 'attendance.record', { residentId: woman.id, type: 'departure', eventAt: '2026-09-02T04:30:00Z', outpassId: o.id, reason: 'Scanner failed' }, at('2026-09-02T04:30:00Z'));
    if (extensionState !== 'none') { applyAction(s, woman, 'outpass.extend', { outpassId: o.id, expectedReturnAt: '2026-09-06T14:30:00Z', reason: 'Request' }, at('2026-09-03T10:00:00Z')); if (extensionState === 'rejected') applyAction(s, owner, 'outpass.reviewExtension', { outpassId: o.id, extensionId: o.extensions[0].id, decision: 'reject', reason: 'Please return as planned' }, at('2026-09-03T11:00:00Z')); }
    processScheduledJobs(s, at('2026-09-06T14:29:59Z')); assert.equal(s.notifications.filter(n => n.eventKey.startsWith('outpass-overdue')).length, 0);
    processScheduledJobs(s, at('2026-09-06T14:30:00Z')); processScheduledJobs(s, at('2026-09-07T14:30:00Z')); assert.equal(s.notifications.filter(n => n.eventKey.startsWith('outpass-overdue')).length, 2, `One alert per each of two admins: ${extensionState}`);
  }
});
test('a recorded return before the overdue alert suppresses it', () => {
  const s = fixture(true); const o = outpass(s); applyAction(s, owner, 'attendance.record', { residentId: woman.id, type: 'departure', eventAt: '2026-09-02T04:30:00Z', outpassId: o.id, reason: 'Manual' }, at('2026-09-02T04:30:00Z')); applyAction(s, owner, 'attendance.record', { residentId: woman.id, type: 'return', eventAt: '2026-09-05T14:30:00Z', outpassId: o.id, reason: 'Manual' }, at('2026-09-05T14:30:00Z')); processScheduledJobs(s, at('2026-09-07T14:30:00Z')); assert.equal(s.notifications.some(n => n.eventKey.startsWith('outpass-overdue')), false);
});
test('approved extension moves the alert; a previously sent alert stays in history', () => {
  const s = fixture(true); const o = outpass(s); applyAction(s, owner, 'attendance.record', { residentId: woman.id, type: 'departure', eventAt: '2026-09-02T04:30:00Z', outpassId: o.id, reason: 'Manual' }, at('2026-09-02T04:30:00Z'));
  processScheduledJobs(s, at('2026-09-06T14:30:00Z')); assert.equal(s.notifications.filter(n => n.eventKey.startsWith('outpass-overdue')).length, 2);
  applyAction(s, woman, 'outpass.extend', { outpassId: o.id, expectedReturnAt: '2026-09-07T14:30:00Z', reason: 'Travel delayed' }, at('2026-09-06T15:00:00Z')); applyAction(s, owner, 'outpass.reviewExtension', { outpassId: o.id, extensionId: o.extensions[0].id, decision: 'approve' }, at('2026-09-06T15:10:00Z'));
  processScheduledJobs(s, at('2026-09-07T14:30:00Z')); assert.equal(s.notifications.filter(n => n.eventKey.startsWith('outpass-overdue')).length, 2); processScheduledJobs(s, at('2026-09-08T14:30:00Z')); assert.equal(s.notifications.filter(n => n.eventKey.startsWith('outpass-overdue')).length, 4);
});
test('delayed return before the attendance window reconciles away without inventing a scan', () => {
  const s = fixture(true); const o = outpass(s); applyAction(s, owner, 'attendance.record', { residentId: woman.id, type: 'departure', eventAt: '2026-09-02T04:30:00Z', outpassId: o.id, reason: 'Manual' }, at('2026-09-02T04:30:00Z')); processScheduledJobs(s, localTime('2026-09-05', 23)); assert.equal(s.attendance.find(a => a.date === '2026-09-05')?.status, 'away');
  applyAction(s, owner, 'attendance.record', { residentId: woman.id, type: 'return', eventAt: localTime('2026-09-05', 16).toISOString(), outpassId: o.id, reason: 'Offline scanner reconciliation' }, localTime('2026-09-06', 9)); assert.equal(s.attendance.find(a => a.date === '2026-09-05')?.status, 'not_recorded'); assert.equal(s.deviceEvents.at(-1)?.receivedAt, localTime('2026-09-06', 9).toISOString());
});
test('future outpass full days suppress meals; departure and return days keep choices', () => {
  const s = fixture(true); outpass(s); applyAction(s, woman, 'meal.submit', { date: '2026-09-02', breakfast: true, lunch: false, dinner: false }, localTime('2026-09-01', 19)); assert.equal(s.meals.length, 1);
  assert.throws(() => applyAction(s, woman, 'meal.submit', { date: '2026-09-03', breakfast: true, lunch: true, dinner: true }, localTime('2026-09-02', 19)), /fully covered/);
  applyAction(s, woman, 'meal.submit', { date: '2026-09-05', breakfast: false, lunch: false, dinner: true }, localTime('2026-09-04', 19)); assert.equal(s.meals.length, 2);
});
test('bed transfer keeps the old bed until approval and rejects conflicting approval', () => {
  const s = fixture(true); applyAction(s, woman, 'transfer.request', { bedId: 'bed-102-1', reason: 'Room change' }, start); assert.equal(s.rooms[0].beds[0].status, 'occupied'); assert.equal(s.rooms[1].beds[0].status, 'available');
  applyAction(s, owner, 'transfer.review', { transferId: s.transfers[0].id, decision: 'approve', reason: 'Effective now; same rent' }, start); assert.equal(s.rooms[0].beds[0].status, 'available'); assert.equal(s.rooms[1].beds[0].residentId, woman.id); assert.equal(s.residents[0].bedId, 'bed-102-1'); assert.throws(() => applyAction(s, secondAdmin, 'transfer.review', { transferId: s.transfers[0].id, decision: 'approve', reason: 'Again' }, start), /Pending transfer not found/);
});
test('guardian sees linked attendance/outpasses, but no payment, identity or resident inbox', () => {
  const s = fixture(true); monthly(s); outpass(s); applyAction(s, woman, 'message.send', { body: 'Private resident matter' }, start); applyAction(s, guardian, 'message.send', { body: 'Private guardian matter' }, start);
  const view = snapshotFor(s, guardian, start); assert.equal(view.residents.length, 1); assert.equal(view.bills.length, 0); assert.equal(view.payments.length, 0); assert.equal(view.residents[0].address, ''); assert.equal(view.outpasses.length, 1); assert.equal(view.messages.length, 1); assert.equal(view.messages[0].ownerId, guardian.id);
  const forged = snapshotFor(s, { ...guardian, id: 'intruder', linkedResidentIds: [woman.id] }, start); assert.equal(forged.residents.length, 0); assert.equal(forged.outpasses.length, 0);
});
test('server permissions block guardian extension approval and resident admin mutations', () => {
  const s = fixture(true); for (const action of ['settings.update', 'room.create', 'attendance.record', 'application.review', 'payment.review', 'outpass.reviewExtension', 'notice.publish', 'checkout.record']) assert.throws(() => applyAction(s, woman, action, {}, start), /Administrator access/);
  assert.throws(() => applyAction(s, guardian, 'outpass.create', {}, start), /available to residents/);
});
test('whole-hostel announcement audience and private support tickets stay scoped', () => {
  const s = fixture(true); registerResident(s, other, {}, start);
  applyAction(s, owner, 'notice.publish', { title: 'Guardian note', body: 'For guardians only', audience: 'guardians' }, start); assert.deepEqual(s.notices[0].recipientIds, [guardian.id]); assert.equal(snapshotFor(s, woman).notices.length, 0);
  applyAction(s, woman, 'ticket.create', { category: 'Food', subject: 'Meal issue', description: 'Synthetic issue' }, start); assert.equal(snapshotFor(s, guardian).tickets.length, 0); assert.equal(snapshotFor(s, owner).tickets.length, 1); assert.equal(snapshotFor(s, secondAdmin).tickets.length, 1);
  assert.throws(() => applyAction(s, other, 'ticket.reply', { ticketId: s.tickets[0].id, body: 'Read another resident ticket' }, start), /not found/);
});
test('existing resident import assigns a bed without fabricating paid history', () => {
  const s = fixture(); applyAction(s, owner, 'resident.admitExisting', { residentId: woman.id, bedId: 'bed-101-1', moveInDate: '2026-08-01', openingBalancePaise: 100000, reason: 'Existing occupant imported by owner' }, start); assert.equal(s.residents[0].status, 'active'); assert.equal(s.payments.length, 0); assert.equal(s.bills[0].status, 'unpaid'); assert.equal(s.bills[0].totalPaise, 100000);
  const r = registerResident(s, other, {}, start); assert.throws(() => applyAction(s, owner, 'resident.admitExisting', { residentId: r.id, bedId: 'bed-101-1', moveInDate: '2026-08-01', reason: 'Import' }, start), /not available/);
});
test('scheduler restart skips stale reminders and never duplicates attendance or meal locks', () => {
  const s = fixture(true); processScheduledJobs(s, localTime('2026-09-04', 23.5)); const before = { attendance: s.attendance.length, locks: s.mealLocks.length, notifications: s.notifications.length }; processScheduledJobs(s, localTime('2026-09-04', 23.5)); assert.deepEqual({ attendance: s.attendance.length, locks: s.mealLocks.length, notifications: s.notifications.length }, before); assert.equal(s.notifications.some(n => n.eventKey.startsWith('meal-reminder')), false);
});
test('PostgreSQL transactions serialize approvals, validate uploads without deadlock and keep routine notifications inside the portal', { timeout: 15000 }, async () => {
  process.env.TEST_DATABASE = 'memory';
  await initializeDomain();
  try {
    await ensureResident(woman, { dob: '2000-01-01', address: 'Test', profession: 'Student', guardianName: 'G', guardianPhone: '9999999999' });
    await ensureResident(other, { dob: '2000-01-01', address: 'Test', profession: 'Student', guardianName: 'G', guardianPhone: '9999999999' });
    const state = (await db.query('SELECT data FROM domain_state WHERE id=1')).rows[0].data as DomainState;
    state.settings.monthlyRentPaise = 900000; state.settings.depositPaise = 1200000; state.settings.dailyPenaltyPaise = 5000;
    for (const r of state.residents) { r.synthetic = true; r.documentStatus = 'verified'; }
    await db.query('UPDATE domain_state SET data=$1::jsonb WHERE id=1', [JSON.stringify(state)]);
    const day = businessDate(new Date()); const a = await executeAction(woman, 'application.submit', { bedId: 'bed-101-1', intendedMoveIn: day }); const b = await executeAction(other, 'application.submit', { bedId: 'bed-101-1', intendedMoveIn: day });
    const results = await Promise.allSettled([executeAction(owner, 'application.review', { applicationId: a.applications[0].id, decision: 'approve' }), executeAction(secondAdmin, 'application.review', { applicationId: b.applications[0].id, decision: 'approve' })]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(results.filter(r => r.status === 'rejected').length, 1);
    const final = await getSnapshot(owner); assert.equal(final.applications.filter(a => a.status === 'approved').length, 1); assert.equal(final.applications.filter(a => a.status === 'submitted').length, 1); assert.equal(final.bills.length, 1);
    const bill = final.bills[0]; const payingUser = bill.residentId === woman.id ? woman : other;
    await db.query('INSERT INTO accounts(id,role,name,email,phone,email_verified,phone_verified) VALUES($1,$2,$3,$4,$5,TRUE,TRUE)', [payingUser.id, 'resident', payingUser.name, payingUser.email, payingUser.phone]);
    await db.query('INSERT INTO uploads(id,owner_id,purpose,name,mime,bytes,digest,scan_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', ['synthetic-proof-id', payingUser.id, 'payment', 'synthetic.pdf', 'application/pdf', 100, 'synthetic-digest', 'clean']);
    const paymentSnapshot = await executeAction(payingUser, 'payment.submit', { billId: bill.id, amountPaise: bill.totalPaise, paidOn: day, reference: 'TEST-TRANSACTION', method: 'UPI', proofId: 'synthetic-proof-id' });
    assert.equal(paymentSnapshot.payments[0].status, 'submitted');
    const reviews = await Promise.allSettled([executeAction(owner, 'payment.review', { paymentId: paymentSnapshot.payments[0].id, decision: 'verify' }), executeAction(secondAdmin, 'payment.review', { paymentId: paymentSnapshot.payments[0].id, decision: 'verify' })]); assert.equal(reviews.filter(r => r.status === 'fulfilled').length, 1);
    const notifications = (await db.query('SELECT data FROM domain_state WHERE id=1')).rows[0].data.notifications;
    assert.ok(notifications.length > 0);
    assert.ok(notifications.every((n: { channel: string; delivery: string }) => n.channel === 'website' && n.delivery === 'visible'));
  } finally { await db.close(); }
});

test('non-veg choice is kept only on non-veg days, and admins can change those days', () => {
  const s = fixture(true);
  // Non-veg is available every day by default. 2026-09-02 is a Wednesday.
  applyAction(s, woman, 'meal.submit', { date: '2026-09-02', breakfast: true, lunch: true, dinner: true, nonVeg: true }, localTime('2026-09-01', 19));
  assert.equal(s.meals.find(m => m.date === '2026-09-02')?.nonVeg, true);
  // Admin limits non-veg to Wednesday only; a Thursday non-veg request is then stored as veg.
  applyAction(s, owner, 'settings.update', { food: { ...s.settings.food, nonVegDays: [3] } }, localTime('2026-09-01', 20));
  applyAction(s, woman, 'meal.submit', { date: '2026-09-03', breakfast: true, lunch: true, dinner: true, nonVeg: true }, localTime('2026-09-02', 19));
  assert.equal(s.meals.find(m => m.date === '2026-09-03')?.nonVeg, false);
  // Admin moves non-veg to Thursday only; the next Thursday form keeps the non-veg choice.
  applyAction(s, owner, 'settings.update', { food: { ...s.settings.food, nonVegDays: [4] } }, localTime('2026-09-09', 10));
  assert.deepEqual(s.settings.food.nonVegDays, [4]);
  applyAction(s, woman, 'meal.submit', { date: '2026-09-10', breakfast: false, lunch: true, dinner: false, nonVeg: true }, localTime('2026-09-09', 19));
  assert.equal(s.meals.find(m => m.date === '2026-09-10')?.nonVeg, true);
  assert.throws(() => applyAction(s, owner, 'settings.update', { food: { ...s.settings.food, nonVegDays: [9] } }, localTime('2026-09-09', 10)), /valid non-veg days/);
});

test('late returns: up to 12 midnight, two per month, guardian told, 10 PM alert waits', () => {
  const s = fixture(true); const noon = localTime('2026-09-01', 12);
  assert.throws(() => applyAction(s, woman, 'late.request', { date: '2026-09-01', returnBy: '00:30', reason: 'Event' }, noon), /12 midnight/);
  applyAction(s, woman, 'late.request', { date: '2026-09-01', returnBy: '24:00', reason: 'College event' }, noon);
  assert.ok(s.notifications.some(n => n.userId === guardian.id && n.title === 'Late return planned'));
  assert.throws(() => applyAction(s, woman, 'late.request', { date: '2026-09-01', returnBy: '23:00', reason: 'Again' }, noon), /already have/);
  applyAction(s, woman, 'late.request', { date: '2026-09-02', returnBy: '23:00', reason: 'Dinner' }, noon);
  assert.throws(() => applyAction(s, woman, 'late.request', { date: '2026-09-03', returnBy: '23:00', reason: 'Third' }, localTime('2026-09-02', 12)), /both late returns/);
  // At 10 PM there is no "attendance not recorded" alert for a planned late return; after midnight there is a missed-return alert.
  processScheduledJobs(s, localTime('2026-09-01', 22.5));
  assert.equal(s.notifications.filter(n => n.eventKey.startsWith('attendance-missing') && n.eventKey.endsWith('2026-09-01')).length, 0);
  processScheduledJobs(s, localTime('2026-09-02', 0.1));
  assert.ok(s.notifications.some(n => n.title === 'Late return not recorded'));
  // A new month gives two more.
  applyAction(s, woman, 'late.request', { date: '2026-10-01', returnBy: '23:30', reason: 'New month' }, localTime('2026-10-01', 12));
});

test('laundry, visitors, waitlist and permissions', () => {
  const s = fixture(true); const t = localTime('2026-09-01', 9);
  applyAction(s, woman, 'laundry.book', { date: '2026-09-01', hour: 10 }, t);
  assert.throws(() => applyAction(s, woman, 'laundry.book', { date: '2026-09-01', hour: 12 }, t), /already have/);
  applyAction(s, owner, 'laundry.settings', { machines: 1 }, t); registerResident(s, other, {}, t).status = 'active';
  assert.throws(() => applyAction(s, other, 'laundry.book', { date: '2026-09-01', hour: 10 }, t), /All machines/);
  applyAction(s, woman, 'visitor.register', { name: 'Aunt', phone: '+919000000099', relation: 'Aunt', date: '2026-09-01', expectedAt: '17:00' }, t);
  applyAction(s, owner, 'visitor.mark', { visitorId: s.extras.visitors[0].id, status: 'arrived' }, t); assert.equal(s.extras.visitors[0].status, 'arrived');
  assert.throws(() => applyAction(s, woman, 'expense.add', { date: '2026-09-01', category: 'Electricity', amountPaise: 100 }, t), /Administrator/);
  // Other residents' laundry bookings are shown without names; guardians see none.
  const view = snapshotFor(s, other, t); assert.equal(view.extras.laundry[0].residentId, '');
  assert.equal(snapshotFor(s, guardian, t).extras.laundry.length, 0); assert.equal(snapshotFor(s, guardian, t).extras.visitors.length, 1);
  // Waitlist: an applicant is told when a matching bed is free.
  const applicant = registerResident(s, { ...other, id: 'applicant', email: 'applicant@example.test' }, {}, t);
  applyAction(s, { ...other, id: 'applicant' }, 'waitlist.join', { sharing: 3 }, t); processScheduledJobs(s, t);
  assert.equal(s.extras.waitlist[0].status, 'notified'); assert.ok(s.notifications.some(n => n.userId === applicant.userId && n.title === 'A bed is available'));
});

test('maintenance, document expiry reminders and the weekly guardian email', () => {
  const s = fixture(true); const t = localTime('2026-09-06', 20); // a Sunday evening
  applyAction(s, owner, 'maintenance.add', { title: 'AC servicing', everyDays: 120, nextDue: '2026-09-06', notes: '' }, t);
  applyAction(s, owner, 'expiry.set', { residentId: woman.id, kind: 'Police verification', expiresOn: '2026-09-10' }, t);
  processScheduledJobs(s, t);
  assert.ok(s.notifications.some(n => n.title === 'Maintenance due today'));
  assert.ok(s.notifications.some(n => n.userId === woman.id && n.title === 'Document expiring soon'));
  assert.equal(s.extras.outbox.filter(e => e.kind === 'guardian.weekly' && e.to === guardian.email).length, 1);
  processScheduledJobs(s, localTime('2026-09-06', 21)); assert.equal(s.extras.outbox.filter(e => e.kind === 'guardian.weekly').length, 1, 'one email per week');
  applyAction(s, owner, 'maintenance.done', { taskId: s.extras.maintenance[0].id }, t); assert.equal(s.extras.maintenance[0].nextDue, '2027-01-04');
});

test('resident feedback is private to admins; menu is visible to residents', () => {
  const s = fixture(true); const t = localTime('2026-09-01', 12);
  applyAction(s, owner, 'menu.update', { weekday: 3, breakfast: 'Idli', lunch: 'Rice', dinner: 'Chapati', nonVegLunch: 'Chicken curry', nonVegDinner: '' }, t);
  assert.equal(snapshotFor(s, woman, t).extras.weeklyMenu['3'].nonVegLunch, 'Chicken curry');
  applyAction(s, woman, 'review.submit', { rating: 5, text: 'Lovely place' }, t); assert.equal(s.extras.reviews[0].displayName, 'Resident O.');
  assert.ok(s.notifications.some(n => n.userId === owner.id && n.title === 'New resident feedback'));
  assert.equal(snapshotFor(s, owner, t).extras.reviews.length, 1); assert.equal(snapshotFor(s, guardian, t).extras.reviews.length, 0);
});

test('admission form: Aadhaar stored masked, answers required, options checked', () => {
  const s = createInitialState(start); const form = { maritalStatus: 'single', nationality: 'Indian', idType: 'aadhaar', idNumber: '1234 5678 9012', currentAddress: 'Hostel road', city: 'Bengaluru', state: 'Karnataka', pincode: '560034', designation: 'Engineer', officeAddress: '', officeContact: '', monthlyIncome: '35,000', emergencyName: 'Uncle', emergencyRelationship: 'Uncle', emergencyPhone: '+919000000077', emergencyAddress: 'Town', acPreference: 'ac', roomType: 'four', stayDuration: '6_plus_months', foodType: 'non_veg', parking: 'bike' };
  const r = registerResident(s, woman, { dob: '2000-09-01', admission: form }, start);
  assert.equal(r.admission?.idNumber, 'XXXX XXXX 9012'); assert.equal(r.admission?.monthlyIncome, '35000'); assert.ok(!JSON.stringify(s).includes('123456789012'));
  assert.throws(() => registerResident(createInitialState(start), woman, { admission: { ...form, roomType: 'single' } }, start), /room type/);
  assert.throws(() => registerResident(createInitialState(start), woman, { admission: { ...form, idNumber: '1234' } }, start), /12-digit Aadhaar/);
  assert.throws(() => registerResident(createInitialState(start), woman, { admission: { ...form, pincode: '' } }, start), /PIN code/);
  assert.equal(snapshotFor(s, guardian, start).residents.length, 0);
});

test('PhonePe: completed payment settles the bill once; failures, mismatches and double payments are handled', async () => {
  const { applyGatewayResult } = await import('../server/domain');
  const s = fixture(true); const t = localTime('2026-09-02', 10);
  const bill = s.bills.find(b => b.residentId === woman.id) ?? (processScheduledJobs(s, localTime('2026-10-01', 10)), s.bills.find(b => b.residentId === woman.id))!;
  const order = (id: string, amount = bill.totalPaise - bill.paidPaise) => { s.extras.gatewayOrders.push({ id, billId: bill.id, residentId: woman.id, amountPaise: amount, state: 'PENDING', createdAt: t.toISOString(), updatedAt: t.toISOString() }); };
  const ok = (amount: number) => ({ state: 'COMPLETED' as const, amountPaise: amount, orderId: 'OMO1', transactionId: 'TXN1', paymentMode: 'UPI_INTENT' });
  order('A1', 50); assert.equal(applyGatewayResult(s, 'A1', ok(40), t), 'COMPLETED');
  assert.equal(s.payments.at(-1)!.status, 'submitted', 'amount mismatch is left for an admin'); assert.ok(s.notifications.some(n => n.title === 'PhonePe payment needs a look'));
  bill.status = 'unpaid'; s.payments.pop();
  order('F1'); assert.equal(applyGatewayResult(s, 'F1', { state: 'FAILED', amountPaise: 0, orderId: '', transactionId: '', paymentMode: '' }, t), 'FAILED'); assert.equal(bill.status, 'unpaid');
  order('C1'); const due = bill.totalPaise - bill.paidPaise; assert.equal(applyGatewayResult(s, 'C1', ok(due), t), 'COMPLETED');
  assert.equal(bill.status, 'paid'); const paid = s.payments.at(-1)!; assert.equal(paid.status, 'verified'); assert.equal(paid.method, 'PhonePe'); assert.equal(paid.reference, 'TXN1');
  const count = s.payments.length; applyGatewayResult(s, 'C1', ok(due), t); assert.equal(s.payments.length, count, 'duplicate webhook changes nothing');
  order('D1', due); applyGatewayResult(s, 'D1', ok(due), t); assert.ok(s.notifications.some(n => n.title === 'PhonePe payment needs a look' && n.body.includes('already paid')));
});

test('PhonePe webhook password check', async () => {
  const { webhookAuthorised } = await import('../server/phonepe'); const { createHash } = await import('node:crypto');
  process.env.PHONEPE_WEBHOOK_USERNAME = 'ryuu'; process.env.PHONEPE_WEBHOOK_PASSWORD = 'secret123';
  const good = createHash('sha256').update('ryuu:secret123').digest('hex');
  assert.equal(webhookAuthorised(good), true); assert.equal(webhookAuthorised('SHA256 ' + good.toUpperCase()), true);
  assert.equal(webhookAuthorised(createHash('sha256').update('ryuu:wrong').digest('hex')), false); assert.equal(webhookAuthorised(null), false);
  delete process.env.PHONEPE_WEBHOOK_USERNAME; delete process.env.PHONEPE_WEBHOOK_PASSWORD; assert.equal(webhookAuthorised(good), false);
});

test('admin email: right recipients, guardians optional, no duplicates, admins only', () => {
  const s = fixture(true); const t = localTime('2026-09-02', 10); s.actors[guardian.id] = guardian;
  const applicant = registerResident(s, other, {}, t); applicant.guardianUserId = guardian.id; // two residents share one guardian
  applyAction(s, owner, 'email.send', { audience: 'active', subject: 'Water break', body: 'No water 10-12 on Sunday.', includeGuardians: true }, t);
  const sent = s.extras.sentEmails[0]; assert.deepEqual(sent.recipients.map(r => r.email).sort(), [guardian.email, woman.email].sort());
  assert.equal(s.extras.outbox.filter(e => e.batchId === sent.id).length, 2); assert.match(s.extras.outbox[0].text, /^Hello Resident,/);
  applyAction(s, owner, 'email.send', { audience: 'all', subject: 'Hi', body: 'All', includeGuardians: true }, t);
  assert.equal(s.extras.sentEmails[1].recipients.length, 3, 'shared guardian gets one copy');
  applyAction(s, owner, 'email.send', { audience: 'selected', residentIds: [applicant.id], subject: 'Docs', body: 'Please upload documents.' }, t);
  assert.deepEqual(s.extras.sentEmails[2].recipients.map(r => r.email), [other.email]);
  assert.throws(() => applyAction(s, owner, 'email.send', { audience: 'selected', residentIds: [], subject: 'x', body: 'y' }, t), /No residents match/);
  assert.throws(() => applyAction(s, woman, 'email.send', { audience: 'active', subject: 'x', body: 'y' }, t), /Administrator/);
  assert.equal(snapshotFor(s, woman, t).extras.sentEmails.length, 0); assert.equal(snapshotFor(s, woman, t).extras.outbox.length, 0);
});

test('residents without an admission form can fill it in later; editing keeps the masked Aadhaar and documents', () => {
  const s = fixture(true); const t = localTime('2026-09-02', 10);
  const form = { maritalStatus: 'single', nationality: 'Indian', idType: 'aadhaar', idNumber: '987654321098', currentAddress: 'Room 101', city: 'Bengaluru', state: 'Karnataka', pincode: '560034', designation: 'B.Com 2nd year', emergencyName: 'Aunt', emergencyRelationship: 'Aunt', emergencyPhone: '+919000000088', emergencyAddress: 'Town', acPreference: 'non_ac', roomType: 'triple', stayDuration: '6_plus_months', foodType: 'veg', parking: 'none' };
  applyAction(s, woman, 'admission.submit', form, t); const r = s.residents[0];
  assert.equal(r.admission?.idNumber, 'XXXX XXXX 1098'); r.admission!.photoDocumentId = 'photo-1';
  applyAction(s, woman, 'admission.submit', { ...form, idNumber: 'XXXX XXXX 1098', city: 'Tiruppur' }, t);
  assert.equal(r.admission?.idNumber, 'XXXX XXXX 1098'); assert.equal(r.admission?.city, 'Tiruppur'); assert.equal(r.admission?.photoDocumentId, 'photo-1');
  assert.throws(() => applyAction(s, woman, 'admission.submit', { ...form, idNumber: 'XXXX XXXX 0000' }, t), /12-digit Aadhaar/);
  assert.throws(() => applyAction(s, guardian, 'admission.submit', form, t), /residents/);
});
