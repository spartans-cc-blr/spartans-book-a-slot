# Analytics DB Migrations

This directory is separate from `supabase/migrations/` at the repo root,
which targets the **Hub** Supabase project. Files here target the
**analytics** Supabase project — a different Supabase project that stores
parsed CricHeroes scorecards (`match_stats`, `batting_stats`,
`bowling_stats`, `fielding_stats`, `team_list`), reachable from Hub API
routes only via `ANALYTICS_SUPABASE_URL` / `ANALYTICS_SUPABASE_KEY` (see
`src/lib/matchStatsSync.ts`).

No Next.js code in this repo runs a migration runner against the analytics
project automatically — these files are applied manually (e.g. via the
Supabase MCP `apply_migration` tool against the analytics project, not the
Hub project). As with the Hub DB's own migration history (see
`.claude/rules/features/post-match-scorecard.md` §5, "Repo/DB drift note"),
a file existing here is not proof it has been applied to the live analytics
project — cross-check with `list_migrations` against the analytics project
after applying.

| File | Purpose |
|---|---|
| `001_player_identity_resolution.sql` | Adds nullable `player_id` to `batting_stats`/`bowling_stats`/`fielding_stats`/`team_list`, plus `player_name_aliases`, `match_name_overrides`, `ignored_names` — see `.claude/rules/features/player-identity-resolution.md` |
| `002_alias_cricheroes_player_id.sql` | Adds nullable `cricheroes_player_id` to `player_name_aliases`/`match_name_overrides` — snapshots the Hub player's linked CricHeroes profile ID alongside `player_id` at confirmation time |
| `003_batting_bowling_innings_flags.sql` | Adds `batting_stats.batted` / `bowling_stats.did_bowl` booleans — explicit ground truth for whether a squad member actually got a batting/bowling innings that match, replacing the `dismissal_method = 'did_not_bat'` sentinel and `overs = 0` heuristic respectively |
| `004_bowling_order.sql` | Adds `bowling_stats.bowling_order` — the real order bowlers appeared in CricHeroes' own bowling table (`spartans-python` previously discarded this and wrote bowlers out in batting-lineup order instead). Nullable; only populated on re-sync — see `.claude/rules/features/post-match-scorecard.md` |
| `005_fall_of_wickets.sql` | New `fall_of_wickets` table — one row per wicket (team score, over, dismissed player) parsed from the scorecard PDF's own Fall of Wickets section, Spartans innings only. No `player_id` column — resolved at read time by joining `player_name` to the same match's `batting_stats` row. Raw-facts source for the partnerships feature — see `.claude/rules/features/partnerships.md` |
