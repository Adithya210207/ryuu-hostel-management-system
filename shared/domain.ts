/** The portal API contract. Money is integer paise; timestamps are ISO UTC. */
import type { Extras } from './extras';
export type Role = 'admin' | 'resident' | 'guardian';
export interface DomainUser { id: string; role: Role; name: string; email: string; phone: string; residentId?: string; linkedResidentIds?: string[]; emailVerified?: boolean; phoneVerified?: boolean; profile?: {dob:string;profession:string;address:string;organization:string;emergencyContact:string} }
export type ISODate = string;
/** Answers from the admission form, collected at sign-up. Aadhaar numbers are stored masked (last 4 digits only). */
export interface AdmissionDetails {
  maritalStatus: 'single' | 'married'; nationality: string; idType: 'aadhaar' | 'passport' | 'voter_id'; idNumber: string;
  currentAddress: string; city: string; state: string; pincode: string;
  designation: string; officeAddress: string; officeContact: string; monthlyIncome: string;
  emergencyName: string; emergencyRelationship: string; emergencyPhone: string; emergencyAddress: string;
  acPreference: 'ac' | 'non_ac' | 'either'; roomType: 'double' | 'triple' | 'four' | 'five'; stayDuration: 'below_1_month' | '1_3_months' | '3_6_months' | '6_plus_months';
  foodType: 'veg' | 'non_veg'; parking: 'none' | 'bike' | 'car' | 'both'; declaredAt: string;
  photoDocumentId?: string; employmentProofId?: string; addressProofId?: string; medicalCertificateId?: string;
}
export interface Resident {
  id: string; userId: string; residentNumber: string; name: string; email: string; phone: string;
  dob: string; address: string; profession: string; organization: string; intendedMoveIn: string;
  guardianName: string; guardianPhone: string; guardianEmail: string; guardianDob: string; guardianProfession: string; guardianRelationship: string; guardianUserId?: string;
  emergencyContact?: string; identityDocumentId?: string; guardianDocumentId?: string;
  documentStatus: 'pending' | 'verified' | 'rejected'; documentReason?: string;
  status: 'applicant' | 'booked' | 'active' | 'checked_out'; bedId?: string; moveInDate?: string;
  createdAt: string; updatedAt: string; synthetic?: boolean;
  admission?: AdmissionDetails;
  /** Admin view only: whether the resident has confirmed their contacts. */ emailVerified?: boolean; phoneVerified?: boolean;
}
export interface Bed { id: string; label: string; status: 'available' | 'reserved' | 'occupied' | 'maintenance'; residentId?: string }
export interface Room { id: string; label: string; floor: string; sharing: number; rentPaise: number | null; ac: boolean; bathroom: boolean; beds: Bed[]; synthetic: boolean }
export interface Application { id: string; residentId: string; bedId: string; intendedMoveIn: string; status: 'submitted' | 'approved' | 'rejected' | 'expired' | 'confirmed'; submittedAt: string; decidedAt?: string; decidedBy?: string; reason?: string; paymentDeadline?: string; billId?: string }
export interface BillLine { id: string; kind: 'rent' | 'deposit' | 'food' | 'penalty' | 'adjustment'; description: string; amountPaise: number; date?: string; createdAt: string }
export interface Bill { id: string; residentId: string; period: string; kind: 'admission' | 'monthly' | 'adjustment'; status: 'unpaid' | 'pending' | 'paid' | 'cancelled'; lines: BillLine[]; totalPaise: number; paidPaise: number; dailyPenaltyPaise: number; dueAt: string; createdAt: string; settledAt?: string; foodPolicy: FoodPolicy; penaltyThrough?: string }
export interface Payment { id: string; billId: string; residentId: string; amountPaise: number; paidOn: string; reference: string; method: string; proofId: string; status: 'submitted' | 'verified' | 'rejected'; submittedAt: string; reviewedAt?: string; reviewedBy?: string; reason?: string; duplicateReference: boolean }
export interface MealChoice { breakfast: boolean; lunch: boolean; dinner: boolean; /** Only used on non-veg days. */ nonVeg?: boolean }
export interface Meal extends MealChoice { id: string; residentId: string; date: string; submittedAt: string; updatedAt: string; source: 'resident' | 'admin' | 'outpass'; foodPolicy: FoodPolicy }
export interface MealLock { date: string; lockedAt: string; original: MealChoiceCounts; current: MealChoiceCounts; revision: number }
export interface MealChoiceCounts { breakfast: number; lunch: number; dinner: number; submitted: number; missing: number }
export interface MealRequest extends MealChoice { id: string; residentId: string; date: string; reason: string; status: 'pending' | 'approved' | 'rejected'; requestedAt: string; reviewedAt?: string; reviewedBy?: string; decisionReason?: string }
export interface Extension { id: string; requestedReturnAt: string; reason: string; status: 'pending' | 'approved' | 'rejected'; requestedAt: string; reviewedAt?: string; reviewedBy?: string; decisionReason?: string }
export interface Outpass { id: string; residentId: string; departureAt: string; originalReturnAt: string; expectedReturnAt: string; destination: string; reason: string; contact: string; status: 'approved' | 'away' | 'returned' | 'cancelled'; createdAt: string; actualDepartureAt?: string; actualReturnAt?: string; extensions: Extension[]; overdueNotifiedFor?: string }
export interface Attendance { id: string; residentId: string; date: string; status: 'present' | 'away' | 'not_recorded'; recordedAt?: string; source: 'manual' | 'device' | 'scheduler' | 'return'; reason?: string; eventId?: string }
export interface DeviceEvent { id: string; residentId: string; type: 'attendance' | 'departure' | 'return'; eventAt: string; receivedAt: string; source: 'manual' | 'device' | 'simulator'; reason: string; actorId: string; outpassId?: string }
export interface Transfer { id: string; residentId: string; fromBedId: string; toBedId: string; reason: string; status: 'pending' | 'approved' | 'rejected'; requestedAt: string; reviewedAt?: string; reviewedBy?: string; decisionReason?: string }
export interface Message { id: string; ownerId: string; senderId: string; senderName: string; senderRole: Role; body: string; attachmentId?: string; createdAt: string; readBy: string[] }
export interface TicketReply { id: string; senderId: string; senderName: string; body: string; createdAt: string }
export interface Ticket { id: string; number: string; ownerId: string; ownerName: string; category: string; subject: string; description: string; priority: 'normal' | 'urgent'; attachmentId?: string; status: 'open' | 'in_progress' | 'resolved' | 'closed'; assignedTo?: string; replies: TicketReply[]; createdAt: string; updatedAt: string }
export interface Notice { id: string; title: string; body: string; audience: 'residents' | 'guardians' | 'both'; authorId: string; authorName: string; createdAt: string; recipientIds: string[] }
export interface Notification { id: string; userId: string; title: string; body: string; link: string; eventKey: string; createdAt: string; readAt?: string; delivery: 'visible' | 'cancelled' | 'not_configured' | 'queued' | 'sent' | 'failed'; channel: 'website' | 'whatsapp'; attempts: number; nextAttemptAt?: string; deliveryError?: string }
export interface AuditEvent { id: string; actorId: string; actorName: string; action: string; subjectId: string; details: string; createdAt: string }
export interface Checkout { id: string; residentId: string; date: string; reason: string; depositPaise: number; deductionsPaise: number; deductionReason: string; refundPaise: number; refundStatus: 'pending' | 'recorded'; refundReference?: string; createdAt: string; createdBy: string }
export interface FoodPolicy { mode: 'not_configured' | 'included' | 'monthly' | 'per_meal'; monthlyPaise: number; breakfastPaise: number; lunchPaise: number; dinnerPaise: number; /** Weekdays (0 = Sunday … 6 = Saturday) when residents may choose non-veg. */ nonVegDays?: number[] }
export const DEFAULT_NON_VEG_DAYS = [0, 1, 2, 3, 4, 5, 6];
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function nonVegDays(food: Pick<FoodPolicy, 'nonVegDays'>): number[] { return Array.isArray(food.nonVegDays) ? food.nonVegDays : DEFAULT_NON_VEG_DAYS; }
/** True when the given YYYY-MM-DD date falls on one of the configured non-veg weekdays. */
export function isNonVegDay(food: Pick<FoodPolicy, 'nonVegDays'>, day: string): boolean { return nonVegDays(food).includes(new Date(`${day}T00:00:00Z`).getUTCDay()); }
export interface Settings {
  hostelName: string; address: string; phone: string; email: string; openingDate: string;
  monthlyRentPaise: number | null; depositPaise: number | null; dailyPenaltyPaise: number | null;
  food: FoodPolicy; paymentUpi: string; bankName: string; accountName: string; accountNumber: string; ifsc: string; qrDocumentId: string;
  checkoutNoticeDays: number | null; identityPolicy: 'pending_review' | 'aadhaar_required' | 'alternative_id';
  monthlyReminderDays: number[]; ticketCategories: string[]; syntheticInventory: boolean;
}
export interface Snapshot {
  user: DomainUser; settings: Settings; residents: Resident[]; rooms: Room[]; applications: Application[];
  bills: Bill[]; payments: Payment[]; meals: Meal[]; mealLocks: MealLock[]; mealRequests: MealRequest[];
  outpasses: Outpass[]; attendance: Attendance[]; deviceEvents: DeviceEvent[]; transfers: Transfer[];
  messages: Message[]; tickets: Ticket[]; notices: Notice[]; notifications: Notification[];
  audit: AuditEvent[]; checkoutRecords: Checkout[]; extras: Extras;
  meta: { now: string; businessDate: string; tomorrow: string; timezone: 'Asia/Kolkata'; mealWindowOpen: boolean; attendanceWindowOpen: boolean; workerLastRun?: string; revision: number; demo: boolean; integrations: { biometrics: 'not_configured'; email: 'not_configured' | 'configured' }; phonepe?: 'off' | 'simulated' | 'sandbox' | 'production' };
}

