# Post-Match Scorecard Integration Plan
**Spartans Hub · Data Wranglers Integration**
*Prepared: June 2026 · Status: Planning*
 
---
 
## 1. Overview
 
This document describes the end-to-end plan to integrate the existing analytics
pipeline (`spartans-dw-ui`) with the Spartans Hub so that match scorecards can be
uploaded and processed from within the Hub by captains, vice-captains, and data
wranglers — with no manual Python runs required after the initial deployment.
 
---
 
## 2. Permanent Limitations
 
> These are fixed constraints that apply to all design decisions in this plan.
> Do not re-evaluate or work around these — they are confirmed and documented.
 
| Limitation | Detail |
|---|---|
| **CricHeroes blocks all automated access** | Confirmed via `robots.txt`. No server-side fetch, no headless browser, no workaround. PDF download from the CricHeroes desktop site remains the only reliable data source. |
| **Vercel cannot run Python** | Hub is deployed on Vercel (Next.js). Vercel does not support Python runtimes. All Python analytics code must remain in `spartans-dw-ui` and be hosted separately. |
| **Google Drive OAuth not suitable for hosted services** | `g_drive.py` uses `token.pickle` + `credentials.json` (personal OAuth). This cannot be hosted on a server without re-auth breaking on token expiry. The Drive step is bypassed in the Hub integration — PDFs come directly from the Hub upload instead. The Drive-based local workflow continues to work for wranglers' standalone runs. |
| **Supabase free tier — 50MB storage cap** | No file storage in Hub DB. PDFs are forwarded directly to the microservice and not persisted in Supabase. |
 
---
 
## 3. Architecture
 
### 3.1 Two Repos, Permanently Separate
 
```
spartans-dw-ui  (Python · Railway)    spartans-hub  (Next.js · Vercel)
══════════════════════════════════    ══════════════════════════════════
pdf_extractor.py   ← untouched        /api/matches/[id]/scorecard
field_extractors.py ← untouched       /api/admin/sync-match-stats
dismissal_parser.py ← untouched       /api/admin/apply-match-fees
mvp_calculator.py  ← untouched        match_stats_cache  (Hub DB table)
import_to_supabase.py ← untouched     scorecard_uploads  (Hub DB table)
api.py             ← NEW ONLY
```
 
### 3.2 End-to-End Data Flow
 
```
CricHeroes desktop site
        │  (manual PDF download — permanent)
        ▼
Captain / VC / Wrangler opens completed match in Hub
        │
        ▼
"Upload Scorecard" button → file picker (PDF only)
        │
        ▼
POST /api/matches/[id]/scorecard  (Hub — auth: captain | VC | wrangler)
        │  validates file type + size server-side
        │  checks uploader is captain/VC for this specific booking
        │  OR has is_wrangler = true
        ▼
Railway microservice  (spartans-dw-ui/api.py)
        │  pdf_extractor → field_extractors → dismissal_parser
        │  mvp_calculator → import_to_supabase
        ▼
Analytics Supabase DB
  match_stats / batting_stats / bowling_stats / fielding_stats / team_list
        │
        ▼
POST /api/admin/sync-match-stats  (Hub — admin only)
        │  reads from analytics DB (separate env vars)
        │  upserts into Hub DB: match_stats_cache
        ▼
Admin reviews stats in /admin/bookings/[id]
        │
        ▼
POST /api/admin/apply-match-fees  (Hub — admin only, explicit confirmation)
        │  debits wallet_balance per squad member
        │  updates scorecard_uploads.status → 'fees_applied'
        ▼
Match card on /fixtures shows result + top scorer + top bowler
```
 
---
 
## 4. New Persona — Data Wrangler (`is_wrangler`)
 
### 4.1 Why a New Persona
 
Currently Hub has three boolean flags on the `players` table:
- `is_captain` — gates Captains Corner
- `is_gc` — gates GC Review
- `isAdmin` — from `ADMIN_EMAILS` env var (not DB)
Data wranglers need upload access to completed matches without captain-level or
admin-level access to the rest of the Hub. A new `is_wrangler` flag follows the
exact same pattern as `is_gc`.
 
### 4.2 Schema Change
 
**File:** `supabase/migrations/008_add_wrangler_persona.sql`
 
