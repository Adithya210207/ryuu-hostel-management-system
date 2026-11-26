// Admission-form answers collected at sign-up (matches the printed Ryuu admission form).
import type { AdmissionDetails } from '../shared/domain';

export const ADMISSION_OPTIONS = {
  maritalStatus: ['single', 'married'],
  idType: ['aadhaar', 'passport', 'voter_id'],
  acPreference: ['ac', 'non_ac', 'either'],
  roomType: ['double', 'triple', 'four', 'five'],
  stayDuration: ['below_1_month', '1_3_months', '3_6_months', '6_plus_months'],
  foodType: ['veg', 'non_veg'],
  parking: ['none', 'bike', 'car', 'both'],
} as const;
/** Upload fields kept on the admission record, with the upload category each must use. */
export const ADMISSION_DOCUMENTS = { photoDocumentId: 'photo', employmentProofId: 'employment_proof', addressProofId: 'address_proof', medicalCertificateId: 'medical' } as const;

type Fail = (message: string) => never;
function text(input: Record<string, unknown>, key: string, label: string, fail: Fail, required = true, max = 300): string {
  const v = typeof input[key] === 'string' ? (input[key] as string).trim() : '';
  if (required && !v) fail(`${label} is required.`); if (v.length > max) fail(`${label} is too long.`); return v;
}
function choice<T extends string>(input: Record<string, unknown>, key: string, allowed: readonly T[], label: string, fail: Fail): T {
  const v = String(input[key] ?? ''); if (!allowed.includes(v as T)) fail(`Choose your ${label}.`); return v as T;
}

/** Aadhaar numbers are never stored in full: only the last four digits are kept. */
export function maskIdNumber(type: string, raw: string, fail: Fail): string {
  const compact = raw.replace(/[\s-]/g, '').toUpperCase();
  if (type === 'aadhaar') { if (!/^\d{12}$/.test(compact)) fail('Enter the 12-digit Aadhaar number.'); return `XXXX XXXX ${compact.slice(-4)}`; }
  if (type === 'passport') { if (!/^[A-Z][0-9]{7}$/.test(compact)) fail('Enter a valid passport number (one letter and 7 digits).'); return compact; }
  if (!/^[A-Z0-9]{8,12}$/.test(compact)) fail('Enter a valid Voter ID number.'); return compact;
}

export function parseAdmission(raw: unknown, fail: Fail, now = new Date()): AdmissionDetails {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('Please complete the admission form.');
  const input = raw as Record<string, unknown>;
  const idType = choice(input, 'idType', ADMISSION_OPTIONS.idType, 'ID type', fail);
  const pincode = text(input, 'pincode', 'PIN code', fail, true, 10); if (!/^\d{6}$/.test(pincode)) fail('Enter a 6-digit PIN code.');
  const income = text(input, 'monthlyIncome', 'Monthly income', fail, false, 20); if (income && !/^\d{1,9}$/.test(income.replace(/[,\s₹]/g, ''))) fail('Enter monthly income as a number of rupees.');
  const emergencyPhone = text(input, 'emergencyPhone', 'Emergency contact mobile', fail, true, 20); if (!/^\+?[\d\s-]{10,16}$/.test(emergencyPhone)) fail('Enter a valid emergency contact mobile number.');
  return {
    maritalStatus: choice(input, 'maritalStatus', ADMISSION_OPTIONS.maritalStatus, 'marital status', fail),
    nationality: text(input, 'nationality', 'Nationality', fail, true, 60),
    idType, idNumber: maskIdNumber(idType, text(input, 'idNumber', 'ID number', fail, true, 30), fail),
    currentAddress: text(input, 'currentAddress', 'Current address', fail, true, 600),
    city: text(input, 'city', 'City', fail, true, 80), state: text(input, 'state', 'State', fail, true, 80), pincode,
    designation: text(input, 'designation', 'Designation / course', fail, true, 120),
    officeAddress: text(input, 'officeAddress', 'Office / college address', fail, false, 600),
    officeContact: text(input, 'officeContact', 'Office contact number', fail, false, 20),
    monthlyIncome: income.replace(/[,\s₹]/g, ''),
    emergencyName: text(input, 'emergencyName', 'Emergency contact name', fail, true, 120),
    emergencyRelationship: text(input, 'emergencyRelationship', 'Emergency contact relationship', fail, true, 60),
    emergencyPhone, emergencyAddress: text(input, 'emergencyAddress', 'Emergency contact address', fail, true, 600),
    acPreference: choice(input, 'acPreference', ADMISSION_OPTIONS.acPreference, 'AC preference', fail),
    roomType: choice(input, 'roomType', ADMISSION_OPTIONS.roomType, 'room type', fail),
    stayDuration: choice(input, 'stayDuration', ADMISSION_OPTIONS.stayDuration, 'duration of stay', fail),
    foodType: choice(input, 'foodType', ADMISSION_OPTIONS.foodType, 'food type', fail),
    parking: choice(input, 'parking', ADMISSION_OPTIONS.parking, 'parking need', fail),
    declaredAt: now.toISOString(),
  };
}
