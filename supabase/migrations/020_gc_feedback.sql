-- Campaign definition (one per feedback round)
CREATE TABLE feedback_campaigns (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  questions    jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by   uuid REFERENCES players(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  closed_at    timestamptz
);

-- One response per player per campaign
CREATE TABLE feedback_responses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     uuid NOT NULL REFERENCES feedback_campaigns(id) ON DELETE CASCADE,
  player_id       uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  collected_by_gc uuid NOT NULL REFERENCES players(id) ON DELETE SET NULL,
  answers         jsonb NOT NULL,
  notes           text,
  collected_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, player_id)
);

-- Soft claim: which GC member intends to collect this player's response
CREATE TABLE feedback_claims (
  campaign_id  uuid NOT NULL REFERENCES feedback_campaigns(id) ON DELETE CASCADE,
  player_id    uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  claimed_by   uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  claimed_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, player_id)
);

-- RLS: full lockdown — no anon or authenticated SELECT policy
ALTER TABLE feedback_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_claims    ENABLE ROW LEVEL SECURITY;

-- Seed the first campaign
INSERT INTO feedback_campaigns (title, questions) VALUES (
  'June 2026 – Club Health Check',
  '["Are you happy overall with the club?",
    "Are you happy with the Captains / Leaders, or do you have any concerns?",
    "What role are you currently performing, and what role do you aspire to?",
    "Are you getting enough opportunities to showcase yourself?",
    "Do you prefer T20 or T30 format?",
    "What preparations are you making to improve in your current or aspiring role?"]'::jsonb
);