```sql
-- Migration: 008_add_wrangler_persona
-- Adds data wrangler persona to players table.
-- Set is_wrangler = true via admin players page for wrangler team members.
 
ALTER TABLE players
  ADD COLUMN is_wrangler boolean NOT NULL DEFAULT false;
 
COMMENT ON COLUMN players.is_wrangler IS
  'Data wrangler — can upload match scorecards and access completed match stats. No captain or admin privileges.';
```
 
### 4.3 JWT Token Change
 
**File:** `src/lib/auth.ts` — JWT callback (add one line, same pattern as `isGC`)
 
```ts
// Add alongside existing isCaptain, isGC lines:
token.isWrangler = player.is_wrangler ?? false
```
 
**File:** `src/types/next-auth.d.ts` — extend session type
 
```ts
isWrangler?: boolean
```
 
### 4.4 Access Gates
 
| Feature | Captain | VC (match) | Wrangler | Admin |
|---|---|---|---|---|
| Upload scorecard | ✅ (own match only) | ✅ (own match only) | ✅ (any match) | ✅ |
| View completed matches | ✅ | ✅ | ✅ | ✅ |
| Sync stats from analytics DB | ❌ | ❌ | ❌ | ✅ |
| Apply match fees | ❌ | ❌ | ❌ | ✅ |
| Captains Corner | ✅ | ❌ | ❌ | ✅ |
| GC Review | ❌ | ❌ | ❌ | ✅ |
 
> **Security (vibe-security):** Captain/VC check for upload must verify the uploader
> is captain or VC for **this specific booking** via a `squad` table lookup — not
> just any player where `players.is_captain = true`. `is_wrangler` bypasses the
> per-booking check but still requires an authenticated session with a valid `playerId`.
 
---
 
## 5. Database Migrations (Hub DB)
 
### 5.1 Migration 008 — Wrangler Persona
*(Described in Section 4.2 above)*
 
### 5.2 Migration 009 — `match_stats_cache`
 
**File:** `supabase/migrations/009_match_stats_cache.sql`
 
```sql
-- Migration: 009_match_stats_cache
-- Caches parsed match stats from analytics DB into Hub DB.
-- All reads/writes via service role through API routes only.
-- JSON arrays avoid separate batting/bowling tables — keeps Hub schema lean.
 
CREATE TABLE IF NOT EXISTS match_stats_cache (
  match_id          text PRIMARY KEY,
  booking_id        uuid REFERENCES bookings(id) ON DELETE SET NULL,
 
  -- Match level
  match_result      text,          -- 'won' | 'lost' | 'tied' | 'no result'
  team_total        int,
  team_wickets      int,
  team_overs        float,
  opponent_total    int,
  opponent_wickets  int,
  opponent_overs    float,
  opponent_name     text,
  ground            text,
  tournament_name   text,
  match_date        date,
 
  -- Per-player arrays (jsonb — matches analytics DB column structure exactly)
  batting           jsonb,         -- array of batting_stats rows
  bowling           jsonb,         -- array of bowling_stats rows
  fielding          jsonb,         -- array of fielding_stats rows
  team_list         jsonb,         -- array of { match_id, player_name }
 
  -- Meta
  synced_at         timestamptz NOT NULL DEFAULT now(),
  synced_by         uuid REFERENCES players(id) ON DELETE SET NULL
);
 
COMMENT ON TABLE match_stats_cache IS
  'Read-only cache of match stats synced from analytics Supabase DB. '
  'Source of truth remains analytics DB. Hub reads from here for display only.';
```
 
### 5.3 Migration 010 — `scorecard_uploads`
 
**File:** `supabase/migrations/010_scorecard_uploads.sql`
 
```sql
-- Migration: 010_scorecard_uploads
-- Tracks scorecard upload status per booking.
-- One row per booking. Status progresses linearly.
 
CREATE TYPE scorecard_status AS ENUM (
  'pending_parse',   -- PDF uploaded, sent to microservice, awaiting parse
  'parsed',          -- stats written to analytics DB, awaiting admin sync
  'synced',          -- admin synced stats into match_stats_cache
  'fees_applied'     -- admin applied match fees, wallets debited
);
 
CREATE TABLE IF NOT EXISTS scorecard_uploads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  match_id        text,                          -- from bookings.match_id
 
  status          scorecard_status NOT NULL DEFAULT 'pending_parse',
 
  uploaded_by     uuid REFERENCES players(id) ON DELETE SET NULL,
  uploaded_at     timestamptz NOT NULL DEFAULT now(),
  fees_applied_at timestamptz,
  fees_applied_by uuid REFERENCES players(id) ON DELETE SET NULL,
 
  error_message   text,          -- populated if microservice parse fails
 
  UNIQUE (booking_id)            -- one upload record per match
);
 
COMMENT ON TABLE scorecard_uploads IS
  'Tracks the lifecycle of scorecard upload and processing per booking.';
```
 
