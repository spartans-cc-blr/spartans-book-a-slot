// Extracts the numeric CricHeroes profile ID from a player's cricheroes_url,
// for players.cricheroes_player_id — see
// supabase/migrations/047_cricheroes_player_id.sql.
//
// Three URL shapes exist in the wild:
//   - Direct:  https://cricheroes.com/player-profile/4601286/muthukumar-r/stats
//              -> ID is a plain regex extraction, no network call.
//   - Deep-link landing page: https://crichero.es/?link=https://cricheroes.com/player-profile/4601286/Muthukumar-R&utm_source=...
//              -> what a phone's browser actually lands on when a
//              chshare.link share link is tapped (see below) — the real
//              destination is right there as the `link` query parameter.
//              Same plain regex extraction, no network call — this is
//              the one players should actually paste (see PLAYER GUIDANCE
//              below), not the raw share-link text.
//   - Share link: https://chshare.link/player/tbXsKU
//              -> the CricHeroes app's own "share profile" button gives
//              only this. See resolveShareLink for why this one is a
//              known dead end server-side.
//
// PLAYER GUIDANCE (surfaced on /profile — no desktop needed): tap the
// share link on your phone; when the browser shows an "Open in app?"
// interstitial (before or instead of confirming it), copy the URL from
// the address bar at that point — it's the crichero.es one above — and
// paste that instead of the original share text.
//
// Direct-from-Vercel resolution (chshare.link -> follow redirect)
// confirmed NOT working in production, 2026-07-18, after multiple
// attempts documented in this repo's PR history for this file: fetch()
// consistently gets a 200 with an empty-query 404 shell (Next.js
// `/[type]/[code]` route resolving with no params at all), identical
// across a header-less attempt and a spoofed-mobile-browser-User-Agent
// attempt. That consistency — not a timeout, not a real error, the exact
// same degraded response regardless of headers sent — has the signature
// of deliberate anti-automation hardening at the edge (CloudFront/WAF,
// likely keyed on Vercel's known cloud IP ranges rather than headers),
// which is a legitimate thing for a Branch.io-style deferred-deep-link
// service to do — its entire purpose is funneling real users into
// installing the app, so auto-resolving it programmatically undermines
// that.
//
// Second attempt: the same resolution, proxied through the
// `spartans-python` analytics microservice on Render
// (POST /resolve-cricheroes-link, same MICROSERVICE_URL/SECRET as the
// scorecard pipeline — see features/post-match-scorecard.md). Render's
// outbound IP range is different from Vercel's, so this is a genuinely
// separate test, not a repeat of the same blocked attempt — but it's not
// guaranteed to succeed either; if CricHeroes' edge is blocking on
// something other than IP range, this will fail identically. Both
// attempts are kept as harmless best-effort — either can fail and the
// save still succeeds with cricheroes_player_id left null.
//
// Best-effort throughout: any failure (timeout, no match found, network
// error) returns null rather than throwing, so a save never fails because
// CricHeroes (or this specific link) is unreachable or unparseable.
// Never call fetch() against an arbitrary client-supplied host — only
// chshare.link is followed, everything else is a same-request regex or a
// no-op.

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
}

const DIRECT_PROFILE_ID_RE = /cricheroes\.(?:com|in)\/player-profile\/(\d+)\b/i

// Share-link landing pages are small (link-preview HTML) — this is just
// defensive insurance against ever regex-scanning something huge.
const BODY_SCAN_LIMIT = 200_000

const SHARE_LINK_HOST = 'chshare.link'

// Every host in this set carries an extractable cricheroes.com/.in profile
// URL directly in the string itself — either as the URL's own path
// (cricheroes.com/.in) or embedded as a query parameter (crichero.es) —
// so no network call is ever needed for any of them.
const DIRECT_HOSTS = new Set(['cricheroes.com', 'cricheroes.in', 'crichero.es'])

// Redirect-follow is a single, fast hop for a URL shortener — no reason
// this should ever take long. Bounded well under the request's own budget
// so a slow/hanging CricHeroes never turns a profile save into a timeout.
const REDIRECT_TIMEOUT_MS = 6000

function isHost(hostname: string, target: string): boolean {
  const h = hostname.toLowerCase()
  return h === target || h.endsWith(`.${target}`)
}

// Shared with src/lib/schemas.ts's cricheroes_url validation — one source
// of truth for "is this actually a CricHeroes URL", since that validation
// is also this module's SSRF boundary (only these hosts are ever fetched).
export function isCricheroesUrl(url: string): boolean {
  let hostname: string
  try {
    hostname = new URL(url).hostname
  } catch {
    return false
  }
  return Array.from(DIRECT_HOSTS).concat(SHARE_LINK_HOST).some(host => isHost(hostname, host))
}

