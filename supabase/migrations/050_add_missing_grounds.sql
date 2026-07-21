-- Migration: 050_add_missing_grounds
-- Source: legacy "Spartans Hub" Google Sheet, Matches tab (455 real match
-- rows, Jun-2023 through Jul-2026), cross-checked against the live
-- `grounds` table (15 rows). Scope: grounds not present in the Hub DB
-- under any name, restricted to venues actually played at in 2025-2026
-- (dormant 2023/2024-only grounds intentionally excluded — see chat
-- history / PR description for the full comparison).
--
-- grounds.maps_url and grounds.hospital_url are NOT NULL in the live
-- schema, but no real Maps/hospital links exist for these new venues yet.
-- Relaxing both to nullable so rows can be added name-first and backfilled
-- via /admin/grounds — fabricating placeholder URLs would be unsafe, since
-- hospital_url is surfaced to captains for real emergency use (see
-- security.md and squad_selection_announcement.md).
--
-- Inserts are idempotent (WHERE NOT EXISTS on name) so this is safe to
-- re-run.

ALTER TABLE public.grounds
  ALTER COLUMN maps_url DROP NOT NULL,
  ALTER COLUMN hospital_url DROP NOT NULL;

INSERT INTO public.grounds (name)
SELECT v.name
FROM (VALUES
  ('MCG 2.0'),
  ('Chethan Cricket Grounds'),
  ('Mario Sixers'),
  ('Sara Cricket Academy'),
  ('Sara Turf Ground'),
  ('Glanz Cricket Academy'),
  ('Titans Ground'),
  ('Ramaiah Cricket Ground'),
  ('Kreeda Kshetra'),
  ('SCG - Shivaya Cricket Ground'),
  ('Cricket Socials'),
  ('Sachin Tendulkar Turf Ground'),
  ('CricHaven'),
  ('Axi Cricket Park Ground - B'),
  ('Hitzone Cricket Ground'),
  ('PSG-2 Cricket Ground'),
  ('PSG Whitefield'),
  ('BK Cricket Ground 1'),
  ('BK Cricket Ground 2'),
  ('BK Cricket Ground 3'),
  ('Lake View Ground'),
  ('Shaanz 2')
) AS v(name)
WHERE NOT EXISTS (
  SELECT 1 FROM public.grounds g WHERE g.name = v.name
);
