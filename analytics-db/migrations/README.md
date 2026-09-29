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
| `006_fall_of_wickets_retirement.sql` | Adds `fall_of_wickets.is_retirement` / `returning_player_name` — a batter retiring hurt and later returning to the crease, which `computePartnerships()`'s crease-pointer walk previously had no way to express. Never written by `spartans-python` — always set by a direct, human-verified DB correction — see `.claude/rules/features/partnerships.md` §4.4 |
| `007_opponent_fall_of_wickets.sql` | New `opponent_fall_of_wickets` table — the mirror of `fall_of_wickets` for the OPPONENT's own innings, each wicket additionally credited with the dismissing Spartans `bowler_name` (parsed from the same "how out" text already feeding `bowling_stats`'s aggregate dismissal-type counts — no new PDF parsing). Raw facts only; no derivation or UI built on top of it yet — see `.claude/rules/features/partnerships.md` §11 |
| `008_batting_style.sql` | Adds `batting_stats.batting_style` / `opponent_fall_of_wickets.batting_style` — RHB/LHB, parsed from the raw scorecard name's own `"(RHB)"`/`"(LHB)"` annotation before name-stripping discards it. Raw facts only — see `.claude/rules/features/partnerships.md` §12 |
| `009_match_extras.sql` | Adds `match_stats.extras_byes` / `extras_leg_byes` / `extras_wides` / `extras_no_balls` / `extras_total` — the Extras breakdown Spartans conceded while bowling, parsed from the opponent innings' own "Extras:" line. `extras_wides`/`extras_no_balls` are match-level aggregates, distinct from the existing per-bowler `bowling_stats.wides`/`no_balls`. One-directional by design — extras Spartans received while batting aren't captured. See `.claude/rules/features/scorecard-raw-data-capture.md` |
| `010_fow_dismissal_detail.sql` | Adds `dismissal_type`/`bowler_name`/`fielder_name` to `fall_of_wickets` (Spartans' own side had none of the three before this) and `dismissal_type`/`fielder_name` to `opponent_fall_of_wickets` (which already had `bowler_name`/`batting_style`). Same `DismissalParser` call both tables already run (or, for `fall_of_wickets`, now newly run) for their existing columns — no new PDF parsing. Raw capture only, kept for future need rather than a specific current metric — see `.claude/rules/features/scorecard-raw-data-capture.md` §5 |
