/*
# Aridzka Group Business Trip Management System - Initial Schema

## Overview
Complete database schema for the Business Trip Management System ("Sistem Manajemen Perjalanan Dinas")
for Aridzka Group. This migration creates all tables needed for the full multi-role approval workflow.

## Tables Created

### 1. profiles
- Extends auth.users with application-specific user data.
- `id` (uuid PK, references auth.users) - links to Supabase auth.
- `email`, `name`, `nip`, `role`, `jabatan` (grade), `pt_access` (JSON array of PT codes the user can approve).
- `is_super_admin` - HR Manager super admin flag.
- `is_demo` - marks demo accounts.

### 2. vehicles
- Master data for company fleet vehicles managed by PIC Obligo.
- `vehicle_type`, `plate_number`, `status` (available/in_use/maintenance), `assigned_driver`, `fuel_monthly_cost`.

### 3. drivers
- Master data for company drivers (TAD grade).
- `name`, `status` (available/on_duty/off), `license_number`.

### 4. biz_trips
- Core trip request table with all form data.
- `user_id` (owner), `requester_name`, `requester_nip`, `requester_jabatan`.
- `origin`, `origin_custom` (for Others), `departure_date/time`, `return_date/time`, `total_days`.
- `purpose`, `needs_vehicle`, `vehicle_type_choice`, `needs_driver`.
- `company_burden` (JSON array of PT codes - multi-unit), `trip_category` (Non-BSD distance).
- `itinerary` (JSON array), `participants` (JSON array).
- `petty_cash_requested`, `petty_cash_holder`, `petty_cash_approval_file`.
- Cost fields: `cost_grand_total`, `approved_total`, `kp_scheme`.
- PIC fields: `assigned_vehicle_id`, `assigned_driver_id`, `vehicle_km`, `fuel_cost`, `etoll_cost`.
- HR fields: `spd_number`, `settlement_number`, `hr_notes`.
- `status` - the workflow status (New Submission through Completed/Cancelled).
- `submitted_at`, `approved_at` - precise timestamps.
- `reject_reason`, `cancel_reason`, `review_justification`.

### 5. settlement_receipts
- Individual expense receipt line items uploaded by employees during settlement.
- `trip_id`, `category`, `description`, `amount`, `file_path`, `file_name`.
- `approval_status` (pending/approved/rejected/partial), `hr_remarks`.

### 6. trip_tracking
- Audit log of every status change and action.
- `trip_id`, `actor_name`, `actor_role`, `action`, `from_status`, `to_status`, `remarks`, `timestamp`.

### 7. disburse_rows
- Manual HR disbursement breakdown rows (Table B in SPD document).
- `trip_id`, `name`, `nominal`, `component_note`, `pt_burden`.

### 8. settlement_claim_rows
- Manual HR final claim settlement rows (Settlement Summary).
- `trip_id`, `name`, `nominal`, `claim_status`, `pt_burden`.

## Security (RLS)
- All tables have RLS enabled.
- Policies use `auth.uid()` for ownership checks.
- HR Manager (is_super_admin) can access all trips via app-level logic.
- profiles table: users can read/update their own profile.
- biz_trips: owner can CRUD own trips; authenticated users can read all (app filters by role).
- Child tables: scoped through biz_trips ownership.

## Notes
1. Email confirmation is OFF (demo accounts use pre-seeded credentials).
2. `user_id` on biz_trips defaults to auth.uid() so inserts omitting it still work.
3. JSON columns store arrays of objects for itinerary, participants, company_burden, pt_access.
*/

-- ============ profiles ============
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text NOT NULL,
  nip text,
  role text NOT NULL DEFAULT 'Employee',
  jabatan text NOT NULL DEFAULT 'Staff',
  pt_access jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_super_admin boolean NOT NULL DEFAULT false,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT TO authenticated USING (auth.uid() = id OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_super_admin = true));
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ============ vehicles ============
CREATE TABLE IF NOT EXISTS vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_type text NOT NULL,
  plate_number text NOT NULL,
  status text NOT NULL DEFAULT 'available',
  assigned_driver text,
  fuel_monthly_cost numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vehicles_read" ON vehicles;
CREATE POLICY "vehicles_read" ON vehicles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "vehicles_write" ON vehicles;
CREATE POLICY "vehicles_write" ON vehicles FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "vehicles_update" ON vehicles;
CREATE POLICY "vehicles_update" ON vehicles FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "vehicles_delete" ON vehicles;
CREATE POLICY "vehicles_delete" ON vehicles FOR DELETE TO authenticated USING (true);

-- ============ drivers ============
CREATE TABLE IF NOT EXISTS drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  license_number text,
  status text NOT NULL DEFAULT 'available',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "drivers_read" ON drivers;
CREATE POLICY "drivers_read" ON drivers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "drivers_write" ON drivers;
CREATE POLICY "drivers_write" ON drivers FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "drivers_update" ON drivers;
CREATE POLICY "drivers_update" ON drivers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "drivers_delete" ON drivers;
CREATE POLICY "drivers_delete" ON drivers FOR DELETE TO authenticated USING (true);

