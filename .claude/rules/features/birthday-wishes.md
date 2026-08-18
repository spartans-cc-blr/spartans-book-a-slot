# Birthday Wishes — Feature Summary

**Spartans Hub · Added: August 2026**

---

## 1. Overview

A club-wide broadcast modal that wishes any player a happy birthday on the
day their `players.dob` falls, shown to every signed-in, non-expelled
member — same "recognition from the club to everyone" posture as
`features/milestone-recognition.md`'s celebration modal, not a targeted
notification to the birthday player alone. Starts wishing from the day
this shipped (18 Aug 2026) — no retroactive backfill of past birthdays
this year, since "today's birthdays" is re-derived fresh on every request
rather than detected-and-logged once.

---

## 2. Why no achievement/log table

Unlike `milestone_achievements`/`match_performance_achievements`, a
birthday isn't a one-time detected event — it recurs every year on the
same calendar date. `src/lib/birthdays.ts`'s `getTodaysBirthdays()` just
queries `players` fresh on every request and filters in application code
for `dob` rows whose month/day match today's IST date (same +5.5h shift
trick the `lock-availability` cron uses for its own day-of-week check).

The only new persisted state is `players.birthday_wishes_seen_date`
(migration `065_birthday_wishes_seen_date.sql`) — a plain `date`, not a
timestamp — tracking whether the signed-in viewer has already dismissed
*today's* modal. Nullable, no backfill: `NULL` just means "hasn't seen a
birthday modal yet," true for every player on day one.

---

## 3. API Routes

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/birthdays/today` | GET | Any signed-in, non-expelled member | Returns today's birthday players, but only if `players.birthday_wishes_seen_date` for the viewer isn't already today's date — otherwise an empty list |
| `/api/birthdays/mark-seen` | POST | Own session | Advances the signed-in player's own `birthday_wishes_seen_date` to today; `player_id` and the date are always server-derived, never from the request body |

Both rate-limited (`RATE_LIMITS.publicRead` / `playerWrite`), same presets
as the equivalent milestone routes.

---

## 4. UI

`BirthdayWishesModal` (`src/components/birthdays/BirthdayWishesModal.tsx`)
— on mount, fetches `/api/birthdays/today`; if any names come back, opens
a `Dialog` with a party-popper/balloon/cake banner (🎉🎈🎂), one row per
birthday player using `PlayerAvatar` (`src/components/leaderboard/PlayerAvatar.tsx`
— repurposed as-is from `/leaderboard`'s own profile-picture treatment:
Google photo if set, else initials badge). Dismissing (the "Got it"
button, ✕, Escape, or overlay click — routed through `Dialog`'s existing
`onClose`) calls `POST /api/birthdays/mark-seen` and closes.

Mounted once via `GlobalBirthdayModal` (`src/components/ui/GlobalBirthdayModal.tsx`)
in `src/app/layout.tsx`, gated on `isLoggedIn && !isExpelled` — same
mounting rationale as `GlobalMilestoneModal` (`SiteNav` isn't a shared
layout and remounts on every client-side navigation, which would refetch
on every page view if mounted there instead).

### The name is a WhatsApp wish link, not a CricHeroes/stats link

Unlike `PlayerNameLink`'s usual pattern (internal `/players/[id]/stats`
link, or CricHeroes fallback), the birthday player's name here opens a
**destination-free** `wa.me/?text=...` link pre-filled with:

```
Wishing <player name> a very happy birthday, today! 🎉🎂🎈
```

Deliberately destination-free (no phone number embedded), matching the
convention documented in `features/post-match-scorecard.md` §15 that
"every other WhatsApp nudge in this app" uses this pattern — the one
exception there (`PerformerShareButton`, which targets a specific number)
is a wrangler/admin-only affordance built around a number that route
redacts from every other viewer. A birthday wish has no such role gate —
every signed-in member sees it — so the birthday player's own
`players.whatsapp` number is never sent to the browser for this feature;
the wisher picks their own recipient (typically the birthday player
themselves, from their own contacts) when WhatsApp opens.

---

## 5. Scope

- Excludes `status = 'expelled'` players; includes both `active` and
  `inactive` members — a birthday isn't gated on recent availability
  engagement.
- Only players with a `dob` set are considered — `dob` is a player-editable
  field on `/profile` (see `features/site-navigation.md`'s Editable Fields
  table); a player who never set one is simply never included.
- No admin UI, no manual trigger — purely automatic from `dob`.
- No push notification — same choice as milestone recognition, a modal on
  next page load rather than an async push.

---

## 6. Security (vibe-security)

| Check | Status |
|---|---|
| Detection runs entirely server-side (`getTodaysBirthdays()`), never client-triggered | ✅ |
| `GET /today` requires a signed-in, non-expelled session | ✅ |
| `POST /mark-seen` — `player_id` and date always server-derived from session, never the request body | ✅ |
| Both routes rate-limited | ✅ |
| Birthday player's `whatsapp` number never sent to the browser | ✅ Wish link is destination-free — see §4 |
| No new RLS surface — reads/writes go through `createServiceClient()` only, same as every other `players` access path | ✅ |

---

## 7. File Map

| File | Role |
|---|---|
| `supabase/migrations/065_birthday_wishes_seen_date.sql` | `players.birthday_wishes_seen_date` — per-viewer "seen today" cursor |
| `src/lib/birthdays.ts` | `getTodaysBirthdays()`, `todayIST()`, `istDateString()` |
| `src/app/api/birthdays/today/route.ts` | GET — today's birthday players, gated on the viewer's own seen-cursor |
| `src/app/api/birthdays/mark-seen/route.ts` | POST — advances the viewer's own seen-cursor to today |
| `src/components/birthdays/BirthdayWishesModal.tsx` | The modal itself — party-popper banner, `PlayerAvatar`, destination-free WhatsApp wish link |
| `src/components/ui/GlobalBirthdayModal.tsx` | Mounts the modal once per session in the root layout |
| `src/app/layout.tsx` | Renders `GlobalBirthdayModal` once, inside `Providers`/`ChunkErrorBoundary`, alongside `GlobalMilestoneModal` |

---

*Maintained by: Spartans CC BLR*
