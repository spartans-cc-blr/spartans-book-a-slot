-- Migration: 034_drop_bookings_public_read_policy
-- HIGH security fix: bookings_public_read (qual: true) was OR'd against
-- public_read_bookings (qual: status <> 'cancelled'), neutralizing the
-- cancelled-booking restriction. Every row including cancelled bookings
-- was effectively publicly readable via the anon key. Drop the redundant
-- unconditional policy so public_read_bookings' restriction actually applies.

drop policy "bookings_public_read" on public.bookings;
