-- bookings.match_time was nullable and inconsistently set (65 of 162 rows
-- were still null at the time of this migration) — the app previously
-- worked around this with a "match_time || slot_time" fallback scattered
-- across several display and sort call sites. Moving that guarantee into
-- the DB itself so the front end never needs to fall back again:
--
--   1. Backfill every existing null from its own slot_time.
--   2. A BEFORE INSERT/UPDATE trigger fills match_time from slot_time
--      whenever it's left null on a write — this only fills the gap, it
--      never overwrites an already-set match_time, so an admin's explicit
--      override (see .claude/rules/architecture.md §8.1) is untouched.
--   3. NOT NULL lets the DB itself enforce the guarantee going forward.
--      Safe to add immediately after the trigger since a BEFORE ROW
--      trigger runs before the NOT NULL check on the same statement.

update bookings
set match_time = slot_time::text::time
where match_time is null;

create or replace function set_default_match_time()
returns trigger
language plpgsql
as $$
begin
  if new.match_time is null then
    new.match_time := new.slot_time::text::time;
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_default_match_time on bookings;
create trigger bookings_default_match_time
  before insert or update on bookings
  for each row
  execute function set_default_match_time();

alter table bookings
  alter column match_time set not null;
