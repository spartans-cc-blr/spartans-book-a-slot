-- Club records broken by a freshly-synced scorecard (highest total, best
-- chase, highest score, best bowling, partnership by wicket). Admin-only inbox:
-- the admin reviews each break and either shares it to the club WhatsApp group
-- or ignores it. See .claude/rules/features/record-breaking.md.
CREATE TABLE IF NOT EXISTS record_breaks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  record_key    text NOT NULL,                 -- e.g. 'partnership_w3', 'highest_score'
  scope_key     text NOT NULL,                 -- e.g. 'alltime|T20', '2026|T20'
  title         text NOT NULL,
  scope_label   text NOT NULL,
  holder        text NOT NULL,
  display       text NOT NULL,
  prev_holder   text,
  prev_display  text,
  game_date     date NOT NULL,
  opponent_name text,
  message       text NOT NULL,                 -- ready-to-send WhatsApp text
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','shared','ignored')),
  decided_by    text,
  decided_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- A re-sync of the same match can never log the same break twice.
  UNIQUE (booking_id, record_key, scope_key)
);

CREATE INDEX IF NOT EXISTS record_breaks_status_created_idx
  ON record_breaks (status, created_at DESC);

-- Service role only (admin routes) — no anon/authenticated policies.
ALTER TABLE record_breaks ENABLE ROW LEVEL SECURITY;
