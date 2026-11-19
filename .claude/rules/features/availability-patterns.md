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
- **Response timing (added November 2026):** how early or late a player
  answers, from their own first response per game (earliest
  `availability_audit` row with `update_source = 'player'`, clears excluded;
  captain proxy entries don't count) measured against the availability
  cutoff: Thursday 08:00 IST before a Sat/Sun game (the lock-availability
  cron), the start time for a weekday or holiday game. An earlier lock from
  a squad draft has no recorded time, so it isn't modelled. Games booked
  less than 72 hours before the cutoff, or after the game (CricHeroes
  backfills, 85 of them), have no real window and are skipped.
  `computeResponseTiming()` gives the median days before the cutoff, bands
  (a week or more ahead / last week / last 24 hours / after the cutoff) and,
  with ≥6 timed answers: *Plans ahead* (median ≥7 days), *Leaves it late*
  (median ≤2 days) and *Answers as soon as a game is booked* (≥50% within
  72 hours of booking). The audit log starts 28 Mar 2026, so earlier
  responses have no timing. On real data (6 months, 44 players with ≥6 timed
  answers): 12 plan ahead, 11 leave it late, 1 answers as soon as booked.
  The median player answers about 3 days before the cutoff, i.e. after the
  Sunday/Monday reminders.
- **Reminder response (added November 2026):** whether a player answers
  after the availability-nudge reminders (`availability_nudge_log`,
  status `sent`, Sun–Wed 20:45 IST; see `availability-nudge.md`).
  `computeReminderResponse()` groups a player's reminders into weeks
  (Sunday-start, IST); a week counts as answered when the player responded
  themselves between the week's first reminder and 12 hours after its last.
  Weeks whose window is still open are left out. With ≥4 completed weeks:
  *Answers after reminders* (answered in ≥50% of weeks) or *Doesn't answer
  reminders* (none). Responses are read by time, not by booking, because a
  reminder is answered on games not yet played. The log starts 8 Jul 2026.
  *Push off* is a separate fact chip: no `push_subscriptions` row now, so
  reminders only reach that player as the Home page banner (current state,
  not history).
  On real data (6 months): only 20 of 180 reminded players have push on.
  Those 20 answered in 45% of their reminder weeks; the other 160 in 6%, and
  123 of them never. 14 players get *Answers after reminders*. Getting
  players to turn push on is the clearest lever.
- Thresholds are constants at the top of the core file; keep this section in
  sync when tuning them.

Withdrawals come from `availability_audit` rows with `update_source =
'player'`, `old_response IN (Y,O,E)`, `new_response = 'L'`. A cleared
response is logged without its old value, so clears are not counted.

## 3. Data — `src/lib/availabilityPatterns.ts` (server only)

`getAvailabilityPatterns(period)` reads `bookings` (with the tournament
embed for captain/ground fallback), `captains`, `grounds`, non-expelled
`players`, and, per 150-booking chunk, `availability`, announced `squad`
rows, the withdrawal audit rows and every player-made audit row (for response timing); plus, for the whole period, sent reminders, the player's own audit rows by time and current `push_subscriptions` (for reminder response). Every read pages past PostgREST's
1000-row cap. Period: `?period=3|6|12|all` months, default 6.

First run on real data (19 Nov 2026, 6 months, 76 games, 73 players): 33
habit findings (mostly day and format) and 26 reliability flags, 21 of them
*Rarely responds*.

## 4. UI — `src/components/gc/AvailabilityPatternsClient.tsx`

Period pills (URL links with `replace`), Active / Inactive / All, a filter by
pattern type with counts (Any habit, Captain, Format, Day, Slot, Ground,
Timing, Reminders, Push off, Reliability, Everyone), name search, then one card per player: totals line,
green "prefers" / red "avoids" chips with the numbers, sky/amber timing
and reminder chips, a grey "Push off" chip, amber reliability chips, a "usually answers N days before the cutoff"
note, and a collapsible per-dimension breakdown with bars (plus a "When they
answer" band table). A "How patterns
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
- Opponent, tournament and ground-by-format dimensions; month-on-month drift.
- Using patterns to steer the availability nudge.

---

*Maintained by: Spartans CC BLR*