// Tries the raw text first, then a percent-decoded pass — the `link=`
// query param carrying the real destination may or may not be
// URL-encoded depending on which hop it's read from.
function extractDirectId(text: string): string | null {
  const direct = text.match(DIRECT_PROFILE_ID_RE)
  if (direct) return direct[1]
  try {
    const decoded = decodeURIComponent(text)
    const fromDecoded = decoded.match(DIRECT_PROFILE_ID_RE)
    if (fromDecoded) return fromDecoded[1]
  } catch {
    // malformed percent-encoding — already tried raw, nothing more to do
  }
  return null
}

async function resolveShareLinkDirect(url: string): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REDIRECT_TIMEOUT_MS)
  try {
    const res = await fetch(url, { redirect: 'follow', signal: controller.signal, headers: BROWSER_HEADERS })

    const fromRedirect = extractDirectId(res.url)
    if (fromRedirect) return fromRedirect

    // No real HTTP redirect happened (res.url === the short link itself) —
    // fall back to scanning the page body for the destination.
    const body = await res.text()
    const id = extractDirectId(body.slice(0, BODY_SCAN_LIMIT))
    if (!id) {
      // Diagnostic only — no ID found isn't an error condition on its own,
      // but leaves nothing to debug from without this. Logged at info
      // level (not error) since a share link genuinely not resolving is
      // an expected, non-alarming outcome, not a system fault.
      // Full body, not a truncated snippet — bodyLength has consistently
      // come back small (~1.4KB) for this share-link host, so there's no
      // real risk of an oversized log line here.
      console.log('[cricheroesId] no ID found in direct share-link response', {
        requestUrl: url,
        finalUrl:   res.url,
        status:     res.status,
        bodyLength: body.length,
        body,
      })
    }
    return id
  } catch (err) {
    console.error('[cricheroesId] direct share-link resolution failed:', err)
    return null
  } finally {
    clearTimeout(timer)
  }
}

// Render free-tier cold start can take ~30s if the microservice has spun
// down from inactivity — see features/post-match-scorecard.md's Render
// hosting note. Only reached as a fallback after the direct attempt
// already failed, so the extra latency only ever applies to a save that
// was already going to come back with cricheroes_player_id: null anyway.
const MICROSERVICE_TIMEOUT_MS = 30_000

async function resolveShareLinkViaMicroservice(url: string): Promise<string | null> {
  const microserviceUrl    = process.env.MICROSERVICE_URL
  const microserviceSecret = process.env.MICROSERVICE_SECRET
  if (!microserviceUrl || !microserviceSecret) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), MICROSERVICE_TIMEOUT_MS)
  try {
    const res = await fetch(`${microserviceUrl}/resolve-cricheroes-link`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-secret': microserviceSecret },
      body:    JSON.stringify({ url }),
      signal:  controller.signal,
    })
    if (!res.ok) {
      console.log('[cricheroesId] microservice resolution returned non-ok', { status: res.status })
      return null
    }
    const data = await res.json()
    return typeof data.player_id === 'string' ? data.player_id : null
  } catch (err) {
    console.error('[cricheroesId] microservice resolution failed:', err)
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function resolveShareLink(url: string): Promise<string | null> {
  const direct = await resolveShareLinkDirect(url)
  if (direct) return direct
  return resolveShareLinkViaMicroservice(url)
}

// Never throws. Returns null for anything not a recognisable CricHeroes
// URL, or if extraction/resolution fails for any reason.
export async function resolveCricheroesPlayerId(cricheroesUrl: string | null | undefined): Promise<string | null> {
  if (!cricheroesUrl) return null

  let hostname: string
  try {
    hostname = new URL(cricheroesUrl).hostname
  } catch {
    return null
  }

  for (const host of Array.from(DIRECT_HOSTS)) {
    if (isHost(hostname, host)) return extractDirectId(cricheroesUrl)
  }

  if (isHost(hostname, SHARE_LINK_HOST)) return resolveShareLink(cricheroesUrl)

  return null
}

// Applied to a PATCH/insert `updates` object right before it's written.
// Only touches cricheroes_player_id when cricheroes_url is actually part
// of this write — leaves it alone otherwise. Clearing cricheroes_url
// (null/empty) clears the derived ID too, since it'd otherwise point at a
// link the player no longer has on file.
export async function withCricheroesPlayerId<T extends Record<string, any>>(updates: T): Promise<T> {
  if (!('cricheroes_url' in updates)) return updates
  const url = updates.cricheroes_url as string | null | undefined
  const cricheroes_player_id = url ? await resolveCricheroesPlayerId(url) : null
  return { ...updates, cricheroes_player_id }
}