---
 
## 6. Analytics Repo Changes (`spartans-dw-ui`)
 
### 6.1 What Does NOT Change
 
All of the following are untouched:
 
- `utils/pdf_extractor.py`
- `utils/field_extractors.py`
- `utils/field_config.py`
- `utils/dismissal_parser.py`
- `utils/mvp_calculator.py`
- `utils/csv_writers.py`
- `utils/g_drive.py`
- `utils/cricheroes_helper.py`
- `scripts/import_to_supabase.py`
- `scripts/*.sql`
- `main.py`
- `stats_by_house.py`
The Drive-based local workflow (`main.py` → Drive → parse → analytics DB) continues
to work exactly as before. The new `api.py` is an additional entry point, not a
replacement.
 
### 6.2 New File: `api.py`
 
A FastAPI wrapper that exposes the existing pipeline as HTTP endpoints.
 
```python
# api.py — FastAPI wrapper for spartans-dw-ui analytics pipeline
# Deploy on Railway. Hub calls this after PDF upload.
# Requires: pip install fastapi uvicorn python-multipart
 
import os
import tempfile
from fastapi import FastAPI, UploadFile, File, HTTPException, Header
from fastapi.responses import JSONResponse
 
# Import existing pipeline utils (unchanged)
from utils.pdf_extractor import PDFTextExtractor
from utils.field_extractors import extract_all_fields
from utils.dismissal_parser import parse_dismissals
from utils.mvp_calculator import calculate_mvp_scores
from scripts.import_to_supabase import SupabaseImporter
 
app = FastAPI(title="Spartans Analytics Microservice")
 
MICROSERVICE_SECRET = os.environ.get("MICROSERVICE_SECRET", "")
SUPABASE_URL        = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY        = os.environ.get("SUPABASE_KEY", "")
 
 
def verify_secret(x_secret: str = Header(None)):
    """Reject requests without the shared secret."""
    if not MICROSERVICE_SECRET or x_secret != MICROSERVICE_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorised")
 
 
@app.get("/health")
def health():
    return {"status": "ok"}
 
 
@app.post("/parse-scorecard")
async def parse_scorecard(
    file: UploadFile = File(...),
    match_id: str    = None,
    x_secret: str    = Header(None),
):
    """
    Accept a PDF scorecard from Hub, run the analytics pipeline,
    write to analytics DB, return parsed stats summary.
    """
    verify_secret(x_secret)
 
    # Validate file type
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="PDF files only")
 
    # Write to temp file (pipeline expects a file path)
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        contents = await file.read()
        if len(contents) > 10 * 1024 * 1024:  # 10MB cap
            raise HTTPException(status_code=400, detail="File too large (max 10MB)")
        tmp.write(contents)
        tmp_path = tmp.name
 
    try:
        # Run existing pipeline (same as main.py flow)
        extractor = PDFTextExtractor(tmp_path)
        blocks    = extractor.extract_text_with_blocks()
        extractor.close_document()
 
        fields    = extract_all_fields(blocks)
        fields    = parse_dismissals(fields)
        fields    = calculate_mvp_scores(fields)
 
        if match_id:
            fields["match_stats"]["match_id"] = match_id
 
        # Write to analytics DB (existing importer, unchanged)
        importer = SupabaseImporter(SUPABASE_URL, SUPABASE_KEY)
        importer.import_from_dict(fields)   # see note below
 
        return JSONResponse({
            "ok":          True,
            "match_id":    fields.get("match_stats", {}).get("match_id"),
            "match_result": fields.get("match_stats", {}).get("match_result"),
            "team_total":  fields.get("match_stats", {}).get("team_total"),
        })
 
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
 
    finally:
        os.unlink(tmp_path)
```
 
> **Note on `import_from_dict`:** The existing `SupabaseImporter` reads from CSV
> files. Add an `import_from_dict(data: dict)` method that accepts the parsed dict
> directly and calls the same Supabase upsert logic — bypassing the CSV step for
> the Hub flow. The CSV flow remains available for local runs.
 
