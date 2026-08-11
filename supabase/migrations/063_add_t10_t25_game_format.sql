-- T10/T25 informal quick-game formats — see .claude/rules/architecture.md and
-- features/... PR that widened the app-layer GameFormat type. bookings.format
-- is a native Postgres enum (created in 001_initial_schema.sql), so the
-- TypeScript-level type widening alone doesn't let these values be written —
-- this migration is the missing piece (caught live via a "invalid input value
-- for enum game_format: T10" error on /admin/bookings/[id]).
alter type game_format add value if not exists 'T10';
alter type game_format add value if not exists 'T25';
