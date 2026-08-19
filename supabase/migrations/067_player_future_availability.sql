-- 067_player_future_availability.sql
-- Slot-level availability for dates that don't have a booking yet.
-- Distinct from `availability` (which requires a real booking_id).
-- Purpose: let getSuggestedOpenDates()/getSuggestedSlotDates() know whether
-- a tournament's leading captain can actually lead a game on a candidate
-- date/slot, and let *every* player pre-fill attendance ahead of
-- scheduling for a fuller adoption picture — not just captains.

create table player_future_availability (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references players(id) on delete cascade,
  game_date   date not null,
  slot_time   text not null check (slot_time in ('07:30','10:30','12:30','14:30')),
  response    text not null check (response in ('Y','O','E','L')),
  updated_at  timestamptz not null default now(),
  unique (player_id, game_date, slot_time)
);

create index idx_pfa_player    on player_future_availability(player_id);
create index idx_pfa_date_slot on player_future_availability(game_date, slot_time);

alter table player_future_availability enable row level security;
-- No anon/authenticated policy — service-role only, same lockdown as
-- `availability` and `fee_exemptions`. All access goes through the API route.

create trigger set_pfa_updated_at
  before update on player_future_availability
  for each row execute function update_updated_at();
