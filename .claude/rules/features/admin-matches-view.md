# Admin Matches — merged List / Calendar view

**Spartans Hub · `/admin` · Added: October 2026**

---

## 1. Overview

The admin "Matches - List View" (`/admin`) and "Fixtures - Calendar View"
(`/admin/schedule`) were two sidebar entries for two views of the same data.
They are now one page, **Matches** (`/admin`), with a **List / Calendar**
toggle (`?view=list|calendar`, default list). `/admin/schedule` just
redirects to `/admin?view=calendar`. The sidebar has a single "Matches" entry.

Weekdays are deliberately **not** shown in the calendar (a product decision):
it stays Sat/Sun only. Weekday games are visible in the List view.

## 2. List view

Tabs: **Upcoming**, **Needs action**, **Past**.

- **Needs action** (`GET /api/admin/bookings/needs-action`, admin-only): past
  confirmed games from the last 14 days (`NEEDS_ACTION_DAYS`) that still have
  a scorecard, sync or fee step. The tab label shows the count. Fees are
  applied within a week, so older items are data problems, not to-dos: use
  Scorecard Backfill or the Past tab search.
- **Past tab search** (`?q=` on `/api/admin/bookings/past`): matches opponent,
  match ID, tournament name or captain across **all months** (the month
  stepper is ignored while searching; PostgREST-significant characters are
  stripped from the term). Rows of confirmed games with no CricHeroes URL show
  a small "no link" marker; fix it via Edit. No opponent column (declined).
- Every row shows a **Next** chip from `computeNextStep()`
  (`src/lib/matchNextStep.ts`), shared by the Past tab and Needs action so
  they cannot disagree: `Flagged` (stats discrepancy) → `Scorecard missing` /
  `Add match ID` → `Sync stats` → `Apply fee`. Practice games and matches with
  `fees_reconciled_externally` never show `Apply fee`. Fees stay a manual
  admin action (`post-match-scorecard.md` §6); the chip only links to the
  existing flow (`/admin/bookings/[id]?action=fees` for fees, the edit page's
  Post-Match panel otherwise).
- The separate "Apply Match Fee" button was replaced by the chip; "Edit" stays.

## 3. Calendar view (admin mode)

`ScheduleGrid` takes `adminMode`. `/api/availability?admin=1` adds
`booking_id`, `block_reason` and full tournament/opponent/format details to
booked and reserved slots, **only when the session is admin** (the flag alone
grants nothing; the public `/schedule` payload is unchanged).

- **Open / T20-only slot** → small menu: Book game, Reserve slot (48h), Soft
  block. Each opens the existing form with `?date=&slot=&from=calendar`
  (reserve adds `&mode=reserved`). R1–R8 validation runs as usual; a full
  weekend shows a note that booking needs an R1 override.
- Since this calendar menu already reaches both `/admin/bookings/new` and
  `/admin/soft-blocks/new`, the standalone "New Booking"/"Soft Blocks"
  shortcut rows were removed from `AdminSidebar.tsx`'s `NAV` array
  (October 2026) — a redundant second path to the same two forms. Both
  routes are unchanged and still reachable from the calendar; only the
  sidebar shortcut is gone.
- **Booked / reserved / soft-block slot** → links to
  `/admin/bookings/[id]?from=calendar` (Edit).
- `from=calendar` makes save / cancel / Back on those forms return to
  `/admin?view=calendar`. Prefill values are validated (date format, slot in
  `SLOT_TIMES`), never trusted.
- The public WhatsApp "book" CTA is hidden in admin mode.

## 4. Security

| Check | Status |
|---|---|
| `needs-action` route and `?admin=1` booking details re-check `isAdmin` server-side | ✅ |
| Prefill query params validated before use; no new write path | ✅ |
| Read-only: nothing here applies a fee or changes scorecard status | ✅ |

## 5. File map

| File | Role |
|---|---|
| `src/app/admin/page.tsx` | Merged page, toggle |
| `src/components/admin/DashboardBookingsTabs.tsx` | Tabs, Next chip, Needs action panel |
| `src/lib/matchNextStep.ts` (+ `.test.ts`) | Next-step rule |
| `src/app/api/admin/bookings/needs-action/route.ts`, `.../past/route.ts` | Row data |
| `src/components/schedule/ScheduleGrid.tsx` | `adminMode`, `AdminSlot` |
| `src/app/api/availability/route.ts` | `?admin=1` details |
| `src/app/admin/bookings/new/page.tsx`, `soft-blocks/new/page.tsx`, `bookings/[id]/page.tsx` | Prefill and `from=calendar` return |
| `src/components/admin/AdminSidebar.tsx`, `src/app/admin/schedule/page.tsx` | Single entry, redirect |

## 5.1 NLP quick-command bar removed (October 2026)

The ⌘K "Quick command" bar on `/admin` (`NLPBookingBar.tsx`) and its route
`POST /api/admin/nlp-parse` were deleted. They called the Anthropic API,
so a drained credit balance made the bar fail outright, and they were a poor
fit anyway: one slot per command, `reserve` dropped the tournament and sent
no `reserved_until` (so NLP-made holds never expired). Booking, reserving and
soft-blocking go through the calendar menu and the existing forms. The
`ANTHROPIC_API_KEY` and `NLP_PARSE_MODEL` env vars are no longer used by the app and can be removed
from Vercel. A deterministic multi-slot "hold for tournament" flow is the
planned replacement.

## 6. Not built yet

Row drawer with a state-based primary action; tabbed split of the 1,500-line
booking edit page; weekdays in the calendar (declined).

---

*Maintained by: Spartans CC BLR*
