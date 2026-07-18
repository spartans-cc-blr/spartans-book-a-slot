// Extracts the numeric CricHeroes profile ID from a player's cricheroes_url,
// for players.cricheroes_player_id — see
// supabase/migrations/047_cricheroes_player_id.sql.
//
// Two URL shapes exist in the wild:
//   - Direct:  https://cricheroes.com/player-profile/4601286/muthukumar-r/stats
//              -> ID is a plain regex extraction, no network call.
//   - Share link: https://chshare.link/player/tbXsKU
//              -> a CricHeroes-generated short redirect. The ID isn't in
//              the short link itself; the server has to follow the
//              redirect and read where it actually lands.
//
// Confirmed in production (2026-07-18): a plain, header-less fetch()
// against chshare.link comes back 200 with res.url unchanged (~700ms, not
// a timeout) — it isn't reachability, chshare.link is branching on
// User-Agent. A real browser opening the same link (confirmed by pasting
// the actual address-bar URL) lands on a Branch.io-style deferred-deep-
// -link fallback page after following real HTTP redirects:
//   https://crichero.es/?link=https://cricheroes.com/player-profile/4601286/Muthukumar-R&utm_source=app_share_android...
// The destination is right there as the `link` query parameter — no HTML
// parsing needed once fetch actually reaches it. Same class of fix this
// repo already needed once before for a different CricHeroes endpoint
// (pdf.cricheroes.in required a spoofed User-Agent/Referer — see
// limitations.md): send a realistic mobile-browser User-Agent so
// chshare.link serves the same redirect chain a real phone gets, instead
// of whatever fallback it serves to an unrecognised client.
//
// Kept the body-scan fallback too (see resolveShareLink) in case a future
// hop in the chain ever needs it — cheap insurance, not load-bearing for
// the case above once the header fix lands.
//
// Best-effort throughout: any failure (timeout, no match found, network
// error) returns null rather than throwing, so a save never fails because
// CricHeroes (or this specific link) is unreachable or unparseable.
// Never call fetch() against an arbitrary client-supplied host — only
// chshare.link is followed, everything else is a same-request regex or a
// no-op.

// Mimics a real Android Chrome browser — chshare.link's deep-link
// resolution behaves differently for an unrecognised/bot User-Agent than
// for what an actual player's phone sends.
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
}

const DIRECT_PROFILE_ID_RE = /cricheroes\.(?:com|in)\/player-profile\/(\d+)\b/i

// Share-link landing pages are small (link-preview HTML) — this is just
// defensive insurance against ever regex-scanning something huge.
const BODY_SCAN_LIMIT = 200_000

const SHARE_LINK_HOST = 'chshare.link'
const DIRECT_HOSTS = new Set(['cricheroes.com', 'cricheroes.in'])

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

async function resolveShareLink(url: string): Promise<string | null> {
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
      console.log('[cricheroesId] no ID found in share-link response', {
        requestUrl:  url,
        finalUrl:    res.url,
        status:      res.status,
        bodyLength:  body.length,
        bodySnippet: body.slice(0, 1000),
      })
    }
    return id
  } catch (err) {
    console.error('[cricheroesId] share-link resolution failed:', err)
    return null
  } finally {
    clearTimeout(timer)
  }
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