/** POST /api/portal { action, input }. Errors are 4xx with a readable message. */
export interface DomainActionInput {
  'profile.update': Partial<Pick<Resident, 'name' | 'dob' | 'address' | 'profession' | 'organization' | 'intendedMoveIn' | 'guardianName' | 'guardianPhone' | 'guardianEmail' | 'guardianDob' | 'guardianProfession' | 'guardianRelationship' | 'emergencyContact' | 'identityDocumentId' | 'guardianDocumentId'>> & { photoDocumentId?: string; employmentProofId?: string; addressProofId?: string; medicalCertificateId?: string };
  'application.submit': { bedId: string; intendedMoveIn: string };
  'application.review': { applicationId: string; decision: 'approve' | 'reject'; reason?: string };
  'resident.checkin': { residentId: string; date: string; reason?: string };
  'resident.admitExisting': { residentId: string; bedId: string; moveInDate: string; openingBalancePaise?: number; reason: string };
  'document.review': { residentId: string; decision: 'verify' | 'reject'; reason?: string };
  'payment.submit': { billId: string; amountPaise: number; paidOn: string; reference: string; method: string; proofId: string };
  'payment.review': { paymentId: string; decision: 'verify' | 'reject'; reason?: string };
  'bill.adjust': { billId: string; amountPaise: number; reason: string };
  'meal.submit': { date: string; breakfast: boolean; lunch: boolean; dinner: boolean; nonVeg?: boolean };
  'meal.request': { date: string; breakfast: boolean; lunch: boolean; dinner: boolean; nonVeg?: boolean; reason: string };
  'meal.review': { requestId: string; decision: 'approve' | 'reject'; reason: string };
  'outpass.create': { departureAt: string; expectedReturnAt: string; destination: string; reason: string; contact: string };
  'outpass.cancel': { outpassId: string };
  'outpass.extend': { outpassId: string; expectedReturnAt: string; reason: string };
  'outpass.reviewExtension': { outpassId: string; extensionId: string; decision: 'approve' | 'reject'; reason?: string };
  'attendance.record': { residentId: string; type: 'attendance' | 'departure' | 'return'; eventAt: string; reason: string; outpassId?: string };
  'attendance.escalate': { residentId: string; date: string; reason: string };
  'transfer.request': { bedId: string; reason: string };
  'transfer.review': { transferId: string; decision: 'approve' | 'reject'; reason: string };
  'checkout.record': { residentId: string; date: string; reason: string; deductionsPaise: number; deductionReason: string };
  'checkout.refund': { checkoutId: string; reference: string; reason: string };
  'message.send': { ownerId?: string; body: string; attachmentId?: string };
  'message.read': { ownerId?: string };
  'ticket.create': { category: string; subject: string; description: string; priority?: 'normal' | 'urgent'; attachmentId?: string };
  'ticket.reply': { ticketId: string; body: string };
  'ticket.update': { ticketId: string; status: 'open' | 'in_progress' | 'resolved' | 'closed'; assignedTo?: string };
  'notice.publish': { title: string; body: string; audience: 'residents' | 'guardians' | 'both' };
  'notification.read': { notificationId?: string };
  'settings.update': Partial<Settings>;
  'room.create': { label: string; floor: string; sharing: number; rentPaise?: number | null; ac?: boolean; bathroom?: boolean };
  'room.update': { roomId: string; label?: string; floor?: string; rentPaise?: number | null; ac?: boolean };
  'bed.status': { bedId: string; status: 'available' | 'maintenance' };
  'jobs.run': Record<string, never>;
  // Feature batch (server/extras.ts validates these inputs)
  'menu.update': Record<string, unknown>;
  'feedback.submit': Record<string, unknown>;
  'laundry.book': Record<string, unknown>;
  'laundry.cancel': Record<string, unknown>;
  'laundry.settings': Record<string, unknown>;
  'visitor.register': Record<string, unknown>;
  'visitor.cancel': Record<string, unknown>;
  'visitor.mark': Record<string, unknown>;
  'late.request': Record<string, unknown>;
  'late.cancel': Record<string, unknown>;
  'expense.add': Record<string, unknown>;
  'expense.remove': Record<string, unknown>;
  'maintenance.add': Record<string, unknown>;
  'maintenance.done': Record<string, unknown>;
  'maintenance.remove': Record<string, unknown>;
  'waitlist.join': Record<string, unknown>;
  'waitlist.leave': Record<string, unknown>;
  'waitlist.remove': Record<string, unknown>;
  'expiry.set': Record<string, unknown>;
  'expiry.remove': Record<string, unknown>;
  'visit.update': Record<string, unknown>;
  'review.submit': Record<string, unknown>;
  'email.send': Record<string, unknown>;
  'admission.submit': Record<string, unknown>;
}
export type DomainAction = keyof DomainActionInput;
