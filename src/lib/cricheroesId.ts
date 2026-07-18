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
// Best-effort throughout: any failure (timeout, non-CricHeroes redirect
// target, network error) returns null rather than throwing, so a save
// never fails because CricHeroes (or this specific link) is unreachable.
// Never call fetch() against an arbitrary client-supplied host — only
// chshare.link is followed, everything else is a same-request regex or a
// no-op.

const DIRECT_PROFILE_ID_RE = /cricheroes\.(?:com|in)\/player-profile\/(\d+)\b/i

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

function extractDirectId(url: string): string | null {
  const m = url.match(DIRECT_PROFILE_ID_RE)
  return m ? m[1] : null
}

async function resolveShareLink(url: string): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REDIRECT_TIMEOUT_MS)
  try {
    const res = await fetch(url, { redirect: 'follow', signal: controller.signal })
    return extractDirectId(res.url)
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
