import type { Role, Jabatan, TripStatus, KPScheme, DKTier, TransportChoice, TripCategory } from './types';

export const ALL_ROLES: Role[] = ['Employee', 'Manager', 'PIC Obligo', 'Direksi', 'HR Manager'];

export const JABATAN_LEVELS: Jabatan[] = ['Staff', 'Team Leader', 'Head Department', 'General Manager', 'Direksi', 'TAD'];

export const JABATAN_GRADE_MAP: Record<Jabatan, 'A' | 'B' | 'C' | 'D' | 'E' | 'F'> = {
  'Staff': 'A',
  'Team Leader': 'B',
  'Head Department': 'C',
  'General Manager': 'D',
  'Direksi': 'E',
  'TAD': 'F',
};

export const JABATAN_RANK: Record<Jabatan, number> = {
  'Direksi': 5,
  'General Manager': 4,
  'Head Department': 3,
  'Team Leader': 2,
  'Staff': 1,
  'TAD': 0,
};

export const PT_OPTIONS: string[] = [
  'PT AAK', 'PT AAR', 'PT AGM', 'PT APN', 'PT BRK', 'PT BRP',
  'PT BRP Autoglaze', 'PT FRL', 'PT PKS', 'PT RGN', 'PT SMK', 'PT TMB', 'Other',
];

export const ORIGINS: string[] = [
  'Head Office BSD', 'Branch Office Pekanbaru', 'Branch Office Batam',
  'SITE Kuansing', 'SITE Bangkinang', 'SITE Keritang', 'Others',
];

export const DESTINATION_OPTIONS: string[] = [
  'Head Office BSD', 'Branch Office Pekanbaru', 'Branch Office Batam',
  'SITE Kuansing', 'SITE Bangkinang', 'SITE Keritang',
  'Dalam Kota', 'Luar Kota', 'Others',
];

export const TRANSPORT_CHOICES: TransportChoice[] = ['Kendaraan Dinas', 'Transportasi Umum', 'Kendaraan Pribadi'];

export const DK_DISTANCE_TIERS: { key: DKTier; label: string }[] = [
  { key: '25', label: '25 KM' },
  { key: '50', label: '50 KM' },
  { key: '100', label: '100 KM' },
];

export const KP_SCHEMES: KPScheme[] = ['KP1', 'KP2', 'KPO'];

export const SCHEME_OVERRIDE_OPTIONS: { value: string; label: string }[] = [
  { value: 'within_city_25km', label: 'Dalam Kota 25KM' },
  { value: 'within_city_50km', label: 'Dalam Kota 50KM' },
  { value: 'within_city_100km', label: 'Dalam Kota 100KM' },
  { value: 'luar_kota', label: 'Luar Kota' },
  { value: 'KP1', label: 'KP1' },
  { value: 'KP2', label: 'KP2' },
  { value: 'KPO', label: 'KPO' },
];

export const PIPELINE_STEPS: { status: TripStatus; label: string }[] = [
  { status: 'Draft', label: 'Draft' },
  { status: 'Pending Manager Approval', label: 'Pending Manager' },
  { status: 'Pending PIC Obligo', label: 'Pending PIC Obligo' },
  { status: 'Pending Direksi Approval', label: 'Pending Direksi' },
  { status: 'Pending HR Advance Review', label: 'Pending HR Advance' },
  { status: 'Approved / Ready for Trip', label: 'Approved' },
  { status: 'On Trip', label: 'On Trip' },
  { status: 'Pending Settlement', label: 'Pending Settlement' },
  { status: 'Pending HR Settlement Review', label: 'Pending HR Settlement' },
  { status: 'Pending Reimbursement Approval', label: 'Pending Reimbursement' },
  { status: 'Pending Refund', label: 'Pending Refund' },
  { status: 'Completed', label: 'Completed' },
];

export const STATUS_META: Record<TripStatus, { label: string; color: string; dot: string; step: number }> = {
  'Draft': { label: 'Draft', color: 'bg-slate-100 text-slate-700', dot: 'bg-slate-400', step: 0 },
  'Pending Manager Approval': { label: 'Pending Manager', color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500', step: 1 },
  'Pending PIC Obligo': { label: 'Pending PIC Obligo', color: 'bg-sky-100 text-sky-700', dot: 'bg-sky-500', step: 2 },
  'Pending Direksi Approval': { label: 'Pending Direksi', color: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500', step: 3 },
  'Pending HR Advance Review': { label: 'Pending HR Advance', color: 'bg-brand-100 text-brand-700', dot: 'bg-brand-500', step: 4 },
  'Approved / Ready for Trip': { label: 'Approved', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500', step: 5 },
  'On Trip': { label: 'On Trip', color: 'bg-indigo-100 text-indigo-700', dot: 'bg-indigo-500', step: 6 },
  'Pending Settlement': { label: 'Pending Settlement', color: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500', step: 7 },
  'Pending HR Settlement Review': { label: 'Pending HR Settlement', color: 'bg-cyan-100 text-cyan-700', dot: 'bg-cyan-500', step: 8 },
  'Pending Reimbursement Approval': { label: 'Pending Reimbursement', color: 'bg-teal-100 text-teal-700', dot: 'bg-teal-500', step: 9 },
  'Pending Refund': { label: 'Pending Refund', color: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500', step: 10 },
  'Completed': { label: 'Completed', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-600', step: 11 },
  'Rejected': { label: 'Rejected', color: 'bg-red-100 text-red-700', dot: 'bg-red-500', step: -1 },
};

export const RECEIPT_CATEGORIES: string[] = ['BBM', 'E-Toll', 'Konsumsi', 'Entertain', 'Parkir', 'Laundry', 'Akomodasi', 'Lainnya'];

export const DEMO_ACCOUNTS: { email: string; role: string; label: string }[] = [
  { email: 'employee@company.com', role: 'Employee', label: 'Employee' },
  { email: 'manager@company.com', role: 'Manager', label: 'Manager' },
  { email: 'obligo@company.com', role: 'PIC Obligo', label: 'PIC Obligo' },
  { email: 'direksi@company.com', role: 'Direksi', label: 'Direksi' },
  { email: 'hr@company.com', role: 'HR Manager', label: 'HR Manager' },
];

export const DEMO_PASSWORD = 'Aridzka2025!';
