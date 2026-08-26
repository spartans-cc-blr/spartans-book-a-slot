# GC Announcements — Feature Summary

**Spartans Hub · Added: August 2026**

---

## 1. Overview

Lets a GC member (or admin) compose a push notification and broadcast it to
every player who has push notifications enabled — a general-purpose
"whatever GC wants to announce" channel, distinct from the existing
purpose-built pushes (squad announcement, birthday wishes, milestone
recognition), which all fire automatically off a specific event. This one
is manually triggered, free-text, and deliberately narrow in scope: no
audience targeting, no scheduling, no rich content — just a title and a
body, sent to everyone subscribed.

Reached from the **Council ⚖** nav dropdown → **📢 Announcements**
(`/gc/announcements`), alongside Squad Review, Feedback, Players, and Store
Orders.

**Restricted to GC and admin** — deliberately narrower than Captains, who
have push-adjacent capabilities elsewhere (squad announce) but no general
broadcast tool. This mirrors the access pattern already used by every
other Council-menu feature (`isGC || isAdmin`), not a new precedent.

---

## 2. AI Polish — optional, preview-and-approve only

A "✨ Polish with AI" button runs the drafted title/body through Claude
(Haiku 4.5, chosen for a lightweight text-cleanup task rather than the
Sonnet model `/api/admin/nlp-parse` uses for structured parsing) to fix
grammar, spelling, and clarity. The system prompt is explicit that this is
a copy-edit pass only — **preserve meaning, tone, and intent; don't add
information, don't soften or embellish, don't change facts, dates, names,
or numbers.**

**Never auto-applied.** The polished text replaces the draft in the same
editable input fields — the sender always sees the exact wording before
anything is sent, can hand-edit it further, or click "Revert to my draft"
to discard the AI version entirely. `POST /api/gc/announcements/polish`
itself never writes to the database and never sends a push — it's a pure
preview step, called only by the compose page.

Same prompt-injection mitigation as `/api/admin/nlp-parse`: the system
prompt is hardcoded server-side, and the sender's draft is passed only as
the user message (JSON-stringified), never interpolated into the system
prompt.

---

## 3. Audit Trail

Every actual send — whether or not polish was used — writes one row to
`gc_announcements`: who sent it, the final title/body, `original_body`
(only populated when polish changed the text the sender started with, so
the history view can show "AI-polished" without implying every send went
through it), and how many players it actually reached
(`recipient_count`). Insert-only, no update/delete path. Shown as a
"Recent Announcements" list on the same compose page.

The audit write happens **after** the push send, not before — the row
records what actually happened (real `recipient_count`), not a pre-send
guess. If the audit insert itself fails, the sender is not told the send
failed (it didn't — the push already went out); the failure is logged
server-side for follow-up instead.

---

## 4. Recipients

`notifyAllSubscribedPlayers()` (`src/lib/webpush.ts`) — every player with
at least one row in `push_subscriptions`, i.e. every player who has
tapped the push subscribe button on `/profile`. No role or squad
filtering: unlike Captains-Corner-adjacent features, GC operates at the
whole-club level, so there's no natural "scope" to narrow to — everyone
subscribed gets everything sent here. Players who never subscribed to
push receive nothing, same opt-in-only posture as every other push
trigger in this app (see `features/push-notifications.md` §12).

---

## 5. Rate Limiting

`POST /api/gc/announcements` (the actual send) uses a new
`RATE_LIMITS.broadcast` preset — **5 sends per hour**, deliberately far
tighter than every other write preset in this app. This reaches every
subscribed player's phone in one call, not just a database row, so it
gets its own conservative ceiling rather than reusing `adminWrite`
(60/min) or `captainWrite` (30/min). The polish preview step
(`POST /api/gc/announcements/polish`) uses the lighter `captainWrite`
preset — it costs an API call but never reaches a player's device.

---

## 6. Database — `supabase/migrations/048_gc_announcements.sql`

```sql
CREATE TABLE gc_announcements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sent_by         uuid NOT NULL REFERENCES players(id),
  title           text NOT NULL,
  body            text NOT NULL,
  original_body   text,           -- nullable; set only when polish changed the text
  recipient_count integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);
```

RLS enabled, no anon/authenticated policies — service role only, same
blanket-deny pattern as every other table in this app. All access via
`src/app/api/gc/announcements/route.ts`.

---

## 7. Security (vibe-security)

| Check | Status |
|---|---|
| `isGC \|\| isAdmin` enforced server-side on GET and POST, both routes | ✅ |
| `sent_by` always `session.user.playerId` — never accepted from the request body | ✅ |
| Title/body length-capped server-side (Zod: 80 / 500 chars), not just the UI's `maxLength` | ✅ |
| Send route rate-limited far tighter than any other write route (`RATE_LIMITS.broadcast`, 5/hour) | ✅ |
| AI polish: hardcoded system prompt, user draft passed only as the user message — never interpolated into the system prompt | ✅ |
| `ANTHROPIC_API_KEY` — no `NEXT_PUBLIC_` prefix, server-side only (pre-existing key, already used by `/api/admin/nlp-parse`) | ✅ |
| Polish step never writes to the DB and never sends a push — preview only | ✅ |
| `gc_announcements` RLS enabled, no anon/authenticated policies | ✅ |
| Push payload contains no sensitive data — same posture as every other push trigger | ✅ |

---

## 8. File Map

| File | Role |
|---|---|
| `supabase/migrations/048_gc_announcements.sql` | `gc_announcements` audit table |
| `src/lib/webpush.ts` | `notifyAllSubscribedPlayers()` — broadcasts to every player with a push subscription |
| `src/lib/rateLimit.ts` | `RATE_LIMITS.broadcast` (5/hour) |
| `src/lib/schemas.ts` | `gcAnnouncementPolishSchema`, `gcAnnouncementSendSchema` |
| `src/app/api/gc/announcements/polish/route.ts` | POST — AI polish preview, no DB write, no push |
| `src/app/api/gc/announcements/route.ts` | GET — last 20 sent; POST — actually sends + writes the audit row |
| `src/app/gc/announcements/page.tsx` | Server component — `isGC \|\| isAdmin` gate, redirects to `/` otherwise |
| `src/components/gc/GCAnnouncementsClient.tsx` | Compose form, polish preview/revert, send confirmation, history list |
| `src/components/ui/SiteNav.tsx` | Council ⚖ dropdown entry (desktop + mobile) |

---

## 9. Explicitly Out of Scope

- No audience targeting (all-or-nothing — every subscribed player, every
  send).
- No scheduling — sends immediately, no draft-for-later state beyond the
  unsaved compose form itself.
- No push-payload deep link beyond the home page (`/`) — there's no
  standalone "view this announcement" page for a player to land on.
- No edit/delete on a sent announcement — the audit row is immutable, same
  as every other insert-only log table in this app.

---

*Maintained by: Spartans CC BLR*
