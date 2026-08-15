-- Add all missing columns to biz_trips to match the new app schema.
-- The table was created by an older migration with a different shape;
-- CREATE TABLE IF NOT EXISTS was a no-op so new columns never got added.
-- Only ADD COLUMN is used (no drops, no type changes) to preserve data.

ALTER TABLE biz_trips ADD COLUMN IF NOT EXISTS origin_custom text;
ALTER TABLE biz_trips ADD COLUMN IF NOT EXISTS total_days integer NOT NULL DEFAULT 1;
ALTER TABLE biz_trips ADD COLUMN IF NOT EXISTS vehicle_type_choice text;
ALTER TABLE biz_trips ADD COLUMN IF NOT EXISTS petty_cash_holder text;
ALTER TABLE biz_trips ADD COLUMN IF NOT EXISTS kp_scheme text NOT NULL DEFAULT 'KP2';
ALTER TABLE biz_trips ADD COLUMN IF NOT EXISTS assigned_vehicle_id uuid;
ALTER TABLE biz_trips ADD COLUMN IF NOT EXISTS assigned_driver_id uuid;
ALTER TABLE biz_trips ADD COLUMN IF NOT EXISTS vehicle_km integer;
ALTER TABLE biz_trips ADD COLUMN IF NOT EXISTS fuel_cost numeric NOT NULL DEFAULT 0;
ALTER TABLE biz_trips ADD COLUMN IF NOT EXISTS etoll_cost numeric NOT NULL DEFAULT 0;
ALTER TABLE biz_trips ADD COLUMN IF NOT EXISTS settlement_number text;
ALTER TABLE biz_trips ADD COLUMN IF NOT EXISTS hr_notes text;
ALTER TABLE biz_trips ADD COLUMN IF NOT EXISTS submitted_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE biz_trips ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE biz_trips ADD COLUMN IF NOT EXISTS reject_reason text;
ALTER TABLE biz_trips ADD COLUMN IF NOT EXISTS reject_by text;
ALTER TABLE biz_trips ADD COLUMN IF NOT EXISTS cancel_reason_category text;
ALTER TABLE biz_trips ADD COLUMN IF NOT EXISTS cancel_reason_detail text;
ALTER TABLE biz_trips ADD COLUMN IF NOT EXISTS review_justification text;

-- needs_vehicle is boolean in the old schema; the new app stores the
-- transport choice string in vehicle_type_choice (added above) and sends
-- a boolean to needs_vehicle. No type change needed.
