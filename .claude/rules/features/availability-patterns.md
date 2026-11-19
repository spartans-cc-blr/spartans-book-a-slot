# Availability Patterns — `/gc/availability-patterns` (Council only)

**Spartans Hub · Added: November 2026 · Phase 1 (Council only)**

---

## 1. Overview

Shows how each player marks availability, measured against the games
actually on offer to them, so Council can spot habits such as "only plays
T20", "never available under captain X" or "rarely available on weekdays",
plus reliability signals. Read-only.

**Council (GC) and admin only.** Captain-related patterns can cause friction
in the player community (same reasoning as Team Record's Captain dimension,
`team-stats.md` §3.6), so nothing here is fetched for any other role. A
later phase may show neutral habits (slot/format/day) to captains in
Captains' Corner; captain affinity stays Council-only.

Nav: 🧭 Availability Patterns in **Council ⚖** (desktop), the mobile More
sheet's Council section, and the admin sidebar's Council group
(`activePage="gc-patterns"`).

## 2. How it is measured — `src/lib/availabilityPatternsCore.ts` (pure, unit-tested)

- **Offered games:** every past confirmed booking from the player's first
  response in the period onward. A game with no response counts as offered
  and not available. Future games are excluded (still open).
- **Available** = Y, O or E. L and no response are not available.
- **Dimensions:** slot, day type (Sat / Sun / Weekday / Holiday), format, captain
  (`bookings.captain_id`, else the tournament's captain) and ground
  (booking's ground, else the tournament's). Games the player captained
  themselves are left out of the captain dimension. A dimension with only
  one value on offer shows no pattern.
- **Holiday day type (added November 2026):** a Mon–Fri game on a Karnataka
  public holiday counts as *Holiday*, not *Weekday*. Clubs run festival
  tournaments on these days (Sankranti, Republic Day, Ugadi, Bakrid, Ganesh
  Chaturthi cups in 2026), and lumping them in hid players who never play
  working days but do play holidays. Dates live in `src/lib/holidays.ts`
  (`KARNATAKA_WEEKDAY_HOLIDAYS`), weekday dates only, 2026 so far. Only dates
  the published lists agree on are included; the ones they disagree on are
  named in that file's comment. **Add each new year's list there.**
- **One-day tournament rule:** a weekday also counts as *Holiday* when it
  hosted two or more games of the same format in the same tournament
  (`oneDayTournamentDates()`, same file). Clubs only stage one-day events on
  holidays, so this catches festivals missing from the list; weekday leagues
  play one game per date. On 2026 data it picks out exactly the five listed
  holidays the club played on, with no ordinary weekday game misclassified.
- **Mostly / only:** ≥6 available responses in the dimension, ≥70% (≥90% for
  "only") of them in one value, and ≥1.5× the rate for other values.
- **Rarely / never:** value offered ≥6 times, rate ≤ half the rate for other
  values, and ≥30% available elsewhere.
- **Day/format check for captain and ground:** a captain who only leads
  weekday T30 games shouldn't be blamed for a player who never plays weekday
  T30. Each game is given the player's own yes rate for its day-type ×
  format cell; summed, that is the "expected" count. "Avoids" also needs the
  expected count ≥3 and actual ≤ half of it; "prefers" needs actual ≥1.3×
  expected. On real data this cut captain-avoidance from 6 raw cases to 1.
- **Reliability flags:** *Rarely responds* (≥10 offered, answered <25%),
  *Often withdraws* (≥3 self-switches from Y/O/E to L, ≥20% of
  available + withdrawn), *Rarely picked when available* (≥8 available,
  announced in ≤25% of them).
- Thresholds are constants at the top of the core file; keep this section in
  sync when tuning them.

Withdrawals come from `availability_audit` rows with `update_source =
'player'`, `old_response IN (Y,O,E)`, `new_response = 'L'`. A cleared
response is logged without its old value, so clears are not counted.

## 3. Data — `src/lib/availabilityPatterns.ts` (server only)

`getAvailabilityPatterns(period)` reads `bookings` (with the tournament
embed for captain/ground fallback), `captains`, `grounds`, non-expelled
`players`, and, per 150-booking chunk, `availability`, announced `squad`
rows and the withdrawal audit rows. Every read pages past PostgREST's
1000-row cap. Period: `?period=3|6|12|all` months, default 6.

First run on real data (19 Nov 2026, 6 months, 76 games, 73 players): 33
habit findings (mostly day and format) and 26 reliability flags, 21 of them
*Rarely responds*.

## 4. UI — `src/components/gc/AvailabilityPatternsClient.tsx`

Period pills (URL links with `replace`), Active / Inactive / All, a filter by
pattern type with counts (Any habit, Captain, Format, Day, Slot, Ground,
Reliability, Everyone), name search, then one card per player: totals line,
green "prefers" / red "avoids" chips with the numbers, amber reliability
chips, and a collapsible per-dimension breakdown with bars. A "How patterns
are worked out" note sits at the bottom. Follows Light/Dark/System.

## 5. Security

| Check | Status |
|---|---|
| Page gate `isGC \|\| isAdmin`, server-side, before any fetch | ✅ |
| No API route; data computed server-side and passed only to the authorised page | ✅ |
| Read-only; no migration, no new table | ✅ |
| Client imports only the pure core module (types from the server module are `import type`) | ✅ |

## 6. File map

| File | Role |
|---|---|
| `src/lib/availabilityPatternsCore.ts` (+ `.test.ts`) | Rules and thresholds |
| `src/lib/availabilityPatterns.ts` | Server fetch |
| `src/lib/holidays.ts` (+ `.test.ts`) | Karnataka weekday public holidays and the one-day-tournament rule (Holiday day type) |
| `src/app/gc/availability-patterns/page.tsx` | Page and gate |
| `src/components/gc/AvailabilityPatternsClient.tsx` | Filters and cards |
| `src/components/ui/SiteNav.tsx`, `MobileTabBar.tsx`, `src/components/admin/AdminSidebar.tsx` | Nav entries |

## 7. Not built yet

- Captains' Corner chips for neutral habits (phase 2).
- Opponent, tournament and ground-by-format dimensions; response latency
  (how soon after booking or nudge a player marks); month-on-month drift.
- Using patterns to steer the availability nudge.

---

*Maintained by: Spartans CC BLR*
