-- ============================================================
-- OmniMatch — Supabase Schema v3
-- ============================================================
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run All
-- ============================================================

-- ── Core Tables ───────────────────────────────────────────────────────────────

create table if not exists donors (
  id                   uuid default gen_random_uuid() primary key,
  name                 text not null,
  mobile               text unique,
  aadhaar              text,
  dob                  date,
  gender               text,
  city                 text,
  pincode              text,
  blood_group          text,
  donor_types          text[] default '{}',   -- ['blood','platelet','marrow','organ','milk']
  hla_type             text[] default '{}',   -- ['A*02:01','B*07:02','C*07:01','DRB1*15:01']
  is_available         boolean default true,
  last_donation_date   date,
  trust_score          integer default 50,
  is_verified          boolean default false,
  lat                  float,
  lng                  float,
  created_at           timestamptz default now()
);

create table if not exists hospitals (
  id           uuid default gen_random_uuid() primary key,
  name         text not null,
  reg_number   text unique,
  license      text,
  address      text,
  city         text,
  contact      text,
  is_verified  boolean default false,
  lat          float,
  lng          float,
  created_at   timestamptz default now()
);

create table if not exists otp_store (
  mobile     text primary key,
  otp        text not null,
  created_at timestamptz default now()
);

-- ── BloodBridge ───────────────────────────────────────────────────────────────

create table if not exists blood_requests (
  id           uuid default gen_random_uuid() primary key,
  hospital_id  uuid references hospitals(id) on delete set null,
  blood_group  text not null,
  units        integer default 1,
  urgency      text default 'urgent',   -- 'critical' | 'urgent' | 'normal'
  status       text default 'open',     -- 'open' | 'fulfilled' | 'closed'
  lat          float,
  lng          float,
  created_at   timestamptz default now()
);

-- ── ThalCare ─────────────────────────────────────────────────────────────────

create table if not exists thal_patients (
  id                           uuid default gen_random_uuid() primary key,
  name                         text not null,
  blood_group                  text,
  dob                          date,
  transfusion_frequency_days   integer default 21,
  hospital_id                  uuid references hospitals(id) on delete set null,
  last_transfusion_date        date,
  next_transfusion_date        date,
  created_at                   timestamptz default now()
);

-- ── PlateletAlert ─────────────────────────────────────────────────────────────

create table if not exists platelet_requests (
  id            uuid default gen_random_uuid() primary key,
  patient_name  text,
  cancer_type   text,
  blood_group   text,
  units         integer default 1,
  hospital_id   uuid references hospitals(id) on delete set null,
  urgency       text default 'urgent',
  status        text default 'open',
  created_at    timestamptz default now()
);

-- ── LastGift (Organs) ─────────────────────────────────────────────────────────

create table if not exists organ_pledges (
  id               uuid default gen_random_uuid() primary key,
  donor_id         uuid references donors(id) on delete cascade,
  organs           text[] default '{}',
  family_consent   boolean default false,
  pledge_card_url  text,
  is_active        boolean default true,
  created_at       timestamptz default now()
);

create table if not exists organ_requests (
  id               uuid default gen_random_uuid() primary key,
  hospital_id      uuid references hospitals(id) on delete set null,
  recipient_name   text,
  organ_needed     text not null,
  urgency_score    integer default 5,
  blood_group      text,
  wait_label       text,   -- e.g. "3.2 yrs"
  status           text default 'waiting',   -- 'waiting' | 'matched' | 'transplanted'
  lat              float,
  lng              float,
  created_at       timestamptz default now()
);

-- ── MilkBridge ────────────────────────────────────────────────────────────────

create table if not exists milk_donors (
  id                    uuid default gen_random_uuid() primary key,
  donor_id              uuid references donors(id) on delete cascade,
  baby_age_months       integer,
  quantity_ml_per_day   integer,
  health_score          integer default 70,
  test_doc_url          text,
  is_available          boolean default true,
  pincode               text,
  city                  text,
  screening_status      text default 'pending',   -- 'pending' | 'cleared' | 'rejected'
  screening_date        date,
  availability_start    time default '08:00',
  availability_end      time default '20:00',
  is_anonymous          boolean default false,
  lat                   float,
  lng                   float,
  mobile                text,
  last_donation_date    date,
  created_at            timestamptz default now()
);

create table if not exists milk_requests (
  id                 uuid default gen_random_uuid() primary key,
  hospital_id        uuid references hospitals(id) on delete set null,
  infant_name        text,
  daily_quantity_ml  integer,
  volume_needed_ml   integer,
  status             text default 'open',
  urgency            text default 'normal',      -- 'critical' | 'urgent' | 'normal'
  pincode            text,
  lat                float,
  lng                float,
  matched_at         timestamptz,
  fulfilled_at       timestamptz,
  created_at         timestamptz default now()
);

create table if not exists milk_bank (
  id               uuid default gen_random_uuid() primary key,
  passport_id      text unique not null,
  donor_id         uuid references donors(id) on delete set null,
  quantity_liters  float,
  pasteurized_date date,
  expiry_date      date,
  status           text default 'Available',   -- 'Available' | 'Reserved' | 'Low Stock' | 'Expired'
  created_at       timestamptz default now()
);

-- Milk donations (Milk Passport tracking)
create table if not exists milk_donations (
  id                    uuid default gen_random_uuid() primary key,
  passport_id           text unique not null,
  donor_id              uuid references donors(id) on delete set null,
  milk_donor_id         uuid references milk_donors(id) on delete set null,
  request_id            uuid references milk_requests(id) on delete set null,
  collection_date       date not null,
  collection_time       time,
  volume_ml             integer not null,
  pasteurized           boolean default false,
  pasteurization_date   date,
  pasteurization_method text,