/*
# Business Trip Management System — initial schema

## Overview
Single-tenant demo application (role is simulated via a client-side role switcher,
no real authentication). All tables are readable/writable by the anon key so the
browser client can operate end-to-end.

## New Tables

### employees
Directory of staff used as requesters and trip participants.
- `id` (uuid, pk)
- `name` (text)
- `role` (text) — one of: Employee, Manager, Direksi, PIC Kendaraan, HR Manager
- `grade` (int, 1..4) — drives per-diem allowance; 4 = highest
- `position` (text)
- `created_at` (timestamptz)

### destinations
Master list of trip destinations for the request dropdown, with a flag marking
which destinations are eligible for a special petty cash allocation.
- `id` (uuid, pk)
- `name` (text)
- `region` (text)
- `petty_cash_eligible` (boolean, default false)
- `created_at` (timestamptz)

### trip_requests
The core flow table. One row per business trip request; columns are grouped by
the workflow stage that populates them (request → approval → transport → cost →
reporting → completion).
- `id` (uuid, pk)
- `created_at`, `updated_at` (timestamptz)
- `requester_id` (uuid, references employees)
- `requester_name` (text, denormalized for list display)
- `departure_date`, `return_date` (date)
- `destination` (text)
- `participants` (jsonb) — array of {id, name, role, grade}
- `needs_driver`, `needs_vehicle` (boolean)
- `status` (text) — draft | pending_approval | approved | rejected | allocated |
  cost_calculated | pending_hr_review | completed
- `approval_note`, `approved_by`, `approved_at` (manager stage)
- `driver_name`, `vehicle_plate`, `vehicle_type`, `fuel_estimate`, `toll_estimate`,
  `allocated_by`, `allocated_at` (PIC transport stage)
- `per_diem_total`, `transport_total`, `petty_cash_amount`, `grand_total` (numeric,
  HR cost stage)
- `petty_cash_holder_id`, `petty_cash_holder_name` (text)
- `cost_note`, `cost_calculated_by`, `cost_calculated_at` (text/timestamptz)
- `template_uploaded` (boolean), `template_data` (jsonb) — bypass manual calculation
- `work_result`, `pending_task`, `next_project` (text, employee report stage)
- `receipts` (jsonb) — array of {category, description, amount, fileName}
- `realization_total` (numeric)
- `report_submitted_by`, `report_submitted_at` (text/timestamptz)
- `hr_review_note`, `completed_by`, `completed_at` (text/timestamptz)

## Security
- RLS enabled on all three tables.
- Because this is a single-tenant demo with a simulated role switcher and no
  sign-in screen, every policy is scoped `TO anon, authenticated` with
  `USING (true)` / `WITH CHECK (true)` — the data is intentionally shared/public
  for the demo.
*/

CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role text NOT NULL,
  grade int NOT NULL DEFAULT 1 CHECK (grade BETWEEN 1 AND 4),
  position text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS destinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  region text,
  petty_cash_eligible boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trip_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  requester_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  requester_name text NOT NULL,
  departure_date date NOT NULL,
  return_date date NOT NULL,
  destination text NOT NULL,
  participants jsonb NOT NULL DEFAULT '[]'::jsonb,
  needs_driver boolean NOT NULL DEFAULT false,
  needs_vehicle boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft',
  approval_note text,
  approved_by text,
  approved_at timestamptz,
  driver_name text,
  vehicle_plate text,
  vehicle_type text,
  fuel_estimate numeric(14,2) DEFAULT 0,
  toll_estimate numeric(14,2) DEFAULT 0,
  allocated_by text,
  allocated_at timestamptz,
  per_diem_total numeric(14,2) DEFAULT 0,
  transport_total numeric(14,2) DEFAULT 0,
  petty_cash_amount numeric(14,2) DEFAULT 0,
  grand_total numeric(14,2) DEFAULT 0,
  petty_cash_holder_id text,
  petty_cash_holder_name text,
  cost_note text,
  cost_calculated_by text,
  cost_calculated_at timestamptz,
  template_uploaded boolean NOT NULL DEFAULT false,
  template_data jsonb,
  work_result text,
  pending_task text,
  next_project text,
  receipts jsonb NOT NULL DEFAULT '[]'::jsonb,
  realization_total numeric(14,2) DEFAULT 0,
  report_submitted_by text,
  report_submitted_at timestamptz,
  hr_review_note text,
  completed_by text,
  completed_at timestamptz
);

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_employees" ON employees;
CREATE POLICY "anon_read_employees" ON employees FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_write_employees" ON employees;
CREATE POLICY "anon_write_employees" ON employees FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_employees" ON employees;
CREATE POLICY "anon_update_employees" ON employees FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_read_destinations" ON destinations;
CREATE POLICY "anon_read_destinations" ON destinations FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_write_destinations" ON destinations;
CREATE POLICY "anon_write_destinations" ON destinations FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_select_trips" ON trip_requests;
CREATE POLICY "anon_select_trips" ON trip_requests FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_trips" ON trip_requests;
CREATE POLICY "anon_insert_trips" ON trip_requests FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_trips" ON trip_requests;
CREATE POLICY "anon_update_trips" ON trip_requests FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_trips" ON trip_requests;
CREATE POLICY "anon_delete_trips" ON trip_requests FOR DELETE
  TO anon, authenticated USING (true);

-- Seed employees across all roles and grades
INSERT INTO employees (name, role, grade, position) VALUES
  ('Andi Pratama', 'Employee', 1, 'Staff Marketing'),
  ('Siti Rahma', 'Employee', 2, 'Senior Staff Operations'),
  ('Budi Santoso', 'Employee', 1, 'Staff IT Support'),
  ('Dewi Lestari', 'Employee', 2, 'Senior Analyst'),
  ('Rudi Hartono', 'Manager', 3, 'Marketing Manager'),
  ('Maya Sari', 'Manager', 3, 'Operations Manager'),
  ('Hendra Wijaya', 'Direksi', 4, 'Director of Operations'),
  ('Slamet Riyadi', 'PIC Kendaraan', 1, 'Vehicle Coordinator'),
  ('Rina Wati', 'HR Manager', 3, 'Head of Human Resources')
ON CONFLICT DO NOTHING;

-- Seed destinations with petty cash eligibility
INSERT INTO destinations (name, region, petty_cash_eligible) VALUES
  ('Jakarta', 'Jabodetabek', false),
  ('Bandung', 'Jawa Barat', false),
  ('Surabaya', 'Jawa Timur', true),
  ('Medan', 'Sumatera Utara', true),
  ('Makassar', 'Sulawesi Selatan', true),
  ('Bali (Denpasar)', 'Bali', true),
  ('Balikpapan', 'Kalimantan Timur', true),
  ('Semarang', 'Jawa Tengah', false),
  ('Yogyakarta', 'DI Yogyakarta', false),
  ('Padang', 'Sumatera Barat', true)
ON CONFLICT DO NOTHING;

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trip_requests_set_updated_at ON trip_requests;
CREATE TRIGGER trip_requests_set_updated_at
  BEFORE UPDATE ON trip_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
