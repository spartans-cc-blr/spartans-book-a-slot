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

**`cricheroes_player_id` snapshot** — `analytics-db/migrations/002_alias_cricheroes_player_id.sql`
adds a nullable `cricheroes_player_id text` to both `player_name_aliases`
and `match_name_overrides`, alongside `player_id`. Written by the same two
paths that write `player_id` on these tables: the admin `confirm` flow
(`POST /api/admin/player-reconciliation`) and the automatic
`squad_disambiguation` path in `resolvePlayerName()`. In both cases it's
re-derived server-side from the live Hub `players.cricheroes_player_id`
at write time — never client-supplied, same posture as `player_id` itself.
It's a snapshot, not live-synced: if the player links or changes their
CricHeroes URL afterward, the alias/override row isn't retroactively
updated. Nullable and best-effort — most Hub players still don't have a
`cricheroes_player_id` (see §3.1's data-quality note), so a `NULL` here is
expected, not an error state.

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

Three URL shapes, two of which resolve reliably:
- **Direct** (`cricheroes.com/player-profile/<id>/...`) — plain regex
  extraction, no network call.
- **Deep-link landing page** (`crichero.es/?link=<destination>&utm_source=...`) —
  same plain regex extraction (the destination is a literal query
  parameter), no network call. This is what a phone's browser actually
  lands on when a `chshare.link` share link is tapped, before confirming
  "Open in app?" — see the `/profile` field hint, which now tells players
  to copy the URL from the address bar at that point rather than sharing
  the raw link text.
- **Share link** (`chshare.link/player/<code>`) — the CricHeroes app's
  own "Share profile" button only gives this format, and it **does not
  reliably resolve server-side**. `src/lib/cricheroesId.ts` still
  attempts it (bounded 6s, host-restricted `fetch`, spoofed mobile
  User-Agent, body-scan fallback) but production testing (July 2026,
  documented in full in that file's header comment) found `fetch()`
  consistently gets a `200` with an empty-query 404 shell — identical
  across a header-less attempt and a spoofed-browser-UA attempt — which
  has the signature of deliberate anti-automation hardening at the edge
  (Branch.io-style deferred deep links exist specifically to funnel real
  users into installing the app; auto-resolving them programmatically
  undermines that, and CricHeroes' infrastructure appears to treat
  known-cloud-IP traffic accordingly regardless of headers sent). Kept as
  a harmless best-effort path — always returns `null` on failure, never
  blocks the save — rather than removed, but this is not expected to
  start working without CricHeroes changing something on their end.

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

**Missing-CricHeroes-ID prompt** — both the roster search picker and the
fuzzy-suggestion buttons show a small ⚠ next to any Hub player who has no
`cricheroes_player_id` on their profile. Clicking to confirm such a player
triggers a `window.confirm()` explaining that the name→player resolution
will still work correctly (Hub `player_id` is what actually drives
stats/name-link consumers — see §5) but no CricHeroes profile ID will be
captured on the alias/override row for this confirmation. The admin can
proceed anyway (most historical confirms will hit this, since most
`cricheroes_url` values predate direct-URL support — see §3.1) or cancel to
go ask the player to link their profile first.

---

## 5. Consumers

- `src/lib/matchStatsSync.ts` — `syncMatchStatsForBooking()` already uses
  `select('*')` on all four analytics tables, so `player_id` flows into
  `match_stats_cache`'s jsonb columns automatically once reconciled. Rows
  synced before reconciliation just carry `player_id: null` until the next
  sync — expected, not a bug. In practice this "expected" gap turned out to
  be much larger than assumed: an audit on 2026-08-01 found 63 of ~65
  synced bookings carrying at least one stale `player_id: null` for a name
  that *was* already resolved on the analytics side — see
  `features/post-match-scorecard.md` §15's 1 Aug 2026 incident write-up for
  the fleet-wide bulk-patch. **Fixed 22 Aug 2026 — see §5.1**: the gap that
  caused this (no automated re-sync-on-reconcile hook) is closed for the
  common case going forward.
- `src/components/matches/ScorecardTables.tsx` — `findCricHeroesUrl()`
  prefers a `player_id` match against the booking's squad, falling back to
  the old case-insensitive name match only when `player_id` is absent
  (unreconciled historical rows degrade gracefully rather than losing the
  link entirely).
- `src/lib/playerStats.ts` — `getPlayerMatchHistory()` reads `batting_stats`/
  `bowling_stats`/`fielding_stats` filtered by `player_id` directly (the
  `/players/[id]/stats` full match-by-match view). Since a single Hub player
  can have more than one `player_name_aliases` row (CricHeroes has used more
  than one spelling for them across different matches), a match where both
  spellings appear on the same scorecard resolves to *two* rows sharing one
  `(match_id, player_id)` — see §5.2 for the incident this caused and the
  fix.

---

## 5.1 Auto-resolve on sync (added 22 Aug 2026)

**The problem:** an admin correctly assumed that once a scorecard name was
aliased (or overridden, or auto-resolved via squad disambiguation), every
future match containing that name would "just work." It didn't — nothing
in the automated paths ever *applied* an existing alias/override to a new
match's freshly-parsed rows. The Python parser always writes new
`batting_stats`/`bowling_stats`/`fielding_stats`/`team_list` rows with
`player_id: NULL` (it has no notion of the Hub's alias table), and
`syncMatchStatsForBooking()` just read those rows as-is. The *only* place
that ever ran `resolvePlayerName()`/`backfillPlayerIdForName()` was
`/admin/player-reconciliation` — either an admin confirming a name, or
clicking "Run Reconciliation Pass." So even a player aliased months ago
needed the admin to revisit that page after every single new match before
their name resolved — exactly the "why do I have to keep doing this
manually" friction that surfaced this gap.

**The fix:** `autoResolveMatch(analytics, hub, matchId)`
(`src/lib/playerIdentityResolution.ts`) applies steps 1-3 of the precedence
order (§2) — override, alias, squad disambiguation, none of which need an
admin decision — to one match's currently-unresolved scorecard names.
`syncMatchStatsForBooking()` calls it right before reading the analytics
rows for caching, so both the manual "Sync Stats" button and the automated
CricHeroes-fetch cron now self-heal on every sync. An admin only ever needs
`/admin/player-reconciliation` for a genuinely new name (step 4) now —
the "auto_resolved" bucket on that page should stay empty going forward
except in the gap between a name being confirmed and its next sync.

**Why it's batched, not a `resolvePlayerName()` call per name:** that
function does 2+ sequential round trips per name and is fine for the
admin-triggered reconcile flow (client-paced, one name per request), but
`syncMatchStatsForBooking()` runs inside `backfill-scorecards`'s twice-daily
cron under a tight Vercel Hobby timeout budget that has 504'd in production
before (see `features/post-match-scorecard.md` §8's `MAX_PER_RUN` history).
`autoResolveMatch()` instead does one bulk override lookup and one bulk
alias lookup regardless of how many names are unresolved, and only falls
through to squad disambiguation (which needs the roster + squad, fetched
once) and the final per-name backfill writes for whatever's left —
typically a handful of names at most, since most players in any given match
were already resolved via an earlier one.

**Best-effort, same posture as milestone detection**: `autoResolveMatch()`
never throws — any DB hiccup inside it is swallowed and the sync proceeds
exactly as it would have before this fix (i.e. no worse than the
pre-existing behaviour), never blocking the scorecard sync it's attached
to.

**What this doesn't change:** the "Run Reconciliation Pass" self-heal sweep
on `/admin/player-reconciliation` is still needed for one case
`autoResolveMatch()` can't reach — a match that was already synced *before*
a name was resolved. `autoResolveMatch()` only ever looks at *that* sync's
still-unresolved rows; it doesn't retroactively fix a `match_stats_cache`
that's already cached and stale (that's what `resyncBookingsForMatchIds()`
and the admin `confirm`/`reconcile` flows are for). It also doesn't newly
resolve anything for a name CricHeroes has never shown before — that
genuinely needs an admin's one-time confirm, exactly as before.

---

## 5.2 Two aliases resolving to one player within the same match (fixed 5 Sep 2026)

**Symptom:** match_id `24477742` (Mario Turner Flash 5 vs Concorde ManU, 16
Aug 2026 — a real 32-run, 4-wicket performance) was completely missing from
Gunasagar's `/players/[id]/stats` match history, on every tab (Batting,
Bowling, Fielding) — not shown with wrong numbers, just absent entirely.

**Root cause:** `player_name_aliases` correctly has *two* separate rows
pointing at Gunasagar's Hub `player_id` — `"Sagar"` and `"Sagar S"` — both
confirmed legitimately at different times via `/admin/player-reconciliation`,
since CricHeroes has used both spellings for him across different matches.
This one match's CricHeroes scorecard happened to carry rows for *both*
name spellings (`"Sagar"`: batted, 32 runs, 4 wickets; `"Sagar S"`: an
all-zero, non-participating row) — so once resolved, `batting_stats` and
`bowling_stats` in the analytics DB each end up with **two rows sharing the
same `(match_id, player_id)`**, one real and one a zeroed duplicate.

`getPlayerMatchHistory()` (`src/lib/playerStats.ts`) built its per-match
lookup as a plain `new Map(rows.map(r => [r.match_id, r]))`. `fetchAnalyticsRows()`
orders every table by `player_name` ascending, so `"Sagar"` (the real
innings) sorted *before* `"Sagar S"` (the zero row) — and a `Map`, keyed
only by `match_id`, keeps whichever entry is inserted *last*. The zero row
silently overwrote the real one, so `bat.batted`/`bowl.did_bowl` both read
`false` for this match, `m.batting`/`m.bowling` both resolved to `null`, and
`PlayerStatsClient.tsx`'s per-tab filter (`!!m.batting` / `!!m.bowling`)
dropped the match from every tab — not a display-only miscount, the whole
match vanished.

No data was wrong — `player_name_aliases`, `batting_stats`, `bowling_stats`,
and the confirmed Hub `booking` all had correct, complete data throughout.
This was purely an application-layer read bug, same class as
`features/leaderboard.md` §8.1's PostgREST-row-cap incident: the analytics
DB is the source of truth, and the DB doesn't need fixing, only the code
reading it.

**Fix:** `battingByMatch`/`bowlingByMatch`/`fieldingByMatch` in
`getPlayerMatchHistory()` no longer use last-wins `Map` construction. Each
is built by iterating rows explicitly and only overwriting an existing
entry for a `match_id` when the new row shows *more* real participation
than the one already stored (`r.batted && !prev.batted` for batting,
`r.did_bowl && !prev.did_bowl` for bowling, a higher total dismissal count
for fielding) — so a real innings/spell can never be silently replaced by a
zeroed duplicate row, regardless of alphabetical row order. This is a
general fix, not specific to Gunasagar — it protects any player who ends up
with two (or more) scorecard-name aliases that both surface in the same
match.

**Deliberately not touched:** `aggregate()` (career/season totals) and
`getLeaderboard()` still sum every row in the fetched `batting`/`bowling`/
`fielding` arrays without deduping by `(match_id, player_id)` — harmless
here since the duplicate row was all zeros (summing it added nothing), but
it means a *hypothetical* future case where a player's two aliased names
both carry non-zero stats in the same match would double-count their
totals. Not fixed as part of this pass — no such case has actually been
observed, and de-risking `aggregate()`/`getLeaderboard()` against it is a
separate, broader change than the reported symptom (an invisible match)
required. Worth revisiting if a real double-counted total is ever reported.

---

## 6. Explicitly Out of Scope

- Fees, the squad selection/GC approval state machine, and the
  `scorecard_uploads` status lifecycle — untouched.
- No cron for this — reconciliation of a genuinely *new* name is still an
  admin-driven pass, not scheduled. As of §5.1, a name that's already been
  resolved once (alias, override, or squad disambiguation) does resolve for
  free on every subsequent sync — that part of the original claim here is
  now actually true, rather than only true in theory.

---

*Maintained by: Spartans Data Wranglers Team · Coordinator: Muthu, Spartans CC BLR*
