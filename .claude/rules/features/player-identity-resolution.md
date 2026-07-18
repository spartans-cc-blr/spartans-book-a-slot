# Player Identity Resolution — Feature Summary

**Spartans Hub · Added: July 2026**

---

## 1. Overview

The analytics DB (separate Supabase project — `ANALYTICS_SUPABASE_URL`/`KEY`,
see `features/post-match-scorecard.md`) stores parsed CricHeroes scorecards
keyed by `match_id` (text) + `player_name` (text) only — there is no player
identity in that database. This feature resolves each `player_name` string
to a Hub `players.id`, admin-confirmed where needed, so stats can be
aggregated by player rather than by a fragile name string.

**This is not the match-linkage pipeline.** `bookings.match_id` →
`match_stats_cache` already works end to end (see
`features/post-match-scorecard.md`) and is untouched by this feature. This
feature closes a different gap: *within* an already-linked match, which
Hub player does `"Muthu"` or `"Manohar Reddy"` refer to.

Two known failure modes of the old `ScorecardTables.tsx` case-insensitive
name match this replaces:
1. A player renames themselves on CricHeroes over time (e.g. "Muthu" →
   "Muthukumar") — the old string match silently stops linking.
2. Two Hub members share an identical or near-identical name (e.g. two
   "Manohar Reddy"s) — the old string match can't disambiguate at all.

---

## 2. Resolution Precedence

Tried per `(match_id, scorecard_name)`, in `src/lib/playerIdentityResolution.ts`:

| Step | Source | Automatic? |
|---|---|---|
| 1 | `match_name_overrides` — exact `(match_id, scorecard_name)` | Yes, once written |
| 2 | `player_name_aliases` — exact `scorecard_name`, applies to every match | Yes, once written |
| 3 | Squad disambiguation — scorecard_name maps to 2+ Hub players by exact name, and exactly one of them is in that match's `squad` | **Fully automatic** — writes a `match_name_overrides` row with `resolved_via = 'squad_disambiguation'`, no admin action |
| 4 | Unresolved | Surfaced in `/admin/player-reconciliation` |

Steps 1 and 2 require an admin to have confirmed a resolution once (via
`POST /api/admin/player-reconciliation` mode `confirm`). Step 3 is the only
resolution that can happen with zero admin input — it only fires on a
genuine same-name collision that the match's own squad can settle.

Fuzzy suggestion ranking (for the admin picker only, never for
auto-resolution) reuses the Levenshtein approach from
`src/app/api/wrangler/parse-announcement/route.ts`, extracted into
`src/lib/nameMatch.ts` so both routes share one implementation.

---

## 3. Database — Analytics DB Only

See `analytics-db/migrations/001_player_identity_resolution.sql` (a
different migrations directory from `supabase/migrations/`, which targets
the Hub DB — see `analytics-db/migrations/README.md`).

