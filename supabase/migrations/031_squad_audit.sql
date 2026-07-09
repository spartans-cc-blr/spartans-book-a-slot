-- Migration: 031_squad_audit
-- Append-only audit trail for squad status transitions (submit / GC approve / GC return / announce).
-- Booking-level only — no per-player rows. RLS enabled, no policies — service role only.

create table if not exists squad_audit (
  id         uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  action     text not null check (action in ('submitted', 'approved', 'returned', 'announced')),
  actor_id   uuid references players(id) on delete set null,
  note       text,
  created_at timestamptz not null default now()
);

create index idx_squad_audit_booking_id on squad_audit(booking_id);

alter table squad_audit enable row level security;
-- No anon/authenticated policies — service role only, consistent with availability_audit.