### 6.3 Railway Deployment
 
1. Create a new Railway project pointing at `spartans-dw-ui` repo
2. Set start command: `uvicorn api:app --host 0.0.0.0 --port $PORT`
3. Set environment variables in Railway dashboard:
```
SUPABASE_URL        = <analytics Supabase URL>
SUPABASE_KEY        = <analytics Supabase service role key>
MICROSERVICE_SECRET = <generate a strong random string — share with Hub team>
```
 
4. Note the Railway app URL (e.g. `https://spartans-dw.railway.app`)
### 6.4 New `requirements.txt` entries
 
```
fastapi
uvicorn[standard]
python-multipart
```
 
---
 
## 7. Hub Repo Changes (`spartans-hub`)
 
### 7.1 New Environment Variables
 
Add to Vercel dashboard (never `NEXT_PUBLIC_` prefix — server-side only):
 
```
ANALYTICS_SUPABASE_URL     = <analytics Supabase URL>
ANALYTICS_SUPABASE_KEY     = <analytics Supabase service role key>
MICROSERVICE_URL           = https://spartans-dw.railway.app
MICROSERVICE_SECRET        = <same value as Railway env var>
```
 
### 7.2 New API Routes
 
#### `POST /api/matches/[id]/scorecard`
 
**File:** `src/app/api/matches/[id]/scorecard/route.ts`
 
```ts
// Auth: captain or VC for this specific booking, OR is_wrangler
// Validates PDF server-side. Forwards to Railway microservice.
// Updates scorecard_uploads record.
 
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session  = await getServerSession(authOptions)
  const user     = session?.user as any
  if (!user?.playerId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
 
  const supabase = createServiceClient()
 
  // Auth check — per-booking captain/VC OR wrangler
  // NEVER trust client: always verify server-side
  if (!user.isWrangler) {
    const { data: squadRow } = await supabase
      .from('squad')
      .select('is_captain, is_vc')
      .eq('booking_id', params.id)
      .eq('player_id', user.playerId)   // must be THIS player in THIS booking
      .single()
 
    if (!squadRow?.is_captain && !squadRow?.is_vc) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }
 
  // Validate booking exists and is completed
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, match_id, game_date, slot_time, format')
    .eq('id', params.id)
    .eq('status', 'confirmed')
    .single()
 
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
 
  // Must be a completed match
  const endTime = getMatchEndTime(booking.game_date, booking.slot_time, booking.format)
  if (new Date() < endTime) {
    return NextResponse.json({ error: 'Match not yet completed' }, { status: 400 })
  }
 
  // Validate file — server-side, never trust Content-Type header
  const formData = await req.formData()
  const file     = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
 
  const bytes = await file.arrayBuffer()
  const buf   = Buffer.from(bytes)
 
  // Check PDF magic bytes (not Content-Type)
  if (buf.slice(0, 4).toString() !== '%PDF') {
    return NextResponse.json({ error: 'File must be a valid PDF' }, { status: 400 })
  }
  if (buf.length > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 })
  }
 
  // Upsert upload record
  await supabase.from('scorecard_uploads').upsert({
    booking_id:  params.id,
    match_id:    booking.match_id,
    status:      'pending_parse',
    uploaded_by: user.playerId,
    uploaded_at: new Date().toISOString(),
  }, { onConflict: 'booking_id' })
 
  // Forward to microservice
  const fd = new FormData()
  fd.append('file', new Blob([buf], { type: 'application/pdf' }), file.name)
  if (booking.match_id) fd.append('match_id', booking.match_id)
 
  const msRes = await fetch(`${process.env.MICROSERVICE_URL}/parse-scorecard`, {
    method:  'POST',
    headers: { 'x-secret': process.env.MICROSERVICE_SECRET! },
    body:    fd,
  })
 
  if (!msRes.ok) {
    const err = await msRes.text()
    await supabase.from('scorecard_uploads')
      .update({ error_message: err })
      .eq('booking_id', params.id)
    return NextResponse.json({ error: 'Parse failed', detail: err }, { status: 502 })
  }
 
  // Update status to parsed
  await supabase.from('scorecard_uploads')
    .update({ status: 'parsed' })
    .eq('booking_id', params.id)
 
  const result = await msRes.json()
  return NextResponse.json({ ok: true, ...result })
}
```
 
