# Council Feedback Campaigns — `/gc/feedback`

**Spartans Hub · GC-only internal tool · This doc added: September 2026**

---

## 1. Overview

`/gc/feedback` ("📋 Feedback" in the Council ⚖ nav dropdown) lets a
Governing Council member run a feedback round against the active player
roster: a GC member talks to a player (in person, over a call, on
WhatsApp — outside the Hub) and **enters the player's answers on their
behalf**. This is not a self-service player-facing survey — there is no
player-side form. `/profile` has no link to this, and a plain player
never sees a campaign or a question.

A **campaign** (`feedback_campaigns`) is one round of a fixed question
set, shared across the whole roster. GC members split up who talks to
whom via a lightweight **claim** system, then record one **response**
(`feedback_responses`) per player, one row per player per campaign.

---

## 2. Data model

### `feedback_campaigns`
`id, title, questions (jsonb string[]), created_by, created_at, closed_at`.
One row per round (e.g. "June 2026 – Club Health Check"). `questions` is
an ordered array of question strings — positional, referenced by index
elsewhere (`answers` keys are the stringified index, e.g. `"0"`, `"1"`).
`closed_at` freezes the campaign — no more responses, claims, or question
edits once set (see §4).

### `feedback_responses`
`id, campaign_id, player_id, collected_by_gc, answers (jsonb), notes,
collected_at`. `UNIQUE(campaign_id, player_id)` — exactly one response per
player per campaign; a second `POST` for the same pair 409s ("Response
already collected for this player") rather than overwriting. `answers` is
a plain object keyed by question index (`{"0": "...", "1": "...", ...}`).
`notes` is a free-text **GC-internal memo**, never shown to the player and
never treated as one of the campaign's answers.

### `feedback_claims`
`campaign_id, player_id, claimed_by, claimed_at` — `PRIMARY KEY
(campaign_id, player_id)`. A soft "I'm about to talk to this player" flag
so two GC members don't duplicate effort on the same person. Cleared
automatically the moment a response is actually saved for that player
(`POST /api/gc/feedback/responses` deletes the matching claim row on
success) — a claim never outlives the response it was standing in for.

All three tables: RLS enabled, no anon/authenticated policies — service
role only, same blanket-deny pattern as every other table in this app.
Migration `020_gc_feedback.sql`.

---

## 3. Page — `src/app/gc/feedback/page.tsx` + `GCFeedbackClient.tsx`

Server component gate: `isGC || isAdmin`, redirect to `/` otherwise.
Fetches every campaign (open campaigns first, then most-recently-created)
and the full active roster (`status = 'active'`) in parallel, and hands
both to the client component along with the signed-in GC member's own
`playerId`/`playerName`.

**Campaign picker** — a pill row across the top of the page; the client
defaults to the first still-open campaign, falling back to the very first
campaign in the list if every one is closed. Switching campaigns re-fetches
that campaign's `responses`/`claims` from scratch.

**Per-player roster list** — one row per active player, left border and
right-hand action varying by status:

| Status | Left border | Right-hand content | Row click |
|---|---|---|---|
| Collected | green | "✓ Collected by {name} · View" | Opens the response (§4.1) |
| Claimed by me | gold | "You claimed this" + Release | Opens the collect form |
| Claimed by someone else | grey | "Claimed by {name}" | Opens the collect form |
| Uncollected | grey | Claim button | Opens the collect form |

A closed campaign disables Claim/Release/collect entirely — only the
"View" action on an already-collected row still works, so a closed
campaign's history stays reachable.

**Progress bar** — `{collected} / {roster size} collected`, plus a
per-collector breakdown ("Muthu: 12 · Priya: 8") with the signed-in GC
member's own count highlighted, so the round's progress and who's carried
it are both visible from the top of the page without opening anything.

**Collecting a response** — clicking an uncollected/claimed row opens a
modal with one input per campaign question (plain textarea by default;
question 4 — "Are you getting enough opportunities…" — renders as a
Yes/No/Somewhat radio group, and question 5 — "T20 or T30" — as a T20/T30/
No preference radio group, both hardcoded by question *index*, not by
matching text) plus a GC Collector Notes textarea. Saving calls `POST
/api/gc/feedback/responses`, which requires every question index to have
an (even empty-string) entry in `answers` before accepting the save, then
clears any claim on that player for this campaign.

---

## 4. Editing the question set / closing a campaign

Only while `!closed_at`: "✏ Edit questions" opens an inline editor
(`PATCH /api/gc/feedback/campaigns/[id]/questions`) — a question can be
added at any time, but the **delete** ("×") control on an existing
question is only shown while `responses.length === 0` for that campaign.
Once even one response has been collected, the question set can only grow,
never shrink or reorder — this is what keeps every already-collected
response's `answers` object interpretable by index against the campaign's
current `questions` array (a response collected before a later-added
question simply has no entry for that later index — rendered as "No answer
recorded", not an error, see §4.1).

"🔒 Close campaign" calls `PATCH /api/gc/feedback/campaigns/[id]/close`,
which sets `closed_at`. This is one-way from the UI — there's no reopen
button — matching the "closed means frozen" framing everywhere else on the
page.

"+ New Campaign" (`POST /api/gc/feedback/campaigns`) creates a fresh round
pre-filled with the six standard questions (`DEFAULT_QUESTIONS` in
`GCFeedbackClient.tsx`), then switches to it.

---

## 4.1 Viewing a submitted response (added September 2026)

**The gap this closes.** Once a response was saved, the roster row only
ever rendered "✓ Collected by {name}" — the actual answers and GC notes
were fetched by the page (`GET /api/gc/feedback/responses` already
returns the full `answers`/`notes`/`collector` for every response in the
campaign) but never rendered anywhere. There was no way for a GC member —
including the one who collected it — to go back and read what a player
had actually said, short of querying the database directly.

**Fix.** Clicking a **collected** row now opens a read-only "Submitted
Response" modal instead of doing nothing: who collected it and when, then
each campaign question with its recorded answer (or "No answer recorded"
in muted italics for a question added after this response was collected —
see §4), then the GC Collector Notes memo if one was left. This works
identically whether the campaign is open or closed — closing a campaign
never hides its history, only freezes further collection.

**Deliberately view-only, no edit.** There is still no `PATCH` on
`feedback_responses` — correcting a mis-typed answer isn't possible from
the UI (or the API) today. Only the read path was missing; adding a write
path for corrections is a separate, larger change (needs its own audit
trail, same as `wallet_transactions`' correction flow) and wasn't part of
the reported gap.

---

## 5. API routes

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/gc/feedback/campaigns` | GET, POST | GC or Admin | List all campaigns; create a new one |
| `/api/gc/feedback/campaigns/[id]/questions` | PATCH | GC or Admin | Replace the question array (grow-only once responses exist, see §4) |
| `/api/gc/feedback/campaigns/[id]/close` | PATCH | GC or Admin | Set `closed_at` — one-way |
| `/api/gc/feedback/claims` | GET, POST, DELETE | GC or Admin | List/claim/release a player within one campaign; DELETE is self-only unless the caller `isAdmin` |
| `/api/gc/feedback/responses` | GET, POST | GC or Admin | List every response for a campaign (full `answers`/`notes`, used by both the roster status and the §4.1 view modal); save one player's response, clearing their claim on success |

None of these routes are reachable by a plain player — every one gates on
`isGC || isAdmin`, re-checked server-side on every call, never trusting
the nav to just not show the link.

---

## 6. Security (vibe-security)

| Check | Status |
|---|---|
| Every route requires `isGC \|\| isAdmin`, re-derived server-side | ✅ |
| Page itself redirects a non-GC/admin visitor to `/` before any data fetch | ✅ |
| `collected_by_gc` always taken from the session (`user.playerId`), never the request body | ✅ |
| `POST /responses` validates `answers` keys exactly match the campaign's current question indices before insert | ✅ |
| `UNIQUE(campaign_id, player_id)` on `feedback_responses` — a second save for the same pair 409s rather than silently overwriting | ✅ |
| A closed campaign (`closed_at` set) rejects new responses (409) server-side, not just via a hidden button | ✅ |
| All three tables RLS-enabled, no anon/authenticated policies — service role only | ✅ |
| No player-facing read/write path exists anywhere in this feature — a plain player cannot see a campaign, a question, or their own recorded answer | ✅ |

---

## 7. File Map

| File | Role |
|---|---|
| `supabase/migrations/020_gc_feedback.sql` | `feedback_campaigns` / `feedback_responses` / `feedback_claims` + the seed campaign |
| `src/app/gc/feedback/page.tsx` | Server component — GC/admin gate, campaign + roster fetch |
| `src/components/gc/GCFeedbackClient.tsx` | Campaign picker, roster list, collect modal, question editor, close/create campaign; the "Submitted Response" view modal (§4.1) |
| `src/app/api/gc/feedback/campaigns/route.ts` | GET/POST campaigns |
| `src/app/api/gc/feedback/campaigns/[id]/questions/route.ts` | PATCH question set |
| `src/app/api/gc/feedback/campaigns/[id]/close/route.ts` | PATCH close |
| `src/app/api/gc/feedback/claims/route.ts` | GET/POST/DELETE claims |
| `src/app/api/gc/feedback/responses/route.ts` | GET/POST responses |
| `src/components/ui/SiteNav.tsx` / `src/components/ui/MobileTabBar.tsx` | "📋 Feedback" entry in the Council ⚖ dropdown / More sheet |

---

## 8. Explicitly out of scope

- No player-facing submission form — every response is GC-entered on the
  player's behalf, by design (see §1).
- No editing of an already-saved response (§4.1) — view-only for now.
- No export (CSV/xlsx) of a campaign's responses.
- No per-question analytics/aggregation across a campaign (e.g. "N players
  said Yes to Q4") — the roster list and the view modal are both
  per-player only.

---

*Maintained by: Spartans CC BLR*
