# Wrangler Menu & Grounds Management — Feature Summary

**Spartans Hub · Added: July 2026**

---

## 1. Overview

Introduces a dedicated **"Wrangler ⚒"** dropdown in `SiteNav`, consolidating
wrangler-facing tools that previously lived as a single flat top-level link.
Squad Backfill moved under it unchanged. Grounds management — previously
admin-only under `/admin/grounds` — moved to `/wrangler/grounds`, with edit
access granted to the wrangler role and a separate, narrower create
("Add Ground") permission kept with GC (not wranglers).

---

## 2. Why grounds *edit* ≠ grounds *create*

Editing an existing ground (fixing a stale maps/hospital link) is exactly
the kind of low-risk data-hygiene task the wrangler role already exists for
— see `post-match-scorecard.md` §4. **Creating a brand-new ground is
master-data-tier** — the same category as adding a tournament or a captain
— so it stays gated to GC/admin rather than wrangler. The first cut of this
change missed that distinction (see §4 below).

---

## 3. Route & Nav Changes

- `/admin/grounds` deleted. UI moved to `src/app/wrangler/grounds/page.tsx`
  + `src/components/wrangler/GroundsClient.tsx` — out of the `/admin/*`
  layout, so it's no longer subject to the admin-only layout guard in
  `src/app/admin/layout.tsx`.
- Page guard: `isWrangler || isGC || isAdmin` (widened from admin-only so a
  GC-only member who isn't also a wrangler can still reach the page to add
  a ground).
- `SiteNav.tsx` — new "Wrangler ⚒" dropdown (desktop hover-menu + mobile
  section), visible whenever `isWrangler` (which already includes
  `isAdmin`), containing:
  - 🧩 Squad Backfill → `/wrangler/backfill-squad` (unchanged destination,
    just relocated out of the old flat `links` array)
  - 📍 Grounds → `/wrangler/grounds`
- 📍 Grounds was also added to the existing Council ⚖ dropdown (`isGC`) —
  a GC-only member otherwise has no nav path to a page whose URL starts
  with `/wrangler/`. See `gc-players.md` §11 for the full Council dropdown
  listing.
- `src/components/admin/AdminSidebar.tsx` — `/admin/grounds` entry removed.

---

## 4. Permission split (server-enforced) — `src/app/api/grounds/route.ts`

| Method | Auth | Purpose |
|---|---|---|
| GET | Public | Unchanged — grounds are displayed on public fixture cards |
| POST | `isGC \|\| isAdmin` | Create a new ground |
| PATCH | `isWrangler \|\| isAdmin` | Edit an existing ground's name/pitch type/maps/hospital URL |

`GroundsClient.tsx` takes `canAdd` / `canEdit` boolean props computed
server-side in the page from the session (never client-supplied) and hides
the "Add Ground" button/form and the per-row "Edit" button whenever the
signed-in user lacks that permission — the UI mirrors the API instead of
relying on the API to silently 403 a button that shouldn't have been shown.

> **Fixed same-day:** the first version of this change scoped `POST` to
> `isWrangler || isAdmin` — identical to `PATCH` — so wranglers could
> create brand-new grounds, not just edit existing ones. Corrected to
> `isGC || isAdmin` per §2 above, and the "Add Ground" button/form in
> `GroundsClient.tsx` is now gated on `canAdd`, not `canEdit`.

---

## 5. Missing-link advisory (UI fix)

`GroundsClient.tsx`'s table previously rendered "📍 Open Maps ↗" / "🏥 Open
Hospital ↗" as clickable links unconditionally — including for grounds with
no `maps_url` / `hospital_url` set, producing a dead link (`<a href="">`).
Now:

| Condition | Rendered as |
|---|---|
| URL is set | Normal link, unchanged |
| URL unset, viewer `canEdit` | Amber "⚠ Not set — add link" button that opens the edit form for that row |
| URL unset, viewer can't edit (e.g. GC-only viewer) | Plain amber "⚠ Not set" text, no action |

---

## 6. Pitch Type field (added September 2026)

`grounds.pitch_type` — `'Matted' | 'Astro' | 'Turf'`, nullable (migration
`078_grounds_pitch_type.sql`) — was added as a third classifiable ground
attribute alongside the maps/hospital links, specifically so Team Record
could offer a Pitch Type filter/split/then-by dimension. See
`features/team-stats.md` §6 for the backfill rule (Turf derived from
tournament names containing "Turf", everything else left unset for a
wrangler/admin to classify) and how it feeds that page.

Edit-permission split is unchanged from §4 — `PATCH` (wrangler or admin)
covers `pitch_type` the same as it already covers name/maps/hospital. It
was **not** added to the create (`POST`, GC/admin) form's required
fields — a brand-new ground doesn't have to be classified up front, same
"optional, can be set later" treatment as everywhere else on this page.
`GroundsClient.tsx` gained a Pitch Type select (Not set / Matted / Astro /
Turf) in both the Add and per-row Edit forms, plus its own table column —
a ground with no pitch type shows the same "⚠ Not set — classify" amber
affordance (wrangler/admin only; plain "⚠ Not set" text otherwise) the
Maps/Hospital columns already established in §5, rather than a new visual
pattern.

`isValidPitchType()` in `src/app/api/grounds/route.ts` is the one new
server-side check this added — it 400s a `pitch_type` outside the three
allowed values (or `null`/`''`, which clears it back to "not set") rather
than letting an invalid value reach the DB's own `CHECK` constraint and
surface as a raw 500. This is a plain enum guard, not the Zod schema §8
below still flags as missing from this route generally.

---

## 7. File Map

| File | Role |
|---|---|
| `src/app/wrangler/grounds/page.tsx` | Server component — role guard (`isWrangler \|\| isGC \|\| isAdmin`), computes `canAdd`/`canEdit` from session, renders `GroundsClient` |
| `src/components/wrangler/GroundsClient.tsx` | Client table — add/edit forms, missing-link advisory, Pitch Type select + column (§6); gated by `canAdd`/`canEdit` props |
| `src/app/api/grounds/route.ts` | GET public; POST `isGC \|\| isAdmin`; PATCH `isWrangler \|\| isAdmin`; `isValidPitchType()` enum guard (§6) |
| `supabase/migrations/078_grounds_pitch_type.sql` | `grounds.pitch_type` + the Turf-only backfill (§6; see `features/team-stats.md` §6 for the full rationale) |
| `src/app/wrangler/backfill-squad/page.tsx` | Unchanged — now reached via the Wrangler ⚒ dropdown instead of a flat nav link |
| `src/components/ui/SiteNav.tsx` | Wrangler ⚒ dropdown (desktop + mobile); Grounds link also added to Council ⚖ dropdown |
| `src/components/admin/AdminSidebar.tsx` | `/admin/grounds` entry removed |

---

## 8. Explicitly Out of Scope

- No Zod validation or rate limiting added to `/api/grounds` — matches the
  rest of the platform's pre-Sprint-3 state (see `pending-backlog.md`
  S-2/S-3), not introduced or fixed by this change. `pitch_type`'s own
  enum check (§6) is a plain hand-rolled guard, not a switch to Zod for
  the route as a whole.
- No `DELETE` on grounds — not requested, not added.
- `players.is_wrangler` and the wrangler persona itself are unchanged —
  see `post-match-scorecard.md` §4 for the full definition of that role.

---

*Maintained by: Spartans CC BLR · July 2026*