---
 
#### `POST /api/admin/sync-match-stats`
 
**File:** `src/app/api/admin/sync-match-stats/route.ts`
 
```ts
// Admin only. Reads from analytics DB. Writes to match_stats_cache in Hub DB.
 
export async function POST(req: Request) {
  const guard = await requireAdmin()
  if (guard) return guard
 
  const { booking_id } = await req.json()
 
  const hubSupabase      = createServiceClient()
  const analyticsSupabase = createClient(
    process.env.ANALYTICS_SUPABASE_URL!,
    process.env.ANALYTICS_SUPABASE_KEY!
  )
 
  // Get match_id from booking
  const { data: booking } = await hubSupabase
    .from('bookings')
    .select('match_id')
    .eq('id', booking_id)
    .single()
 
  if (!booking?.match_id) {
    return NextResponse.json({ error: 'No match_id on this booking' }, { status: 400 })
  }
 
  const mid = booking.match_id
 
  // Fetch all stats from analytics DB in parallel
  const [match, batting, bowling, fielding, team] = await Promise.all([
    analyticsSupabase.from('match_stats').select('*').eq('match_id', mid).single(),
    analyticsSupabase.from('batting_stats').select('*').eq('match_id', mid),
    analyticsSupabase.from('bowling_stats').select('*').eq('match_id', mid),
    analyticsSupabase.from('fielding_stats').select('*').eq('match_id', mid),
    analyticsSupabase.from('team_list').select('*').eq('match_id', mid),
  ])
 
  if (!match.data) {
    return NextResponse.json({ error: 'No stats found in analytics DB for this match_id' }, { status: 404 })
  }
 
  // Upsert into Hub DB cache
  await hubSupabase.from('match_stats_cache').upsert({
    match_id:        mid,
    booking_id:      booking_id,
    match_result:    match.data.match_result,
    team_total:      match.data.team_total,
    team_wickets:    match.data.team_wickets,
    team_overs:      match.data.team_overs,
    opponent_total:  match.data.opponent_total,
    opponent_wickets: match.data.opponent_wickets,
    opponent_overs:  match.data.opponent_overs,
    opponent_name:   match.data.opponent_name,
    ground:          match.data.ground,
    tournament_name: match.data.tournament_name,
    batting:         batting.data,
    bowling:         bowling.data,
    fielding:        fielding.data,
    team_list:       team.data,
    synced_at:       new Date().toISOString(),
  }, { onConflict: 'match_id' })
 
  // Update upload record
  await hubSupabase.from('scorecard_uploads')
    .update({ status: 'synced' })
    .eq('booking_id', booking_id)
 
  return NextResponse.json({ ok: true })
}
```
 
---
 
#### `POST /api/admin/apply-match-fees`
 
**File:** `src/app/api/admin/apply-match-fees/route.ts`
 
```ts
// Admin only. Explicit confirmation required — never auto-triggered.
// Debits wallet_balance for each squad member on this booking.
 
export async function POST(req: Request) {
  const guard = await requireAdmin()
  if (guard) return guard
 
  const { booking_id, fee_per_player, confirm } = await req.json()
 
  // Explicit confirmation flag must be true — never auto-fire
  if (!confirm) {
    return NextResponse.json({ error: 'confirmation required' }, { status: 400 })
  }
 
  const supabase = createServiceClient()
 
  // Fetch announced squad for this booking
  const { data: squad } = await supabase
    .from('squad')
    .select('player_id, players(wallet_balance, fee_exemptions)')
    .eq('booking_id', booking_id)
    .eq('status', 'announced')
 
  if (!squad?.length) {
    return NextResponse.json({ error: 'No announced squad found' }, { status: 400 })
  }
 
  const today = new Date().toISOString().split('T')[0]
  const debits: string[] = []
 
  for (const row of squad) {
    const player    = row.players as any
    const isExempt  = (player?.fee_exemptions ?? []).some(
      (e: any) => e.start_date <= today && (e.end_date === null || e.end_date >= today)
    )
    if (isExempt) continue
 
    await supabase
      .from('players')
      .update({ wallet_balance: (player.wallet_balance ?? 0) - fee_per_player })
      .eq('id', row.player_id)
 
    debits.push(row.player_id)
  }
 
  // Mark fees as applied
  await supabase.from('scorecard_uploads').update({
    status:          'fees_applied',
    fees_applied_at: new Date().toISOString(),
  }).eq('booking_id', booking_id)
 
  return NextResponse.json({ ok: true, debited: debits.length })
}
```
 
