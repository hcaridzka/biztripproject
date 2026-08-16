export type Role = 'Employee' | 'Manager' | 'PIC Obligo' | 'Direksi' | 'HR Manager';

export type Jabatan = 'Staff' | 'Team Leader' | 'Head Department' | 'General Manager' | 'Direksi' | 'TAD' | 'Driver';

export type KPScheme = 'KP1' | 'KP2' | 'KPO';

export type DKTier = '25' | '50' | '100';

export type TotalDistanceOption = 'none' | 'gt200' | 'gt400';

export type TransportChoice = 'Kendaraan Dinas' | 'Transportasi Umum' | 'Kendaraan Pribadi';

export type TripCategory = 'within_city_25km' | 'within_city_50km' | 'within_city_100km' | 'luar_kota' | null;

export type ParticipantCategory = 'Internal' | 'Eksternal';

export interface Participant {
  id: string;
  name: string;
  jabatan: Jabatan;
  grade?: string;
  category?: ParticipantCategory;
  keterangan?: string;
  pt_unit?: string;
}

export interface PerParticipant {
  name: string;
  grade?: string;
  jabatan?: Jabatan;
  pt_unit?: string;
  perDay?: number;
  days?: number;
  allowanceTotal?: number;
  hotelTotal?: number;
  hotel?: number;
  driver?: number;
  pettyCashTotal?: number;
  pettyCash?: number;
  total?: number;
  breakdown?: string;
  legs?: any[];
}

export interface ItineraryLeg {
  id: string;
  start_date: string;
  end_date: string;
  destination: string;
  destination_custom: string;
  kpScheme: KPScheme;
  isWithinCity: boolean;
  isLuarkota: boolean;
  dkTier?: DKTier;
  agenda: string;
}

export interface Profile {
  id: string;
  email: string;
  role: Role;
  name: string;
  nip: string | null;
  jabatan: Jabatan;
  grade?: string;
  pt_unit?: string;
  pt_access: string[];
  is_super_admin: boolean;
  is_demo: boolean;
}

export type TripStatus =
  | 'Draft'
  | 'Pending Manager Approval'
  | 'Pending PIC Obligo'
  | 'Pending Direksi Approval'
  | 'Pending HR Advance Review'
  | 'Approved / Ready for Trip'
  | 'On Trip'
  | 'Pending Settlement'
  | 'Pending HR Settlement Review'
  | 'Pending Refund'
  | 'Pending Refund Verification'
  | 'Completed'
  | 'Rejected';

export interface DisburseRow {
  id: string;
  trip_id: string;
  name: string;
  nominal: number;
  component_note: string;
  pt_burden: string;
  sort_order: number;
}

export interface SettlementClaimRow {
  id: string;
  trip_id: string;
  name: string;
  nominal: number;
  claim_status: 'Refund' | 'Reimburse';
  pt_burden: string;
  sort_order: number;
}

export interface SettlementReceipt {
  id: string;
  trip_id: string;
  category: string;
  description: string;
  amount: number;
  file_name: string | null;
  hr_status: string;
  hr_approved_amount: number | null;
  hr_note: string | null;
}

export interface Vehicle {
  id: string;
  plate_number: string;
  vehicle_type: string;
  status: string;
  current_km: number;
  fuel_monthly_cost: number;
  last_service_date: string | null;
  assigned_driver: string | null;
}

export interface Driver {
  id: string;
  name: string;
  license_number: string | null;
  phone: string | null;
  status: string;
  assigned_vehicle: string | null;
}

export interface TripTracking {
  id: string;
  trip_id: string;
  actor_name: string;
  actor_role: string;
  action: string;
  from_status: string | null;
  to_status: string;
  remarks: string | null;
  created_at: string;
}

export interface BizTrip {
  id: string;
  created_at: string;
  user_id: string;
  requester_name: string;
  requester_nip: string | null;
  requester_jabatan: Jabatan;
  origin: string;
  origin_custom: string | null;
  departure_date: string;
  departure_time: string | null;
  return_date: string;
  return_time: string | null;
  total_days: number;
  purpose: string;
  needs_vehicle: boolean;
  vehicle_type_choice: string | null;
  needs_driver: boolean;
  total_distance?: TotalDistanceOption; // Field baru untuk opsi jarak total
  itinerary: ItineraryLeg[];
  participants: Participant[];
  petty_cash_requested: boolean;
  petty_cash_approval_file: string | null;
  petty_cash_holder: string | null;
  company_burden: string[];
  trip_category: TripCategory;
  kp_scheme: KPScheme;
  status: TripStatus;
  rejection_stage: string | null;
  reject_reason: string | null;
  reject_by: string | null;
  review_justification: string | null;
  manager_note: string | null;
  manager_approved_by: string | null;
  manager_approved_at: string | null;
  obligo_vehicle_type: string | null;
  obligo_vehicle_plate: string | null;
  obligo_vehicle_km: string | null;
  obligo_driver_name: string | null;
  obligo_note: string | null;
  obligo_approved_by: string | null;
  obligo_approved_at: string | null;
  assigned_vehicle_id: string | null;
  assigned_driver_id: string | null;
  vehicle_km: number | null;
  fuel_cost: number;
  etoll_cost: number;
  direksi_note: string | null;
  direksi_approved_by: string | null;
  direksi_approved_at: string | null;
  cost_data: any;
  cost_grand_total: number;
  cost_fuel: number;
  cost_toll: number;
  cost_note: string | null;
  hr_notes: string | null;
  spd_number: string | null;
  spd_issued_at: string | null;
  approved_at: string | null;
  submitted_at: string;
  work_result: string | null;
  pending_task: string | null;
  next_project: string | null;
  settlement_submitted_by: string | null;
  settlement_submitted_at: string | null;
  settlement_number: string | null;
  realization_total: number | null;
  approved_total: number | null;
  settlement_result: string | null;
  settlement_note: string | null;
  settlement_reviewed_by: string | null;
  settlement_reviewed_at: string | null;
  completed_at: string | null;
  cancel_reason_category: string | null;
  cancel_reason_detail: string | null;
  banding_reason: string | null;
  banding_at: string | null;
  employee_remarks: string | null;
}

export interface AllowanceMatrix {
  grade_key: string;
  luar_kota: number;
  kp1: number;
  kp2: number;
  kpo: number;
  hotel: number;
  petty_cash: number;
  dk_25: number;
  dk_50: number;
  dk_100: number;
  driver_incentive_gt200: number; // Tambah ini
  driver_incentive_gt400: number; // Tambah ini
}
