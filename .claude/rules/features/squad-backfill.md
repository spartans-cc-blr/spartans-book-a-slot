# Squad Backfill — `/wrangler/backfill-squad`

**Spartans Hub · Added: (undated, pre-existing) · This doc added: September 2026**

---

## 1. Overview

`/wrangler/backfill-squad` lets a wrangler/admin paste a historic WhatsApp
squad-announcement message and reconstruct the `squad` table rows for a
booking whose squad was never entered through Captains' Corner — usually
because the match predates squad selection in the Hub, or predates the Hub
entirely. This is what `features/post-match-scorecard.md` §15's "top
performer" grant and `features/partnerships.md`'s crease-pointer algorithm
both quietly depend on having populated: without a `squad` row, a synced
scorecard can still display, but nothing on it can be attributed to a
specific match role, and the verify/flag/MVP-share paths that key off
`squad` fall back to wrangler/admin-only.

This doc was written retroactively — the feature (parse + preview + save)
predates it, and previously had no dedicated `features/*.md` entry, only
passing mentions elsewhere. §3 below (quick-add a historic player inline)
is the one genuinely new capability, added September 2026.

---

## 2. Flow

1. **Paste** the WhatsApp text into `BackfillSquadClient.tsx`'s textarea,
   tap Parse.
2. **`POST /api/wrangler/parse-announcement`** (read-only) —
   `parseAnnouncement()` extracts each named player + their C/VC/WK roles,
   and resolves the target booking via a three-step fallback chain: a
   `/fixtures/<uuid>` link in the text, then a CricHeroes match-id match
   against `bookings.match_id`, then a day+month+format match against
   `bookings` (ambiguous or empty results hand the wrangler a manual
   picker rather than guessing). Each parsed name is resolved against the
   full `players` roster by exact normalised-name match
   (`normaliseName()`/`byNormalisedName`, `src/lib/nameMatch.ts`), with up
   to 3 fuzzy suggestions (`suggestPlayers()`, same Levenshtein helper
   `/admin/player-reconciliation` uses) for anything that didn't match
   exactly.
3. **Preview & resolve** — every row that didn't auto-match shows a
   dropdown (fuzzy suggestions first, else the full roster) so the
   wrangler can hand-pick the right player, or — as of September 2026 —
   create one inline when none of the current roster is actually the
   right person (§3).
4. **`POST /api/wrangler/backfill-squad`** — only once every row has a
   `player_id` (`allResolved`). Deletes any existing `squad` rows for the
   booking (behind an explicit "Overwrite existing rows" confirmation) and
   re-inserts the parsed set with `status: 'announced'` and the parsed
   C/VC/WK flags. Logs a `squad_audit` row (`action: 'announced'`, actor =
   the wrangler, note "backfilled from WhatsApp announcement").

---

## 3. Quick-add a historic player (added September 2026)

### The gap

`squad.player_id` is a required FK — the preview table's "Confirm & Save"
stays disabled until every row resolves to a real `players.id`, and the
roster dropdown only ever offers players who already have a Hub account.
For a match old enough to predate the Hub (the motivating case: matches
being backfilled from ~7 years ago), a real name from the announcement
text can have **no match at all** — a player who's since left the club, or
a one-off guest — with no way to proceed. There was no inline escape
hatch; the only route was to abandon the backfill, go create the player
via `/admin/players`, then come back and re-paste.

### Design

**Priority is stats correctness for players who are still around, not
identity-preservation for every one-off name from a decade ago.** A
placeholder `players` row exists purely so the FK is satisfiable and the
match's squad (and, downstream, its `match_stats_cache`/partnerships/
top-performer data — see `features/post-match-scorecard.md` §15 and
`features/partnerships.md`) is complete; it's never meant to be a real,
signed-in member.

Each unmatched row in the preview table now has a **"＋ New player — not
in current roster"** toggle beneath its dropdown, opening an inline
name field. Creating it:

1. Calls **`POST /api/wrangler/quick-add-player`** (`isWrangler ||
   isAdmin`, `RATE_LIMITS.captainWrite`, Zod-validated
   `quickAddPlayerSchema`).
2. The route is **idempotent on an exact normalised-name match** — it
   reuses the same `normaliseName()`/exact-match approach
   `parse-announcement` already uses to auto-resolve a scorecard name, so
   re-submitting the same historic player's name from a second backfilled
   match returns the same row instead of creating a duplicate.
3. Otherwise inserts a minimal `players` row: `name`, `status:
   'inactive'`, `is_captain: false`, `is_gc: false`, `is_wrangler: false`,
   `wallet_balance: 0`. Every other field (`gmail_id`, `whatsapp`, DOB,
   `cricheroes_url`, …) is left `NULL` — there's nothing to fill in for
   someone who'll never sign into the Hub.
4. The new player is merged into the client's roster state
   (`addedPlayers`, kept separate from the parse response's own `roster`
   snapshot) and auto-selected for that row, labelled "(new)" in the
   dropdown so it's visually distinct from an existing match.

