/** Types for the November 2026 feature batch: menu, feedback, laundry, visitors, late returns,
 *  finances, maintenance, waitlist, document expiry, visit requests, reviews and the email outbox. */
export type MealName = 'breakfast' | 'lunch' | 'dinner';
export interface MenuDay { breakfast: string; lunch: string; dinner: string; nonVegLunch: string; nonVegDinner: string }
export interface MealFeedback { id: string; residentId: string; date: string; meal: MealName; liked: boolean; comment: string; createdAt: string }
export interface LaundryBooking { id: string; residentId: string; date: string; hour: number; machine: number; status: 'booked' | 'cancelled'; createdAt: string }
export interface Visitor { id: string; residentId: string; name: string; phone: string; relation: string; date: string; expectedAt: string; status: 'expected' | 'arrived' | 'left' | 'cancelled'; arrivedAt?: string; leftAt?: string; createdAt: string }
export interface LateArrival { id: string; residentId: string; date: string; returnBy: string; reason: string; status: 'approved' | 'cancelled'; createdAt: string; missedNotified?: boolean }
export interface Expense { id: string; date: string; category: string; amountPaise: number; note: string; createdAt: string; createdBy: string }
export interface MaintenanceTask { id: string; title: string; everyDays: number; nextDue: string; lastDone?: string; notes: string; createdAt: string }
export interface WaitlistEntry { id: string; residentId: string; sharing: number; status: 'waiting' | 'notified' | 'removed'; createdAt: string; notifiedAt?: string }
export interface DocumentExpiry { id: string; residentId: string; kind: string; expiresOn: string; createdAt: string }
export interface VisitRequest { id: string; name: string; phone: string; email: string; preferredDate: string; preferredTime: string; message: string; status: 'new' | 'confirmed' | 'done' | 'cancelled'; createdAt: string }
export interface Review { id: string; residentId: string; displayName: string; rating: number; text: string; status: 'pending' | 'approved' | 'hidden'; createdAt: string }
/** One PhonePe checkout attempt for a bill. */
export interface GatewayOrder { id: string; billId: string; residentId: string; amountPaise: number; state: 'CREATED' | 'PENDING' | 'COMPLETED' | 'FAILED'; phonepeOrderId?: string; transactionId?: string; paymentMode?: string; paymentId?: string; error?: string; createdAt: string; updatedAt: string }
/** An email an admin sent from the portal (one entry per send, however many recipients). */
export interface SentEmail { id: string; subject: string; body: string; audience: 'active' | 'selected' | 'applicants' | 'all'; includeGuardians: boolean; recipients: { userId: string; name: string; email: string; role: 'resident' | 'guardian' }[]; sentBy: string; createdAt: string }
export interface OutboxEmail { id: string; userId: string; to: string; subject: string; text: string; kind: string; batchId?: string; status: 'queued' | 'sent' | 'simulated' | 'failed'; createdAt: string; sentAt?: string; error?: string }
export interface Extras {
  weeklyMenu: Record<string, MenuDay>; mealFeedback: MealFeedback[];
  laundryMachines: number; laundry: LaundryBooking[];
  visitors: Visitor[]; lateArrivals: LateArrival[];
  expenses: Expense[]; maintenance: MaintenanceTask[];
  waitlist: WaitlistEntry[]; documentExpiries: DocumentExpiry[];
  visitRequests: VisitRequest[]; reviews: Review[];
  outbox: OutboxEmail[]; guardianSummaries: Record<string, string>; gatewayOrders: GatewayOrder[]; sentEmails: SentEmail[];
}

/** Late arrivals: two per calendar month, return no later than 12 midnight. */
export const LATE_ARRIVALS_PER_MONTH = 2;
export const LATE_RETURN_TIMES = ['22:30', '23:00', '23:30', '24:00'];
export const LAUNDRY_HOURS = Array.from({ length: 16 }, (_, i) => i + 6); // 6 AM … 9 PM starts
export const EXPENSE_CATEGORIES = ['Groceries & food', 'Staff salaries', 'Electricity', 'Water', 'Maintenance & repairs', 'Internet', 'Cleaning supplies', 'Other'];
export const DOCUMENT_KINDS = ['Identity proof', 'Police verification', 'Guardian identity proof', 'College / employer letter', 'Other'];
export function emptyExtras(): Extras {
  return { weeklyMenu: {}, mealFeedback: [], laundryMachines: 2, laundry: [], visitors: [], lateArrivals: [], expenses: [], maintenance: [], waitlist: [], documentExpiries: [], visitRequests: [], reviews: [], outbox: [], guardianSummaries: {}, gatewayOrders: [], sentEmails: [] };
}
export function timeLabel(hhmm: string): string { if (hhmm === '24:00') return '12:00 AM (midnight)'; const [h, m] = hhmm.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; }
export function hourLabel(hour: number): string { return `${((hour + 11) % 12) + 1} ${hour >= 12 ? 'PM' : 'AM'}`; }
