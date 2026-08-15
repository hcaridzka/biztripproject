/*
# Business Trip Management System — full revision (auth + matrix workflow)

## Overview
Replaces the previous single-tenant demo schema with a multi-user authenticated
workflow. Four demo auth accounts are created with email/password login. The
application enforces role-based access in the UI; all trip data is shared among
authenticated staff (collaborative business workflow).

## 1. New Tables

### profiles
Auth-linked user profile (id = auth.users.id). Stores the user's display name,
NIP, jabatan level, and application role.
- id (uuid, pk, = auth.users.id)
- email (text, unique)
- role (text) — Employee | Manager | PIC Obligo | HR Manager
- name (text)
- nip (text)
- jabatan (text) — one of: TAD, Staff, Team Leader, Head Department, General Manager, Direksi
- created_at (timestamptz)

### biz_trips
The core trip-request table carrying the full workflow from request → 3-stage
approval → cost calculation → SPD issuance → settlement → completion.
Key column groups:
- Request: user_id, requester_name, requester_nip, requester_jabatan, origin,
  departure_date/time, return_date/time, purpose, needs_vehicle, needs_driver,
  itinerary (jsonb array of route legs), participants (jsonb array),
  petty_cash_requested, petty_cash_approval_file, company_burden (jsonb array of PT names)
- Status: status, rejection_stage
- Stage 1 (Manager): manager_note, manager_approved_by/at
- Stage 2 (PIC Obligo): obligo_vehicle_type/plate/km, obligo_driver_name, obligo_note, obligo_approved_by/at
- Stage 3 (Pimpinan): pimpinan_note, pimpinan_approved_by/at
- Banding: banding_reason, banding_at
- Cost (HR): cost_data (jsonb, full editable breakdown), cost_grand_total,
  cost_fuel, cost_toll, cost_note, cost_calculated_by/at, spd_number, spd_issued_at
- Settlement: work_result, pending_task, next_project, settlement_submitted_by/at,
  realization_total, approved_total, settlement_result (reimbursement|refund),
  settlement_note, settlement_reviewed_by/at, completed_at

### settlement_receipts
Per-nota review rows for the settlement stage. HR can approve / reject / partial-approve each.
- id, trip_id (FK biz_trips CASCADE), created_at
- category (BBM | E-Toll | Konsumsi | Laundry), description, amount, file_name
- hr_status (pending | approved | rejected | partial), hr_approved_amount, hr_note
- reviewed_by, reviewed_at

## 2. Auth Users (Demo)
Four auth.users rows created via SQL with bcrypt-hashed passwords:
- employee@company.com → role Employee, jabatan Staff
- manager@company.com → role Manager, jabatan Head Department (acts as Manager Pegawai + Pimpinan)
- obligo@company.com → role PIC Obligo, jabatan TAD
- hr@company.com → role HR Manager, jabatan Head Department (super-admin)
Password for all: demo123. Email confirmation is ON (email_confirmed_at set).

## 3. Security (RLS)
- profiles: authenticated SELECT all (staff directory), INSERT/UPDATE own row only.
- biz_trips: authenticated CRUD — data is intentionally shared among all staff
  (collaborative workflow). Access control enforced by role in the UI.
- settlement_receipts: same shared-workflow model as biz_trips.
- Old tables (employees, destinations, trip_requests) remain in place but unused.

## 4. Important Notes
1. pgcrypto extension enabled for bcrypt password hashing via crypt()/gen_salt().
2. set_updated_at() trigger function reused from prior migration; new trigger on biz_trips.
3. Migration is idempotent — auth users and profiles use IF NOT EXISTS / ON CONFLICT.
*/
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============ profiles ============
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  role text NOT NULL,
  name text NOT NULL,
  nip text,
  jabatan text NOT NULL DEFAULT 'Staff',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_all" ON profiles;
CREATE POLICY "profiles_select_all" ON profiles FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ============ biz_trips ============
CREATE TABLE IF NOT EXISTS biz_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Request
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  requester_name text NOT NULL,
  requester_nip text,
  requester_jabatan text NOT NULL,
  origin text NOT NULL,
  departure_date date NOT NULL,
  departure_time text,
  return_date date NOT NULL,
  return_time text,
  purpose text NOT NULL,
  needs_vehicle boolean NOT NULL DEFAULT false,
  needs_driver boolean NOT NULL DEFAULT false,
  itinerary jsonb NOT NULL DEFAULT '[]'::jsonb,
  participants jsonb NOT NULL DEFAULT '[]'::jsonb,
  petty_cash_requested boolean NOT NULL DEFAULT false,
  petty_cash_approval_file text,
  company_burden jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Status
  status text NOT NULL DEFAULT 'draft',
  rejection_stage text,
  -- Stage 1: Manager
  manager_note text,
  manager_approved_by text,
  manager_approved_at timestamptz,
  -- Stage 2: PIC Obligo
  obligo_vehicle_type text,
  obligo_vehicle_plate text,
  obligo_vehicle_km text,
  obligo_driver_name text,
  obligo_note text,
  obligo_approved_by text,
  obligo_approved_at timestamptz,
  -- Stage 3: Pimpinan
  pimpinan_note text,
  pimpinan_approved_by text,
  pimpinan_approved_at timestamptz,
  -- Banding
  banding_reason text,
  banding_at timestamptz,
  -- Cost (HR)
  cost_data jsonb,
  cost_grand_total numeric(14,2) DEFAULT 0,
  cost_fuel numeric(14,2) DEFAULT 0,
  cost_toll numeric(14,2) DEFAULT 0,
  cost_note text,
  cost_calculated_by text,
  cost_calculated_at timestamptz,
  spd_number text,
  spd_issued_at timestamptz,
  -- Settlement
  work_result text,
  pending_task text,
  next_project text,
  settlement_submitted_by text,
  settlement_submitted_at timestamptz,
  realization_total numeric(14,2) DEFAULT 0,
  approved_total numeric(14,2) DEFAULT 0,
  settlement_result text,
  settlement_note text,
  settlement_reviewed_by text,
  settlement_reviewed_at timestamptz,
  completed_at timestamptz
);

