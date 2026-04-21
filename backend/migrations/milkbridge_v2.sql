-- ============================================================
-- MilkBridge Schema Enhancement v2
-- ============================================================
-- Run after schema.sql to add production-grade MilkBridge tables
-- ============================================================

-- ── Enhance milk_donors table ───────────────────────────────────────────────────
-- Add new columns for comprehensive donor registration

ALTER TABLE milk_donors
ADD COLUMN IF NOT EXISTS pincode text,
ADD COLUMN IF NOT EXISTS city text,
ADD COLUMN IF NOT EXISTS screening_status text DEFAULT 'pending',  -- 'pending' | 'cleared' | 'rejected'
ADD COLUMN IF NOT EXISTS screening_date date,
ADD COLUMN IF NOT EXISTS availability_start time DEFAULT '08:00',
ADD COLUMN IF NOT EXISTS availability_end time DEFAULT '20:00',
ADD COLUMN IF NOT EXISTS is_anonymous boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS lat float,
ADD COLUMN IF NOT EXISTS lng float,
ADD COLUMN IF NOT EXISTS mobile text,
ADD COLUMN IF NOT EXISTS last_donation_date date;

-- ── Enhance milk_requests table ─────────────────────────────────────────────────
-- Add urgency, volume, and location fields matching BloodBridge pattern

ALTER TABLE milk_requests
ADD COLUMN IF NOT EXISTS urgency text DEFAULT 'normal',  -- 'critical' | 'urgent' | 'normal'
ADD COLUMN IF NOT EXISTS pincode text,
ADD COLUMN IF NOT EXISTS volume_needed_ml integer,
ADD COLUMN IF NOT EXISTS lat float,
ADD COLUMN IF NOT EXISTS lng float,
ADD COLUMN IF NOT EXISTS matched_at timestamptz,
ADD COLUMN IF NOT EXISTS fulfilled_at timestamptz;

-- ── Create milk_donations table (Milk Passport tracking) ────────────────────────
-- Tracks each individual donation with full provenance

CREATE TABLE IF NOT EXISTS milk_donations (
  id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  passport_id          text UNIQUE NOT NULL,  -- Human-readable: "MP-2024-001234"
  donor_id             uuid REFERENCES donors(id) ON DELETE SET NULL,
  milk_donor_id        uuid REFERENCES milk_donors(id) ON DELETE SET NULL,
  request_id           uuid REFERENCES milk_requests(id) ON DELETE SET NULL,

  -- Collection info
  collection_date      date NOT NULL,
  collection_time      time,
  volume_ml            integer NOT NULL,

  -- Processing info
  pasteurized          boolean DEFAULT false,
  pasteurization_date  date,
  pasteurization_method text,  -- 'holder' | 'htst' | 'uv'
  expiry_date          date,

  -- Receiving info
  receiving_hospital_id uuid REFERENCES hospitals(id) ON DELETE SET NULL,
  receiving_infant_ref  text,  -- Anonymized: "Baby of Ward 3" or "Infant #42"
  delivered_date       date,

  -- Status tracking
  status               text DEFAULT 'collected',  -- 'collected' | 'processing' | 'pasteurized' | 'in_transit' | 'delivered' | 'expired' | 'rejected'
  quality_check_passed boolean,
  rejection_reason     text,

  -- Metadata
  notes                text,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

-- ── Create milk_matches table ───────────────────────────────────────────────────
-- Track donor-request matches (like BloodBridge matches)

CREATE TABLE IF NOT EXISTS milk_matches (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id   uuid REFERENCES milk_requests(id) ON DELETE CASCADE,
  donor_id     uuid REFERENCES donors(id) ON DELETE SET NULL,
  milk_donor_id uuid REFERENCES milk_donors(id) ON DELETE SET NULL,

  match_score  float,              -- Proximity + availability score
  distance_km  float,

  status       text DEFAULT 'pending',  -- 'pending' | 'notified' | 'accepted' | 'declined' | 'fulfilled' | 'expired'
  notified_at  timestamptz,
  responded_at timestamptz,

  created_at   timestamptz DEFAULT now()
);

-- ── Enable RLS on new tables ────────────────────────────────────────────────────