---
 
### 7.3 Completed Match Visibility
 
**File:** `src/app/fixtures/page.tsx`
 
Change the bookings query to also fetch completed matches (last 30 days):
 
```ts
// Before
.gte('game_date', yesterday)
 
// After — fetch last 30 days to include completed matches
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  .toISOString().split('T')[0]
 
.gte('game_date', thirtyDaysAgo)
```
 
Split results after fetch:
 
```ts
const activeBookings    = bookings.filter(b => getMatchStatus(...) !== 'ended')
const completedBookings = bookings.filter(b => getMatchStatus(...) === 'ended')
```
 
Completed section visible to: `isCaptain || isWrangler || isAdmin`
 
**File:** `src/app/fixtures/[id]/page.tsx`
 
Remove the redirect for expired matches. Instead pass `matchStatus` including
`'ended'` to `FixturesCard` — the card renders a completed state rather than
redirecting.
 
---
 
### 7.4 Upload UI — Completed Match Card
 
Add to `FixturesCard.tsx` — shown when `matchStatus === 'ended'`:
 
```tsx
{matchStatus === 'ended' && canUpload && (
  <ScorecardUploadButton
    bookingId={booking.id}
    currentStatus={uploadStatus}  // from scorecard_uploads
  />
)}
```
 
`canUpload` computed server-side:
```ts
const canUpload = user?.isWrangler
  || squadRow?.is_captain
  || squadRow?.is_vc
  || user?.isAdmin
```
 
`ScorecardUploadButton` states:
 
| `uploadStatus` | Button label | Behaviour |
|---|---|---|
| `null` | Upload Scorecard | File picker → POST |
| `pending_parse` | Processing... | Spinner, disabled |
| `parsed` | Stats Ready (Pending Admin Sync) | Disabled, amber |
| `synced` | Stats Synced ✓ | Disabled, green |
| `fees_applied` | Fees Applied ✓ | Disabled, green |
 
---
 
### 7.5 Admin Post-Match Panel
 
Add to `/admin/bookings/[id]` — new "Post-Match" section:
 
```
POST-MATCH
──────────────────────────────────────────────────────
Upload Status:  parsed  (uploaded by Rahul · 14 Jun)
 
[ Sync Stats from Analytics DB ]
 
──────────────────────────────────────────────────────
Stats Preview (once synced):
  Result:    Won by 24 runs
  Score:     156/6 (20 ov) vs 132/9 (20 ov)
 
  Top Bat:   Rohan — 54 (38)
  Top Bowl:  Arjun — 3/18 (4 ov)
 
──────────────────────────────────────────────────────
[ Apply Match Fees — ₹X per player · 11 players ]
  ⚠️  This will debit wallets for 11 players.
      2 players are fee-exempt and will be skipped.
      [ Confirm & Apply ]
```
 
---
 
## 8. Navigation Changes
 
**File:** `src/components/SiteNav.tsx`
 
Add wrangler nav item (same pattern as GC):
 
```ts
// Add to nav array
{ href: '/wrangler', label: 'Stats Upload', icon: '📊', show: isWrangler || isAdmin }
```
 
Or surface completed matches within the existing `/fixtures` page under a
"Completed" section — no new route needed. Recommended to keep nav flat.
 
---
 
## 9. Execution Order with Dependencies
 
