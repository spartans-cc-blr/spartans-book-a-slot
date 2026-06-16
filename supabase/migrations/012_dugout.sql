-- ═══════════════════════════════════════════════════════════════
-- Spartans CC — The Dugout Feature
-- Migration: 012_dugout
-- Tables: jersey_orders, dugout_settings, gear_listings
-- ═══════════════════════════════════════════════════════════════

-- ── JERSEY ORDERS ───────────────────────────────────────────────
create table jersey_orders (
  id             uuid        primary key default gen_random_uuid(),
  player_id      uuid        not null references players(id) on delete cascade,
  jersey_name    text        not null,
  jersey_number  integer     not null check (jersey_number >= 0 and jersey_number <= 999),
  jersey_size    text        not null check (jersey_size in ('XS','S','M','L','XL','XXL')),
  notes          text,
  status         text        not null default 'pending'
                             check (status in ('pending','submitted','delivered','received')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- One active order per player (excludes 'received' — completed orders are inert)
create unique index idx_jersey_orders_one_active_per_player
  on jersey_orders (player_id)
  where status in ('pending','submitted','delivered');

-- ── DUGOUT SETTINGS ─────────────────────────────────────────────
-- Single-row table enforced by PK default + CHECK constraint
create table dugout_settings (
  id                   integer     primary key default 1 check (id = 1),
  kit_room_batch_date  date,
  updated_at           timestamptz not null default now()
);

insert into dugout_settings default values
  on conflict do nothing;

-- ── GEAR LISTINGS ───────────────────────────────────────────────
create table gear_listings (
  id          uuid        primary key default gen_random_uuid(),
  player_id   uuid        not null references players(id) on delete cascade,
  type        text        not null check (type in ('wanted','for_sale')),
  condition   text        check (condition in ('new','good','fair')),
  title       text        not null check (char_length(title) between 5 and 100),
  description text        not null check (char_length(description) between 10 and 500),
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- condition is mandatory when the listing is for sale
  constraint gear_listings_condition_required_for_sale
    check (type != 'for_sale' or condition is not null)
);

-- ── ROW LEVEL SECURITY ───────────────────────────────────────────
-- All three tables are service-role-only, consistent with the players,
-- availability, and squad tables: no anon or authenticated client policies
-- are defined. All reads and writes are performed server-side via the
-- service role key, which bypasses RLS entirely. Adding explicit policies
-- here would widen the attack surface without benefit.

alter table jersey_orders    enable row level security;
alter table dugout_settings  enable row level security;
alter table gear_listings    enable row level security;

-- ── UPDATED_AT TRIGGERS ──────────────────────────────────────────
-- Reuses update_updated_at() defined in 001_initial_schema.sql

create trigger jersey_orders_updated_at
  before update on jersey_orders
  for each row execute function update_updated_at();

create trigger gear_listings_updated_at
  before update on gear_listings
  for each row execute function update_updated_at();

create trigger dugout_settings_updated_at
  before update on dugout_settings
  for each row execute function update_updated_at();  

-- ── INDEXES ──────────────────────────────────────────────────────
create index idx_jersey_orders_player_id on jersey_orders(player_id);
create index idx_jersey_orders_status    on jersey_orders(status);

create index idx_gear_listings_player_id  on gear_listings(player_id);
create index idx_gear_listings_type       on gear_listings(type);
create index idx_gear_listings_created_at on gear_listings(created_at desc);
