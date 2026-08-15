/*
# Business Trip System — Rename Pimpinan to Direksi, Add PT Access & Vehicle Management

## Overview
This migration standardizes terminology by renaming all `pimpinan_*` columns to `direksi_*`
in the `biz_trips` table, adds PT access control columns to `profiles` for role-based
approval routing, and creates new `vehicles` and `drivers` tables for the PIC Obligo
vehicle management summary dashboard.

## 1. Renamed Columns (biz_trips)
- `pimpinan_note` → `direksi_note`
- `pimpinan_approved_by` → `direksi_approved_by`
- `pimpinan_approved_at` → `direksi_approved_at`
(No data loss — columns are renamed in place)

## 2. Modified Tables
### profiles — new PT access columns
- `pt_access` (jsonb, default '[]') — array of PT names this user can approve for (Direksi/Manager)
- `is_super_admin` (boolean, default false) — true for HR Manager (full access, bypass PT checks)
- `is_demo` (boolean, default true) — marks demo accounts; set to false when user changes credentials

## 3. New Tables
### vehicles
Company operational vehicles managed by PIC Obligo.
- id (uuid pk), created_at, plate_number (text unique), vehicle_type (text),
  status (text: available | in_use | maintenance), current_km (numeric),
  fuel_monthly_cost (numeric, monthly fuel budget), last_service_date (date),
  assigned_driver (text)

### drivers
Company drivers managed by PIC Obligo.
- id (uuid pk), created_at, name (text), license_number (text),
  phone (text), status (text: available | on_duty | off), assigned_vehicle (text)

## 4. Security (RLS)
- vehicles & drivers: authenticated CRUD (shared operational data, collaborative workflow)
- profiles: updated policy to allow HR super-admin to update all profiles

## 5. Important Notes
1. Column renames preserve existing data — no DELETE/DROP of data.
2. PT access uses jsonb array of PT name strings matching COMPANY_BURDENS constants.
3. HR Manager is automatically set as super_admin via UPDATE at end of migration.
4. Vehicles and drivers tables seeded with 3 demo rows each.
*/

-- ============ 1. Rename pimpinan_* columns to direksi_* ============
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'biz_trips' AND column_name = 'pimpinan_note') THEN
    ALTER TABLE biz_trips RENAME COLUMN pimpinan_note TO direksi_note;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'biz_trips' AND column_name = 'pimpinan_approved_by') THEN
    ALTER TABLE biz_trips RENAME COLUMN pimpinan_approved_by TO direksi_approved_by;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'biz_trips' AND column_name = 'pimpinan_approved_at') THEN
    ALTER TABLE biz_trips RENAME COLUMN pimpinan_approved_at TO direksi_approved_at;
  END IF;
END $$;

-- ============ 2. Add PT access columns to profiles ============
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'pt_access') THEN
    ALTER TABLE profiles ADD COLUMN pt_access jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'is_super_admin') THEN
    ALTER TABLE profiles ADD COLUMN is_super_admin boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'is_demo') THEN
    ALTER TABLE profiles ADD COLUMN is_demo boolean NOT NULL DEFAULT true;
  END IF;
END $$;

-- Mark HR Manager as super admin
UPDATE profiles SET is_super_admin = true WHERE role = 'HR Manager';

-- ============ 3. Create vehicles table ============
CREATE TABLE IF NOT EXISTS vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  plate_number text UNIQUE NOT NULL,
  vehicle_type text NOT NULL,
  status text NOT NULL DEFAULT 'available',
  current_km numeric(10,1) DEFAULT 0,
  fuel_monthly_cost numeric(14,2) DEFAULT 0,
  last_service_date date,
  assigned_driver text
);

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vehicles_select_auth" ON vehicles;
CREATE POLICY "vehicles_select_auth" ON vehicles FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "vehicles_insert_auth" ON vehicles;
CREATE POLICY "vehicles_insert_auth" ON vehicles FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "vehicles_update_auth" ON vehicles;
CREATE POLICY "vehicles_update_auth" ON vehicles FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "vehicles_delete_auth" ON vehicles;
CREATE POLICY "vehicles_delete_auth" ON vehicles FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles(status);

-- ============ 4. Create drivers table ============
CREATE TABLE IF NOT EXISTS drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL,
  license_number text,
  phone text,
  status text NOT NULL DEFAULT 'available',
  assigned_vehicle text
);

ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "drivers_select_auth" ON drivers;
CREATE POLICY "drivers_select_auth" ON drivers FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "drivers_insert_auth" ON drivers;
CREATE POLICY "drivers_insert_auth" ON drivers FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "drivers_update_auth" ON drivers;
CREATE POLICY "drivers_update_auth" ON drivers FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "drivers_delete_auth" ON drivers;
CREATE POLICY "drivers_delete_auth" ON drivers FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers(status);

-- ============ 5. Seed demo vehicles ============
INSERT INTO vehicles (plate_number, vehicle_type, status, current_km, fuel_monthly_cost, last_service_date, assigned_driver)
VALUES
  ('B 1234 KTG', 'Toyota Avanza', 'available', 45200.0, 1500000, '2026-06-15', 'Joko Santoso'),
  ('B 5678 KTG', 'Toyota Hiace', 'in_use', 78300.0, 2500000, '2026-05-20', 'Budi Nugroho'),
  ('B 9012 KTG', 'Mitsubishi Pajero', 'maintenance', 102500.0, 3500000, '2026-07-01', NULL)
ON CONFLICT (plate_number) DO NOTHING;

-- ============ 6. Seed demo drivers ============
INSERT INTO drivers (name, license_number, phone, status, assigned_vehicle)
VALUES
  ('Joko Santoso', 'SIM-B-1234567', '081234567890', 'available', 'B 1234 KTG'),
  ('Budi Nugroho', 'SIM-B-2345678', '081234567891', 'on_duty', 'B 5678 KTG'),
  ('Sutrisno', 'SIM-B-3456789', '081234567892', 'off', NULL)
ON CONFLICT DO NOTHING;

-- ============ 7. Update profiles UPDATE policy to allow HR super-admin ============
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_super_admin = true))
  WITH CHECK (auth.uid() = id OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_super_admin = true));

-- ============ 8. Add trip_category column to biz_trips for Non-BSD distance ============
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'biz_trips' AND column_name = 'trip_category') THEN
    ALTER TABLE biz_trips ADD COLUMN trip_category text;
  END IF;
END $$;