| Table/column | Purpose |
|---|---|
| `batting_stats.player_id`, `bowling_stats.player_id`, `fielding_stats.player_id`, `team_list.player_id` | Nullable `uuid`. Hub `players.id` — **not a real Postgres FK** (separate Supabase projects can't share one). Referential validity enforced only in `POST /api/admin/player-reconciliation`, which validates every `player_id` against the live Hub `players` table before writing it. |
| `player_name_aliases` | `scorecard_name` (unique) → `player_id`. Global default resolution. |
| `match_name_overrides` | `(match_id, scorecard_name)` → `player_id`. Takes precedence over aliases — for per-match collisions. |
| `ignored_names` | Names confirmed to never be a Hub member (almost always an opponent player). Excluded from the reconciliation queue. |

RLS: same "service-role only, no anon/authenticated policy" pattern as
`scorecard_uploads`/`match_stats_cache` (see
`features/post-match-scorecard.md` §5). Every read/write goes through
`ANALYTICS_SUPABASE_KEY` inside Hub API routes only.

---

## 3.1 Hub-side CricHeroes Player ID (`players.cricheroes_player_id`)

**A different, Hub-side identifier — not used for auto-matching.** Added
July 2026 (`supabase/migrations/047_cricheroes_player_id.sql`) as a
nullable `text` column, auto-extracted server-side from
`players.cricheroes_url` whenever that field is saved. Never accepted
directly from the client — `src/lib/cricheroesId.ts`'s
`withCricheroesPlayerId()` derives it and both player-write routes
(`/api/players/[id]` PATCH, `/api/players` POST/PATCH) explicitly strip
any client-supplied `cricheroes_player_id` before calling it. A partial
unique index prevents two Hub members from ever sharing one CricHeroes
profile ID.

Two URL shapes, two resolution paths:
- **Direct** (`cricheroes.com/player-profile/<id>/...`) — plain regex
  extraction, no network call.
- **Share link** (`chshare.link/player/<code>`) — CricHeroes' own
  short-link redirector. The ID isn't in the short link itself, so the
  server does a bounded (6s), host-restricted (`chshare.link` only)
  `fetch(url, { redirect: 'follow' })` and regexes the ID out of wherever
  it actually lands. Best-effort throughout — any failure (timeout,
  unreachable, non-CricHeroes redirect target) returns `null` rather than
  failing the save; a player can always just re-save to retry.

**Why this doesn't close the analytics-DB auto-matching gap:** the
scorecard PDF pipeline (`spartans-python`, a separate repo) only extracts
`player_name` text from CricHeroes' static scorecard PDF — there is no
per-player CricHeroes ID anywhere in the analytics DB to join this Hub-side
ID against. So today this is a **manual cross-check aid only**: the admin
reconciliation UI (`/admin/player-reconciliation`) shows a ↗ link next to
each suggested Hub player (and in the manual roster search) linking
straight to their CricHeroes profile, so the admin can eyeball that it's
really the same person before confirming — see §4. Whether real ID-based
auto-matching is ever feasible would require investigating
`spartans-python`'s parsing pipeline for an alternative CricHeroes source
that does carry player IDs (e.g. a team roster endpoint) — not attempted
as part of this work.

**Data quality note:** most existing `cricheroes_url` values in the Hub
predate this feature and are `chshare.link` share links (the WhatsApp
"share my profile" format), not direct profile URLs — some were even
saved with the whole share message pasted in, not just the URL. Existing
rows are not backfilled by the migration; `cricheroes_player_id` populates
passively as players next save their profile (or immediately for the
handful of already-direct `cricheroes.com` URLs, backfilled once via a
plain SQL regex — no network call needed for that subset).

---

## 4. Admin Reconciliation — `/admin/player-reconciliation`

Admin-only (`requireAdmin()`, same pattern as every other `/admin/*` route).

**`GET /api/admin/player-reconciliation`** — read-only. Scans all four
analytics tables for `player_id IS NULL` rows, groups by `player_name`,
excludes `ignored_names`, and buckets each distinct name:
- **Ready to backfill** — already covered by an alias or per-match override;
  no admin decision needed, just a write-through.
- **Needs a decision** — no existing resolution, but fuzzy suggestions
  exist against the Hub roster.
- **No suggestion** — likely an opponent player, never a Hub member.

**`POST /api/admin/player-reconciliation`** — three modes:
- `confirm` — admin picks a `player_id` for a `scorecard_name`, `scope:
  'global'` (writes `player_name_aliases`) or `scope: { match_id }` (writes
  `match_name_overrides`, for collisions a global alias can't express).
  `player_id` is always re-validated against the live Hub `players` table
  server-side — an admin's browser is still "the client."
- `ignore` — marks a name as a known non-member.
- `reconcile` — processes one name: re-applies any already-known
  resolution to its remaining `NULL` rows (self-healing for rows added
  since the alias/override was confirmed), and attempts squad
  disambiguation (step 3) for anything still unresolved.

**"Run Reconciliation Pass"** on the admin page calls `reconcile` once per
pending name, client-paced ~1.5s apart — same one-item-per-POST shape as
`/admin/scorecard-backfill`, but a shorter delay since these are analytics-DB
writes, not CricHeroes-courtesy fetches.

---

## 5. Consumers

- `src/lib/matchStatsSync.ts` — `syncMatchStatsForBooking()` already uses
  `select('*')` on all four analytics tables, so `player_id` flows into
  `match_stats_cache`'s jsonb columns automatically once reconciled. Rows
  synced before reconciliation just carry `player_id: null` until the next
  sync — expected, not a bug.
- `src/components/matches/ScorecardTables.tsx` — `findCricHeroesUrl()`
  prefers a `player_id` match against the booking's squad, falling back to
  the old case-insensitive name match only when `player_id` is absent
  (unreconciled historical rows degrade gracefully rather than losing the
  link entirely).

---

## 6. Explicitly Out of Scope

- Fees, the squad selection/GC approval state machine, and the
  `scorecard_uploads` status lifecycle — untouched.
- No cron for this — reconciliation is an admin-driven pass, not scheduled.
  A name only needs handling once; new matches for an already-aliased name
  resolve for free via step 2.

---

*Maintained by: Spartans Data Wranglers Team · Coordinator: Muthu, Spartans CC BLR*
