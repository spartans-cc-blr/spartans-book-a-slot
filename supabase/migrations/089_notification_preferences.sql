-- Per-player notification preferences ("My Notifications" on /profile).
-- One row per (player, key). A MISSING row means "on" (opted in), so existing
-- players are unaffected until they change something. Keys are defined in
-- src/lib/notificationPrefs.ts; locked categories (squad announced, wallet)
-- are never stored and never checked.
-- Dynamic keys: 'newmatch_t:<tournament uuid>' = follow/unfollow one tournament.
CREATE TABLE IF NOT EXISTS notification_preferences (
  player_id  uuid        NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  key        text        NOT NULL CHECK (char_length(key) BETWEEN 3 AND 80),
  enabled    boolean     NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, key)
);

-- Lookups are "muted rows for these players" — partial index keeps it tiny.
CREATE INDEX IF NOT EXISTS notification_preferences_muted_idx
  ON notification_preferences (player_id) WHERE enabled = false;

-- Service role only, same blanket-deny pattern as the rest of the app.
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
