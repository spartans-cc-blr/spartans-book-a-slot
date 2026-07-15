# Spartans Hub — Permanent Limitations

**Last updated: July 2026**

---

## CricHeroes — Corrected (July 2026): PDF endpoint IS directly fetchable

> ⚠️ The original "automated access blocked" finding below was **only true
> for the scorecard webpage**, not for CricHeroes's PDF endpoint. Corrected
> after empirically proving the fetch works — see
> `features/post-match-scorecard.md` Section 3 for the full pipeline this
> unlocked. Left the original wording below intact (struck through in
> spirit, not literally) so the history of the mistake is visible — don't
> re-block on this again without re-testing.

**Still true:** the CricHeroes scorecard **webpage** is a JS-rendered SPA.
`robots.txt` disallows crawling it, and a server-side fetch or headless
client gets nothing useful back from it directly.

**Was wrongly assumed to also be true, and isn't:** CricHeroes's own PDF
endpoint — `https://pdf.cricheroes.in/scorecard-summary/{match_id}/...` —
is a plain HTTP resource. A server-side `fetch()` with the right headers
(`User-Agent`, `Accept: application/pdf,*/*`, `Referer: https://cricheroes.in/`)
returns a normal 200 with the PDF bytes. No headless browser, no Playwright,
no login. This is now the primary automated path (`POST
/fetch-and-parse-scorecard` on the analytics microservice, called by
`src/lib/scorecardBackfill.ts`) — manual PDF upload from the desktop site
remains a fallback for matches this doesn't work for, not the only option.

**Decision (June 2026, still valid):** Python microservice on Render
(`spartans-python` repo). PDF → analytics pipeline → analytics Supabase →
Hub sync. The sync step is no longer admin-only — see
`features/post-match-scorecard.md` Section 4 for the widened access matrix.

---

## Vercel Hobby — No Python Runtime

Hub is deployed on Vercel Hobby (Next.js). Vercel does not support
Python runtimes. All Python analytics code must remain in the
separate `spartans-python` repo and be hosted independently (currently
on Render — the microservice moved off the originally-planned Railway).

**Impact:** Post-match stat collection cannot be fully in-Hub.
Requires the Python microservice bridge described above.

---

## Vercel Hobby — Cron Jobs Cannot Restrict Day-of-Week

Discovered via a real production failure on the `lock-availability` cron: a
schedule like `"30 2 * * 4"` (Thursday-only) is silently accepted by
`vercel.json` but **never actually fires** on the Hobby plan. Hobby only
reliably fires schedules that run unrestricted every day.

**Impact:** any cron that needs to act on a specific day of the week (not
just "once a day") must fire daily and gate itself in code with an
IST-aware day check — see `lock-availability`'s `route.ts` for the pattern.
This is fragile in a way a real weekly schedule wouldn't be (a second,
unrelated bug — Next.js caching the route's Supabase calls — nearly
sabotaged it even after the daily-plus-guard fix landed; see that file's
git history). For a genuinely reliable weekly trigger on Hobby, an external
scheduler (e.g. a GitHub Actions cron workflow calling the endpoint) is the
safer alternative — not yet implemented, proposed but deferred.

---

## Supabase Free Tier — Storage Cap

50MB storage limit. Approximately 100+ players at up to 5MB Google
profile photos each would exceed this.

**Decision:** Player photos sourced exclusively from Google OAuth —
no file uploads. `players.photo_url` stores the Google photo URL only.