### Deliberately *not* a thin wrapper around `POST /api/players`

The existing admin add-player route (`src/app/api/players/route.ts`)
defaults a new player to `status: 'active'` and — more importantly — fires
a club-wide **"🎉 Welcome to the Club!"** push to every subscribed player
(`notifyAllSubscribed`, see `features/push-notifications.md`). Right for a
genuine new recruit; actively wrong for someone being retroactively logged
against a match from years ago. `quick-add-player` is its own small route
specifically so:

- **`status: 'inactive'` from creation**, not the normal `active` default
  — so the placeholder doesn't show up in `/players` (default filter is
  Active, `features/player-directory.md`), Captains' Corner selection, or
  active-roster counts. The `sync-player-status` cron (`features/gc-players.md`
  §4) will never move it *back* to `active` either — it only ever flips a
  player to `active` off a real `Y`/`O`/`E` availability signal, which a
  placeholder with no login will never produce.
- **No push notification of any kind.**

### Why a real `players` row, not a bare text name on the squad row

The alternative — letting a `squad` row reference a plain string with no
`player_id` — was considered and rejected: `squad.player_id` being a real,
always-populated FK is an invariant every squad-rendering component,
`computeMatchFeeSplit()`, and the top-performer/partnerships resolution
paths already assume. Loosening it would touch far more surface than this
fix is worth. A few inert, `inactive` placeholder rows in `players` is the
cheaper trade.

### Explicitly out of scope

- **No merge/dedupe tooling** for a placeholder accidentally created twice
  under two slightly different spellings (e.g. "Ravi K" vs "Ravi
  Kumar") — the exact-normalised-name idempotency check (§3, point 2)
  only catches an identical resubmission, not a genuinely different
  spelling of the same person. If this becomes a real problem, it's the
  same shape of gap `features/player-identity-resolution.md` already
  solves on the analytics-DB side (aliases + admin reconciliation) — worth
  reusing that pattern here rather than inventing a second one.
- **No admin review queue** for placeholders created this way — unlike
  `/admin/player-reconciliation`'s pending-names queue, a quick-added
  player is live immediately, on the wrangler's own judgement.
- **No automatic promotion path** if a placeholder player later actually
  joins the Hub for real (signs in with Google) — `players.gmail_id` is
  matched at sign-in (`src/lib/auth.ts`), so if an admin later sets the
  placeholder row's `gmail_id` to that person's real Gmail, their history
  (squad rows, and anything downstream keyed off `player_id`) carries over
  automatically with no extra migration — this just isn't done for them.

---

## 4. Security (vibe-security)

| Check | Status |
|---|---|
| `parse-announcement`/`backfill-squad`/`quick-add-player` all require `isWrangler \|\| isAdmin`, re-checked server-side on every call | ✅ |
| `quick-add-player` never sets `is_captain`/`is_gc`/`is_wrangler`/`wallet_balance` from client input — all hardcoded server-side | ✅ |
| `quick-add-player` name Zod-validated (`quickAddPlayerSchema`, `.strict()`, 2–120 chars) before any DB write | ✅ |
| `quick-add-player` rate-limited (`RATE_LIMITS.captainWrite`, keyed by the wrangler's own `playerId`) | ✅ |
| `backfill-squad`'s overwrite path requires the explicit in-app checkbox — the route trusts `overwrite` only because the UI gate already required it (see that route's own header comment) | ✅ |
| No welcome push fires for a quick-added player — verified by reading the route; it never imports `notifyAllSubscribed`/`sendPushToPlayer` | ✅ |
| `parse-announcement`/`backfill-squad` do **not** currently apply rate limiting — a pre-existing gap (same class as `pending-backlog.md` S-2), not introduced or fixed by this pass; `quick-add-player` (new) does | ⚠️ Pre-existing gap on the two older routes |

---

## 5. File Map

| File | Role |
|---|---|
| `src/app/wrangler/backfill-squad/page.tsx` | Wrangler/admin-gated page shell |
| `src/components/wrangler/BackfillSquadClient.tsx` | Paste → parse → preview/resolve → save UI; `addedPlayers` state + inline "＋ New player" toggle (§3) |
| `src/app/api/wrangler/parse-announcement/route.ts` | Read-only — parses text, resolves booking + roster matches |
| `src/app/api/wrangler/backfill-squad/route.ts` | Writes the resolved `squad` rows (delete-and-reinsert, overwrite-gated) |
| `src/app/api/wrangler/quick-add-player/route.ts` | New (§3) — creates (or reuses, on an exact name match) a minimal `inactive` player record for a name with no roster match |
| `src/lib/nameMatch.ts` | `normaliseName()`, `levenshtein()`, `suggestPlayers()` — shared fuzzy-match helpers, also used by `/admin/player-reconciliation` |
| `src/lib/parseAnnouncement.ts` | The WhatsApp-text parser itself (date/format/players/roles extraction) |
| `src/lib/schemas.ts` | `quickAddPlayerSchema` |

---

*Maintained by: Spartans CC BLR*
