-- 048_gc_announcements.sql
-- Audit trail for GC-authored broadcast push announcements
-- (see src/app/api/gc/announcements/route.ts). One row per send — never
-- updated, never deleted; the record of what actually went out to every
-- subscribed player's phone.

CREATE TABLE IF NOT EXISTS gc_announcements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sent_by         uuid NOT NULL REFERENCES players(id),
  title           text NOT NULL,
  body            text NOT NULL,
  -- Nullable — only set when the AI polish step was used and the sender's
  -- original draft differed from what was actually sent. Lets the history
  -- view show "before/after" for accountability, without implying every
  -- announcement was AI-touched.
  original_body   text,
  recipient_count integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gc_announcements_created_at ON gc_announcements(created_at DESC);

-- Service-role only, no anon/authenticated policies — same blanket-deny
-- pattern as every other table in this project. All access goes through
-- src/app/api/gc/announcements/route.ts.
ALTER TABLE gc_announcements ENABLE ROW LEVEL SECURITY;
