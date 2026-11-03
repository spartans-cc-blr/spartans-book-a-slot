# My Notifications — per-player alert preferences + "New match booked" push

**Spartans Hub · Added: November 2026**

---

## 1. Overview

Players choose which alerts they get from **My Profile → Notifications → My Notifications**.
Everything is on by default; a switch stores `enabled=false` for one key. Preferences are
per **player** (all devices), unlike the push subscription itself, which is per device.

| Group | Locked? | Keys |
|---|---|---|
| Squad announcements | **Locked on** | none stored |
| Wallet and fees | **Locked on** | none stored |
| Availability reminders | No | `nudge_day_sun/mon/tue`, `nudge_deadline` (Wed last call), `nudge_habitual`, `nudge_new_slot`, `nudge_tournament`, `nudge_gap`, `nudge_leader`, `nudge_rematch`, `nudge_rematch_ready`, `nudge_comeback` |
| New matches booked | No | `newmatch` (master) + `newmatch_t:<tournament id>` per tournament |
| Club news | No | `news_birthday`, `news_welcome`, `news_season_runs/wickets/dismissals`, `news_match_century/half_century/five_wickets/three_wickets/five_dismissals` |

GC/admin operational alerts (fees pending, reservation expiry, record breaks, cron health,
organiser reserves) are not configurable.

## 2. Storage — migration `089_notification_preferences.sql`

`notification_preferences(player_id, key, enabled, updated_at)`, PK `(player_id, key)`.
**A missing row means on.** RLS on, no policies (service role only). **Must be applied to the
live Hub project**: until it is, reads fail open (everyone treated as opted in) and saving
a preference returns an error.

Keys are registered in `src/lib/notificationPrefs.ts` (client-safe). Locked groups have no
registered keys, so they cannot be stored or checked.

## 3. Enforcement (always server-side)

| Surface | Where |
|---|---|
| Reminder **days** (Sun–Tue) | `availability-nudge` cron and `getNudgeForPlayer()` skip the player for a muted day. Wednesday is governed by `nudge_deadline`. |
| Reminder **kinds** | `pickNudgeCandidate()` / `pickRematchReadyCandidate()` take a `muted` set and skip a muted theme without "using it up", so the next applicable theme is tried. The Home banner uses the same function, so it follows the same choices. |
| Welcome push | `notifyAllSubscribed(..., pref)` filters muted players in one query. |
| Birthday / milestone / highlight modals | `modalFeed.ts` filters by key; the seen-cursor still advances on dismiss, so un-muting never resurfaces old items. |
| New match booked | `notifyNewMatchBooked()` (below). |

Reads **fail open**: a preferences read error means "send", so an outage can't silence squad or wallet alerts.

## 4. New match booked push — `src/lib/newMatchNotify.ts`

Fired (awaited, best-effort) when a booking becomes **confirmed**: `POST /api/bookings`, and
`PATCH /api/bookings/[id]` when status moves to confirmed from anything else (e.g. a reservation
confirmed by the admin). Skipped for practice games, bookings without a tournament, and past
dates (backfills).

Audience: everyone with a push subscription, minus expelled players, minus anyone who muted
`newmatch` or unfollowed that tournament. **All tournaments are followed by default**, including
new ones. Deep link: `/fixtures/<booking id>`.

## 5. API

`GET/PUT /api/notification-preferences` — signed-in, non-expelled; `player_id` from the session
only; PUT is Zod `.strict()`, keys validated against the registry, `playerWrite` rate limit.
GET returns the muted keys plus followable tournaments (active, non-practice, not completed).

## 6. File map

| File | Role |
|---|---|
| `supabase/migrations/089_notification_preferences.sql` | Table |
| `src/lib/notificationPrefs.ts` (+ `.test.ts`) | Registry, key validation, nudge/modal key maps |
| `src/lib/notificationPrefsServer.ts` | Muted-key readers, `setPreferences()` |
| `src/app/api/notification-preferences/route.ts` | GET/PUT |
| `src/components/profile/MyNotifications.tsx` | UI inside the profile Notifications card |
| `src/lib/newMatchNotify.ts` | New-match push |
| `src/lib/webpush.ts`, `availabilityNudge.ts`, `modalFeed.ts`, `api/cron/availability-nudge/route.ts` | Enforcement points |

## 7. Not built

Per-match following (a match cannot be followed before it exists), digest/summary mode, quiet hours,
and per-device preferences.

---

*Maintained by: Spartans CC BLR*
