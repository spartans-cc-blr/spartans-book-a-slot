# Ball-by-ball Commentary Upload — Feature Summary

**Spartans Hub · Added: October 2026**

---

## 1. Overview

Wranglers attach **ball-by-ball data** to a match whose scorecard is already
imported. For each match they upload two printed CricHeroes *commentary*
PDFs, one per innings (Spartans batting, opponent batting). The Python
microservice parses them into one row per delivery (bowler, striker, runs,
extras, shot/direction, dismissal and fielder) in the analytics DB's
`ball_by_ball` table.

Nothing refetches a scorecard. The page only lists bookings whose
`scorecard_uploads.status` is `parsed`/`synced`/`fees_applied` (so the
analytics DB already has the `match_stats` row), and the microservice only
*reads* that row and writes the two new tables.

---

## 2. Where things live

| Piece | Location |
|---|---|
| Page (wrangler/admin guard) | `src/app/wrangler/commentary/page.tsx` |
| Client UI | `src/components/wrangler/CommentaryClient.tsx` |
| API route | `src/app/api/wrangler/commentary/route.ts` |
| Shared types/validation | `src/lib/commentary.ts` |
| Parser, checks, storage | `spartans-python`: `utils/commentary_parser.py`, `utils/commentary_store.py`, `POST /parse-commentary` in `api.py` |
| Tables | analytics DB: `ball_by_ball`, `commentary_uploads`, view `bowler_over_summary` (`scripts/010_create_ball_by_ball.sql` in `spartans-python`, RLS on, service role only) |

Nav: 📊 Commentary in **Wrangler ⚒** (see `navigation.md`).

---

## 3. Flow

1. Wrangler picks a finished match (newest first).
2. Picks a PDF for each side. Each is **dry-run checked immediately**
   (`dry_run=true`, the route's default): nothing is saved.
3. The checks, run by the microservice: every over's runs and wickets
   against the page's own "END OF OVER" summary; six legal balls per over;
   the running score; the batting side, date and opponent against the match;
   and the total against the runs already stored in `match_stats`.
4. **Save** posts again with `dry_run=false`. If any check failed the
   microservice answers 422 and saves nothing, unless the wrangler ticked
   **Save anyway** (`save_anyway=true`); the failures are then stored in
   `commentary_uploads.warnings`.
5. Re-saving the same innings replaces its balls; the UI warns first.

---

## 4. Security

- `POST /api/wrangler/commentary`: `isWrangler || isAdmin`, re-validated per
  request; rate-limited (`adminWrite`).
- The CricHeroes match id is **re-derived from the booking server-side**; a
  `match_id` sent by the client is ignored.
- `MICROSERVICE_SECRET` is only sent server-to-server (`x-secret`).
- PDF validated by magic bytes and size; the microservice's 4xx messages (e.g.
  "match not imported yet") are shown, 5xx details are logged not returned.

---

## 5. Limits (Vercel Hobby)

- **4MB file cap** (Hobby rejects bodies over ~4.5MB): see
  `limitations.md` → "Vercel Hobby — 4.5MB request body". A phone print is
  ~0.7MB; desktop prints with background graphics can exceed it, and the UI
  says how to shrink the file.
- The outbound call has a 45s timeout under `maxDuration = 60` to survive a
  cold Render dyno (H-4/H-5).
- No new dependencies.

---

## 6. Deploy order

Merge and deploy `spartans-python` first (it adds `/parse-commentary`), then
this change. The tables already exist in the analytics DB.

## 7. Known gaps

- Individual flagged balls can't be edited here (the standalone Streamlit
  tool in `spartans-python/wrangler/` can). Fix a bad print by reprinting, or
  use *Save anyway*.
- No-ball, bye and leg-bye wording hasn't been seen in a real PDF yet; the
  parser flags unrecognised outcomes instead of guessing.