ALTER TABLE biz_trips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trips_select_auth" ON biz_trips;
CREATE POLICY "trips_select_auth" ON biz_trips FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "trips_insert_auth" ON biz_trips;
CREATE POLICY "trips_insert_auth" ON biz_trips FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "trips_update_auth" ON biz_trips;
CREATE POLICY "trips_update_auth" ON biz_trips FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "trips_delete_auth" ON biz_trips;
CREATE POLICY "trips_delete_auth" ON biz_trips FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_biz_trips_status ON biz_trips(status);
CREATE INDEX IF NOT EXISTS idx_biz_trips_user ON biz_trips(user_id);

-- ============ settlement_receipts ============
CREATE TABLE IF NOT EXISTS settlement_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES biz_trips(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  category text NOT NULL,
  description text,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  file_name text,
  hr_status text NOT NULL DEFAULT 'pending',
  hr_approved_amount numeric(14,2),
  hr_note text,
  reviewed_by text,
  reviewed_at timestamptz
);

ALTER TABLE settlement_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "receipts_select_auth" ON settlement_receipts;
CREATE POLICY "receipts_select_auth" ON settlement_receipts FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "receipts_insert_auth" ON settlement_receipts;
CREATE POLICY "receipts_insert_auth" ON settlement_receipts FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "receipts_update_auth" ON settlement_receipts;
CREATE POLICY "receipts_update_auth" ON settlement_receipts FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "receipts_delete_auth" ON settlement_receipts;
CREATE POLICY "receipts_delete_auth" ON settlement_receipts FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_receipts_trip ON settlement_receipts(trip_id);

-- ============ updated_at trigger ============
DROP TRIGGER IF EXISTS biz_trips_set_updated_at ON biz_trips;
CREATE TRIGGER biz_trips_set_updated_at
  BEFORE UPDATE ON biz_trips
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============ Auth demo users ============
DO $$
DECLARE
  v_instance_id uuid;
BEGIN
  SELECT COALESCE(
    (SELECT instance_id FROM auth.users LIMIT 1),
    '00000000-0000-0000-0000-000000000000'::uuid
  ) INTO v_instance_id;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'employee@company.com') THEN
    INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, instance_id, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    VALUES (gen_random_uuid(), 'authenticated', 'authenticated', 'employee@company.com',
      crypt('demo123', gen_salt('bf')), now(), v_instance_id, now(), now(),
      '{"role":"Employee"}'::jsonb, '{}'::jsonb);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'manager@company.com') THEN
    INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, instance_id, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    VALUES (gen_random_uuid(), 'authenticated', 'authenticated', 'manager@company.com',
      crypt('demo123', gen_salt('bf')), now(), v_instance_id, now(), now(),
      '{"role":"Manager"}'::jsonb, '{}'::jsonb);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'obligo@company.com') THEN
    INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, instance_id, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    VALUES (gen_random_uuid(), 'authenticated', 'authenticated', 'obligo@company.com',
      crypt('demo123', gen_salt('bf')), now(), v_instance_id, now(), now(),
      '{"role":"PIC Obligo"}'::jsonb, '{}'::jsonb);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'hr@company.com') THEN
    INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, instance_id, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    VALUES (gen_random_uuid(), 'authenticated', 'authenticated', 'hr@company.com',
      crypt('demo123', gen_salt('bf')), now(), v_instance_id, now(), now(),
      '{"role":"HR Manager"}'::jsonb, '{}'::jsonb);
  END IF;
END $$;

-- ============ Profiles for demo users ============
INSERT INTO profiles (id, email, role, name, nip, jabatan)
SELECT u.id, u.email,
  u.raw_app_meta_data->>'role',
  CASE u.email
    WHEN 'employee@company.com' THEN 'Andi Pratama'
    WHEN 'manager@company.com' THEN 'Rudi Hartono'
    WHEN 'obligo@company.com' THEN 'Slamet Riyadi'
    WHEN 'hr@company.com' THEN 'Rina Wati'
  END,
  CASE u.email
    WHEN 'employee@company.com' THEN 'EMP-2024-001'
    WHEN 'manager@company.com' THEN 'MGR-2024-001'
    WHEN 'obligo@company.com' THEN 'OBL-2024-001'
    WHEN 'hr@company.com' THEN 'HR-2024-001'
  END,
  CASE u.email
    WHEN 'employee@company.com' THEN 'Staff'
    WHEN 'manager@company.com' THEN 'Head Department'
    WHEN 'obligo@company.com' THEN 'TAD'
    WHEN 'hr@company.com' THEN 'Head Department'
  END
FROM auth.users u
WHERE u.email IN ('employee@company.com','manager@company.com','obligo@company.com','hr@company.com')
ON CONFLICT (id) DO NOTHING;

-- Auto-create profile on new auth signup
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, email, role, name, jabatan)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_app_meta_data->>'role', 'Employee'), COALESCE(NEW.raw_user_meta_data->>'name', NEW.email), 'Staff')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