```
Phase 0 — Documentation (no code, 30 min)
  └─ Add permanent limitations to limitations.md
  └─ Record this plan in project knowledge
 
Phase 1 — DB Migrations (no external deps, start immediately)
  ├─ 008_add_wrangler_persona.sql
  ├─ 009_match_stats_cache.sql
  └─ 010_scorecard_uploads.sql
 
Phase 2 — Analytics Microservice (parallel with Phase 1)
  ├─ Add import_from_dict() method to SupabaseImporter
  ├─ Write api.py (FastAPI wrapper)
  ├─ Update requirements.txt
  ├─ Deploy to Railway
  └─ Share: Railway URL + MICROSERVICE_SECRET with Hub team
 
Phase 3 — Hub Auth Extension (depends on: Phase 1)
  ├─ src/lib/auth.ts — add isWrangler to JWT callback
  └─ src/types/next-auth.d.ts — extend session type
 
Phase 4 — Hub API Routes (depends on: Phase 1 + Phase 2 + Phase 3)
  ├─ POST /api/matches/[id]/scorecard
  ├─ POST /api/admin/sync-match-stats
  └─ POST /api/admin/apply-match-fees
 
Phase 5 — Completed Match Visibility (depends on: Phase 1 + Phase 3)
  ├─ fixtures/page.tsx — extend query to 30 days, split active/completed
  └─ fixtures/[id]/page.tsx — remove expired redirect, add 'ended' state
 
Phase 6 — Upload UI (depends on: Phase 4 + Phase 5)
  ├─ ScorecardUploadButton component
  └─ FixturesCard — completed state + upload button
 
Phase 7 — Admin Post-Match Panel (depends on: Phase 4 + Phase 6)
  └─ /admin/bookings/[id] — post-match section
 
Phase 8 — Wrangler Admin Management (depends on: Phase 1 + Phase 3)
  └─ /admin/players — add is_wrangler toggle in edit form
     (same pattern as is_captain toggle already there)
```
 
**Dependency tree:**
 
```
Phase 0
    │
Phase 1 ──────────────────────────────────┐
    │                                      │
    ├── Phase 2 (parallel)                 │
    │       │                              │
Phase 3 ◄───┘                             │
    │                                      │
    ├── Phase 4 ◄── needs Phase 2          │
    │       │                              │
    ├── Phase 5 ◄──────────────────────────┘
    │       │
    └── Phase 6 ◄── needs Phase 4 + Phase 5
            │
        Phase 7
        Phase 8
```
 
---
 
## 10. Security Checklist (vibe-security)
 
| Check | Detail |
|---|---|
| Upload auth is per-booking, not just role | `squad` table lookup confirms uploader is captain/VC for **this specific booking** |
| `is_wrangler` bypasses per-booking check | Acceptable — wrangler is a trusted role set only by admin |
| PDF validated by magic bytes, not Content-Type | `%PDF` header check prevents disguised file uploads |
| File size capped at 10MB server-side | Both Hub API route and microservice enforce this independently |
| `MICROSERVICE_SECRET` never in client bundle | No `NEXT_PUBLIC_` prefix. Sent server-to-server only |
| `ANALYTICS_SUPABASE_KEY` never in client bundle | No `NEXT_PUBLIC_` prefix. Service role key — server-side only |
| `ANALYTICS_SUPABASE_URL` never in client bundle | No `NEXT_PUBLIC_` prefix. Analytics DB URL hidden from browser |
| Apply fees requires explicit `confirm: true` | Never auto-triggered. Admin must send `{ confirm: true }` explicitly |
| Fee-exempt players skipped server-side | Exemption check runs server-side — never relying on client to filter |
| `isWrangler` from DB, `isAdmin` from env var | Consistent with existing pattern — admin cannot be escalated via DB |
| Wallet debit has no client-facing price param | `fee_per_player` derived server-side from `bookings.match_fee_override ?? tournaments.match_fee` — resolved June 2026 |

 
---
 
## 11. Open Questions
 
| Question | Owner | Notes |
|---|---|---|
| Match fee amount — fixed or per tournament? | Muthu | Currently passed as `fee_per_player` from admin UI. Should it come from `tournaments` table? |
| Match fee amount — fixed or per tournament? | Muthu | ✅ Resolved June 2026 — `tournaments.match_fee` is the default; `bookings.match_fee_override` allows per-game override. Fee derived server-side, never from client input. |
| Wrong PDF uploaded — admin override? | Muthu | Can re-upload (upsert logic handles it) but need a "Reset" option in admin |
| Wrangler nav — separate `/wrangler` route or within `/fixtures`? | Design | Recommend within fixtures to keep nav flat |
| `import_from_dict` implementation | Wrangler team | Needs to be added to `SupabaseImporter` in analytics repo |
| Railway free tier limits | Wrangler team | Free tier has sleep after inactivity — first request after sleep may be slow (~30s). Acceptable for admin-triggered flow |
 
---
 
*Maintained by: Spartans CC BLR · Coordinator: Muthu*
*Security audit: vibe-security patterns applied per SKILL.md*
*Analytics pipeline: spartans-dw-ui repo · Hub: spartans-hub repo*