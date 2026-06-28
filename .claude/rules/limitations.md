# Spartans Hub — Permanent Limitations

**Last updated: June 2026**

---

## CricHeroes — Automated Access Blocked

CricHeroes disallows all automated access via `robots.txt`.
Confirmed blocked:
- Server-side fetch from Next.js API routes
- Claude web_fetch tool
- Any headless HTTP client

**Impact:**
- Scorecard HTML cannot be scraped from Hub directly
- No Option A (Node.js HTML parser) — infeasible
- PDF download from CricHeroes desktop site requires either:
  - Manual download by admin, or
  - Playwright browser automation on a separate hosted service

**Decision (June 2026):** Option B — Python microservice on Railway/Render.
PDF → analytics pipeline → analytics Supabase → Hub sync via
`POST /api/admin/sync-match-stats` (admin-only, service role server-side only).

---

## Vercel Hobby — No Python Runtime

Hub is deployed on Vercel Hobby (Next.js). Vercel does not support
Python runtimes. All Python analytics code must remain in the
separate `spartans-dw-ui` repo and be hosted independently.

**Impact:** Post-match stat collection cannot be fully in-Hub.
Requires the Python microservice bridge described above.

---

## Supabase Free Tier — Storage Cap

50MB storage limit. Approximately 100+ players at up to 5MB Google
profile photos each would exceed this.

**Decision:** Player photos sourced exclusively from Google OAuth —
no file uploads. `players.photo_url` stores the Google photo URL only.