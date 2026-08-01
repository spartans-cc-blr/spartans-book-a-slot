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

## Vercel Hobby — Cron Jobs Do Not Reliably Fire, Restricted or Not

Originally discovered via a real production failure on the
`lock-availability` cron: a schedule like `"30 2 * * 4"` (Thursday-only) is
silently accepted by `vercel.json` but **never actually fires** on the
Hobby plan. Hobby's own dashboard now discloses part of why — cron jobs on
Hobby only get a **flexible 1-hour firing window**, not an exact time, and
(per Vercel's docs) day-of-week-restricted schedules aren't reliably
honoured at all.

**Escalation (confirmed 2026-07-16):** the failure isn't limited to
day-of-week-restricted schedules. `lock-availability` had already been
moved to a truly-daily schedule (`"30 2 * * *"`) with an in-code Thursday
guard, plus a fix for a second, unrelated caching bug — and on the actual
Thursday it was meant to prove itself on, it *still* did not fire on its
own. Manually triggering the same route from the Vercel dashboard succeeded
immediately (the DB write went through, GC push notifications fired), which
ruled out a code bug — this is Vercel's own scheduler not invoking the
route, full stop. The same day, `/api/cron/backfill-scorecards` (a plain
unrestricted daily `"30 1 * * *"` schedule, no day-of-week guard at all)
was found to have **zero evidence of ever firing automatically** in its
entire history — every row in `scorecard_uploads` had been created by a
human via manual upload, never by the cron's own `uploaded_by: null` write
path, despite the feature having shipped weeks earlier. A ~33-booking
backlog (mid-March through early July) had quietly accumulated as a result.

**Impact:** any cron that needs to act on a specific day of the week (not
just "once a day") must fire daily and gate itself in code with an
IST-aware day check — see `lock-availability`'s `route.ts` for the pattern.
But even that workaround only addresses the day-of-week restriction, not
Hobby's broader invocation unreliability.

**Separate, permanent constraint: one invocation per day per cron job.**
Vercel Hobby does not allow a single `vercel.json` cron entry to fire more
than once a day, full stop — there's no way to express `"30 6,13 * * *"`
(twice daily) on the Vercel side the way GitHub Actions can. This is why
`vercel.json`'s entry for `/api/cron/backfill-scorecards` has only ever
carried one time of day; it was never an oversight or drift from an
intended twice-daily config there. Any cron on this project that genuinely
needs multiple fires per day (`backfill-scorecards` at 12:00 & 19:00 IST)
must rely on its GitHub Actions workflow for the additional fire(s) —
`vercel.json` can only ever cover one of them as a backup.

**Fix (implemented 2026-07-16):** all five crons now have a matching
GitHub Actions workflow in `.github/workflows/cron-*.yml` that calls the
same endpoint with the same `CRON_SECRET` on the same intended schedule,
using GitHub Actions' own scheduler instead of Vercel's — including native
day-of-week support, so `lock-availability`'s GitHub Actions workflow uses a
real `30 2 * * 4` expression with no in-code guard needed on that side.
Every affected route is idempotent, so running on both schedulers
simultaneously is safe — a same-day double-invocation is a no-op. The
`vercel.json` cron entries were left in place rather than removed, since an
occasional Vercel-side fire alongside the GitHub Actions one costs nothing.
One caveat carried over: GitHub Actions auto-disables scheduled workflows
after 60 days with no commits to the repo on any branch — not a concern for
an actively-developed project, but worth knowing if the repo ever goes
quiet for an extended period.

---

## Supabase Free Tier — Storage Cap

50MB storage limit. Approximately 100+ players at up to 5MB Google
profile photos each would exceed this.

**Decision:** Player photos sourced exclusively from Google OAuth —
no file uploads. `players.photo_url` stores the Google photo URL only.