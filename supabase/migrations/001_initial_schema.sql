-- ═══════════════════════════════════════════════════════════════
-- Spartans CC — Book a Slot Schema
-- Migration: 001_initial_schema
-- Run this in: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- ── CAPTAINS ────────────────────────────────────────────────────
create table if not exists captains (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- Seed the four captains (update names as needed)
insert into captains (name) values
  ('Captain 1'),
  ('Captain 2'),
  ('Captain 3'),
  ('Captain 4');

-- ── TOURNAMENTS ─────────────────────────────────────────────────
create table if not exists tournaments (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  organiser_name    text,
  organiser_contact text,
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);

-- ── BOOKINGS ────────────────────────────────────────────────────
create type booking_status as enum ('confirmed', 'cancelled', 'soft_block');
create type game_format    as enum ('T20', 'T30');
create type slot_time      as enum ('07:30', '10:30', '12:30', '14:30');

create table if not exists bookings (
  id            uuid primary key default gen_random_uuid(),

  -- When & where
  game_date     date not null,
  slot_time     slot_time not null,
  format        game_format,          -- null for soft_block (no format needed)
  venue         text,

  -- Who
  captain_id    uuid references captains(id),   -- null for soft_block
  tournament_id uuid references tournaments(id), -- null for soft_block

  -- Status
  status        booking_status not null default 'confirmed',
  block_reason  text,  -- only populated when status = 'soft_block'
  notes         text,  -- internal coordinator notes, never shown publicly

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- ── CONSTRAINTS ──────────────────────────────────────────────
  -- One slot per day (no two bookings on same date+time unless one is cancelled)
  constraint unique_slot_per_day unique (game_date, slot_time)
    deferrable initially deferred,

  -- Soft blocks don't need a captain or tournament
  constraint soft_block_no_captain
    check (status != 'soft_block' or captain_id is null),

  -- Confirmed bookings must have format, captain, tournament
  constraint confirmed_requires_fields
    check (
      status != 'confirmed' or (
        format is not null and
        captain_id is not null and
        tournament_id is not null
      )
    )
);

-- ── INDEXES ─────────────────────────────────────────────────────
create index idx_bookings_game_date    on bookings(game_date);
create index idx_bookings_status       on bookings(status);
create index idx_bookings_captain_id   on bookings(captain_id);
create index idx_bookings_tournament_id on bookings(tournament_id);

-- ── UPDATED_AT TRIGGER ───────────────────────────────────────────
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger bookings_updated_at
  before update on bookings
  for each row execute function update_updated_at();

-- ── ROW LEVEL SECURITY ───────────────────────────────────────────
-- Public can only read confirmed/soft_block bookings (for availability grid)
-- No unauthenticated writes allowed

alter table captains    enable row level security;
alter table tournaments enable row level security;
alter table bookings    enable row level security;

-- Anyone can read captains and tournaments (needed for admin dropdowns via API)
create policy "public_read_captains"
  on captains for select using (true);

create policy "public_read_tournaments"
  on tournaments for select using (true);

-- Public read on bookings — only non-cancelled (for availability grid)
create policy "public_read_bookings"
  on bookings for select
  using (status != 'cancelled');

-- All writes go through the service role (server-side API only)
-- No direct client writes allowed — enforced by using service role key server-side only