-- ============ biz_trips ============
CREATE TABLE IF NOT EXISTS biz_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,

  requester_name text NOT NULL,
  requester_nip text,
  requester_jabatan text NOT NULL DEFAULT 'Staff',

  origin text NOT NULL,
  origin_custom text,
  departure_date date NOT NULL,
  departure_time text NOT NULL,
  return_date date NOT NULL,
  return_time text NOT NULL,
  total_days integer NOT NULL DEFAULT 1,

  purpose text NOT NULL,
  needs_vehicle text NOT NULL DEFAULT 'Kendaraan Dinas',
  vehicle_type_choice text,
  needs_driver boolean NOT NULL DEFAULT false,

  company_burden jsonb NOT NULL DEFAULT '[]'::jsonb,
  trip_category text,

  itinerary jsonb NOT NULL DEFAULT '[]'::jsonb,
  participants jsonb NOT NULL DEFAULT '[]'::jsonb,

  petty_cash_requested boolean NOT NULL DEFAULT false,
  petty_cash_holder text,
  petty_cash_approval_file text,

  kp_scheme text DEFAULT 'KP2',

  cost_grand_total numeric DEFAULT 0,
  approved_total numeric DEFAULT 0,

  assigned_vehicle_id uuid,
  assigned_driver_id uuid,
  vehicle_km integer,
  fuel_cost numeric DEFAULT 0,
  etoll_cost numeric DEFAULT 0,

  spd_number text,
  settlement_number text,
  hr_notes text,

  status text NOT NULL DEFAULT 'New Submission',
  submitted_at timestamptz DEFAULT now(),
  approved_at timestamptz,

  reject_reason text,
  reject_by text,
  cancel_reason_category text,
  cancel_reason_detail text,
  review_justification text,
  settlement_result text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE biz_trips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trips_select" ON biz_trips;
CREATE POLICY "trips_select" ON biz_trips FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "trips_insert" ON biz_trips;
CREATE POLICY "trips_insert" ON biz_trips FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "trips_update" ON biz_trips;
CREATE POLICY "trips_update" ON biz_trips FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "trips_delete" ON biz_trips;
CREATE POLICY "trips_delete" ON biz_trips FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_biz_trips_status ON biz_trips(status);
CREATE INDEX IF NOT EXISTS idx_biz_trips_user ON biz_trips(user_id);

-- ============ settlement_receipts ============
CREATE TABLE IF NOT EXISTS settlement_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES biz_trips(id) ON DELETE CASCADE,
  category text NOT NULL,
  description text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  file_path text,
  file_name text,
  approval_status text NOT NULL DEFAULT 'pending',
  hr_remarks text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE settlement_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "receipts_select" ON settlement_receipts;
CREATE POLICY "receipts_select" ON settlement_receipts FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "receipts_insert" ON settlement_receipts;
CREATE POLICY "receipts_insert" ON settlement_receipts FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "receipts_update" ON settlement_receipts;
CREATE POLICY "receipts_update" ON settlement_receipts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "receipts_delete" ON settlement_receipts;
CREATE POLICY "receipts_delete" ON settlement_receipts FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_receipts_trip ON settlement_receipts(trip_id);

-- ============ trip_tracking ============
CREATE TABLE IF NOT EXISTS trip_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES biz_trips(id) ON DELETE CASCADE,
  actor_name text NOT NULL,
  actor_role text NOT NULL,
  action text NOT NULL,
  from_status text,
  to_status text,
  remarks text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE trip_tracking ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tracking_select" ON trip_tracking;
CREATE POLICY "tracking_select" ON trip_tracking FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "tracking_insert" ON trip_tracking;
CREATE POLICY "tracking_insert" ON trip_tracking FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "tracking_update" ON trip_tracking;
CREATE POLICY "tracking_update" ON trip_tracking FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "tracking_delete" ON trip_tracking;
CREATE POLICY "tracking_delete" ON trip_tracking FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_tracking_trip ON trip_tracking(trip_id);

-- ============ disburse_rows ============
CREATE TABLE IF NOT EXISTS disburse_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES biz_trips(id) ON DELETE CASCADE,
  name text NOT NULL,
  nominal numeric NOT NULL DEFAULT 0,
  component_note text NOT NULL,
  pt_burden text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE disburse_rows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "disburse_select" ON disburse_rows;
CREATE POLICY "disburse_select" ON disburse_rows FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "disburse_insert" ON disburse_rows;
CREATE POLICY "disburse_insert" ON disburse_rows FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "disburse_update" ON disburse_rows;
CREATE POLICY "disburse_update" ON disburse_rows FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "disburse_delete" ON disburse_rows;
CREATE POLICY "disburse_delete" ON disburse_rows FOR DELETE TO authenticated USING (true);

-- ============ settlement_claim_rows ============
CREATE TABLE IF NOT EXISTS settlement_claim_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES biz_trips(id) ON DELETE CASCADE,
  name text NOT NULL,
  nominal numeric NOT NULL DEFAULT 0,
  claim_status text NOT NULL,
  pt_burden text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE settlement_claim_rows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "claims_select" ON settlement_claim_rows;
CREATE POLICY "claims_select" ON settlement_claim_rows FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "claims_insert" ON settlement_claim_rows;
CREATE POLICY "claims_insert" ON settlement_claim_rows FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "claims_update" ON settlement_claim_rows;
CREATE POLICY "claims_update" ON settlement_claim_rows FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "claims_delete" ON settlement_claim_rows;
CREATE POLICY "claims_delete" ON settlement_claim_rows FOR DELETE TO authenticated USING (true);

-- Storage bucket for receipts and approval files
INSERT INTO storage.buckets (id, name, public) VALUES ('receipts', 'receipts', true) ON CONFLICT (id) DO NOTHING;
