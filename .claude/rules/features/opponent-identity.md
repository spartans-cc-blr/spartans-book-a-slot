# Opponent Identity — auto-created opponents, merge, analytics mirror

**Spartans Hub · Added: October 2026**

---

## 1. Why

`bookings.opponent_name` is free text. Team Record, match planning and the analytics DB all need a
stable opponent id, but the reconciliation queue on `/opponents` (see `team-stats.md` §5) left most
spellings unlinked. Rather than reconcile 100+ spellings up front, every unlinked spelling becomes
its **own opponent** (`opponents.auto_created = true`) and duplicates are merged later.

## 2. Behaviour

- **Auto-create:** `resolveOrCreateOpponentIdByName()` (`src/lib/opponents.ts`) resolves a spelling via
  aliases/canonical name, else inserts an opponent (display name = trimmed, whitespace-collapsed) and
  links the spelling. Used by `POST /api/bookings` and `PATCH /api/bookings/[id]`, so new bookings
  never end up unlinked. Never throws; returns null on failure.
- **Reviewed vs auto:** editing an opponent on `/opponents` (PATCH) clears `auto_created`. The Master
  list has Reviewed / Auto-created / All tabs and an "auto" chip; a non-empty search ignores the tab.
- **Merge:** `POST /api/opponents/merge` `{ source_id, target_id }` (captain/GC/wrangler/admin,
  `captainWrite` rate limit). `mergeOpponents()` moves aliases and bookings to the target, re-adds the
  source name as an alias, combines fields (`mergeOpponentFields()`: marquee = either, URL = target
  else source, notes joined with " · ", `auto_created` only if both were), then deletes the source.
- **Backfill (3 Oct 2026, SQL, one-off):** 112 opponents auto-created, Hub `opponents` = 135,
  `opponent_aliases` = 138, 0 confirmed bookings with a name but no id.

## 3. Analytics mirror

The analytics DB can't join to the Hub, so `opponents_ref(opponent_id, name, is_marquee, auto_created)`
(`analytics-db/migrations/017_opponents_ref.sql`) mirrors it, and `match_dimensions.opponent_id`
carries each match's opponent. `match_coverage` exposes `opponent_id` and `opponent_canonical`.

`src/lib/opponentMirror.ts`: `mirrorOpponent()` upserts the ref row and repoints `match_dimensions`
for that opponent's synced bookings; `dropOpponentRef()` removes a merged-away source. Called from
the opponent create/edit/link/merge routes and from `syncMatchStatsForBooking()`. Best-effort,
never throws. All 141 synced matches were backfilled into `match_dimensions` with opponent ids.

## 4. Migrations

`supabase/migrations/084_opponents_auto_created.sql` (Hub) and
`analytics-db/migrations/017_opponents_ref.sql` (analytics) were applied live via SQL.

## 5. Security

Routes re-check role server-side; Zod `opponentMergeSchema` (`.strict()`); `opponents_ref` has RLS on
with no policies and is revoked from anon/authenticated; service role only.

## 6. File map

| File | Role |
|---|---|
| `src/lib/opponents.ts` (+ `.test.ts`) | Resolve/create, merge, field merge |
| `src/lib/opponentMirror.ts` | Analytics mirror |
| `src/app/api/opponents/merge/route.ts` | Merge endpoint |
| `src/components/opponents/OpponentsClient.tsx` | Tabs, auto chip, Merge action |

---

*Maintained by: Spartans CC BLR*
