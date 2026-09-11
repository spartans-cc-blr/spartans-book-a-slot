// app/page.tsx
// Spartans Hub — Home / Landing Page
// Split-audience: players see a personalised dashboard, organisers see a schedule CTA.
// Logged-out users see both paths clearly.

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { SiteNav } from '@/components/ui/SiteNav'
import Link from 'next/link'
import { getNudgeForPlayer, getWeekendGapForPlayer } from '@/lib/availabilityNudge'
import { WeekendAvailabilityGreeting } from '@/components/ui/WeekendAvailabilityGreeting'
import { SelectedMatchCard } from '@/components/home/SelectedMatchCard'

export const revalidate = 60

async function getPlayerData(playerId: string, playerStatus: string | null | undefined) {
  const supabase = createServiceClient()
  const today = new Date().toISOString().split('T')[0]

  // All nine queries below are independent of each other — none consumes
  // another's result — so they're issued together instead of one-after-
  // another. (The one query that genuinely depends on one of these — the
  // full squad list for "You're Selected to Play" bookings — runs as a
  // follow-up after this Promise.all resolves, see below.)
  const [
    { count: upcomingCount },
    { data: avail },
    { data: upcomingPreview },
    { data: squadPlayedRows },
    { data: playerRow },
    { data: squadTournamentRows },
    { data: mySelectedSquadRows },
    nudge,
    weekendGap,
  ] = await Promise.all([
    // Upcoming fixtures count
    supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'confirmed')
      .gte('game_date', today),

    // Player's availability responses for upcoming matches
    supabase
      .from('availability')
      .select('booking_id, response')
      .eq('player_id', playerId),

    // Next few confirmed fixtures — feeds both the "Next Match" callout
    // (first row) and the Upcoming Fixtures preview list on the dashboard.
    // Fetches more than the 3 actually shown (see `otherUpcoming` below) so
    // there's still a full 3 left over once bookings already covered by the
    // "You're Selected to Play" section are filtered out.
    supabase
      .from('bookings')
      .select(`
        id, game_date, slot_time, format, opponent_name,
        tournament:tournaments(name, ball_type)
      `)
      .eq('status', 'confirmed')
      .gte('game_date', today)
      .order('game_date', { ascending: true })
      .order('slot_time', { ascending: true })
      .limit(8),

    // Every squad row this player has ever been announced in, joined to
    // its booking's game_date/status — feeds the Matches Played stat tile
    // (this year's count + all-time last-played date). Same Hub-side
    // squad-join approach GC Players' "last played" field uses (see
    // gc-players.md §7/§9), rather than the analytics DB, to avoid the
    // player_id reconciliation gaps documented there.
    supabase
      .from('squad')
      .select('booking:bookings!inner(game_date, status)')
      .eq('player_id', playerId),

    // Wallet balance — feeds the Wallet Balance stat tile
    supabase
      .from('players')
      .select('wallet_balance, dues_override')
      .eq('id', playerId)
      .single(),

    // Distinct tournaments this player has ever been announced in a squad
    // for — feeds the My Tournaments stat tile. A plain count over `squad`
    // rather than the analytics DB, deliberately not sourced from the
    // analytics DB, same reasoning as above.
    supabase
      .from('squad')
      .select('booking:bookings!inner(tournament_id)')
      .eq('player_id', playerId),

    // Every announced squad row this player is currently in — feeds the
    // "You're Selected to Play" card. Filtered/sorted below (not in the
    // query itself) to which of these bookings are still upcoming, same
    // "join broadly, filter in code" pattern the two squad queries above
    // already use rather than fighting PostgREST's embedded-filter syntax.
    supabase
      .from('squad')
      .select(`
        booking:bookings!inner(
          id, game_date, slot_time, match_time, format, opponent_name, cricheroes_url, match_stage, status,
          match_fee_override,
          tournament:tournaments(name, ball_type, match_fee, cricheroes_points_table_url, ground:grounds(name, maps_url, hospital_url)),
          ground:grounds(name, maps_url, hospital_url)
        )
      `)
      .eq('player_id', playerId)
      .eq('status', 'announced'),

    // Read-only rendering of the same Sun-Wed nudge logic the cron uses —
    // shows this player's own "still open, matches your pattern" nudge, if any.
    getNudgeForPlayer(supabase, playerId, playerStatus),

    // Day-agnostic weekend gap — powers the first-open-of-day greeting dialog.
    // Unlike `nudge` above, this isn't gated to Sun-Wed.
    getWeekendGapForPlayer(supabase, playerId, playerStatus),
  ])

  const nextFixture = upcomingPreview?.[0] ?? null

  // Player's availability for next fixture
  const nextFixtureResponse = nextFixture
    ? avail?.find(a => a.booking_id === nextFixture.id)?.response ?? null
    : null

  const walletBalance = playerRow?.wallet_balance ?? 0
  const duesOverride = !!playerRow?.dues_override

  const tournamentCount = new Set(
    (squadTournamentRows ?? [])
      .map(r => (r as any).booking?.tournament_id)
      .filter(Boolean)
  ).size

  // Confirmed bookings only, already played (game_date <= today) —
  // announced-but-upcoming squad rows don't count as "played" yet.
  const playedBookings = (squadPlayedRows ?? [])
    .map(r => (r as any).booking)
    .filter((b: any) => b?.status === 'confirmed' && b.game_date <= today)
  const currentYear = String(new Date().getFullYear())
  const matchesPlayedThisYear = playedBookings.filter((b: any) => b.game_date.startsWith(currentYear)).length
  const lastPlayedOn = playedBookings.length
    ? playedBookings.reduce((max: string, b: any) => (b.game_date > max ? b.game_date : max), playedBookings[0].game_date)
    : null

  // Upcoming bookings this player has an *announced* squad row for — feeds
  // the "You're Selected to Play" card, shown ahead of the Upcoming
  // Fixtures preview. Unlike the first cut of this feature, these bookings
  // are now excluded from the plain Upcoming Fixtures list below — the
  // selected-to-play section is where they live now, not both places.
  const selectedUpcomingBookings = (mySelectedSquadRows ?? [])
    .map(r => (r as any).booking)
    .filter((b: any) => b?.status === 'confirmed' && b.game_date >= today)
    .sort((a: any, b: any) =>
      a.game_date === b.game_date ? a.slot_time.localeCompare(b.slot_time) : a.game_date.localeCompare(b.game_date)
    )
  const selectedBookingIds = new Set(selectedUpcomingBookings.map((b: any) => b.id))

  // The plain Upcoming Fixtures preview — whatever's left of the fetched
  // candidate pool once bookings already surfaced above are filtered out,
  // capped back down to the usual 3-row preview.
  const otherUpcoming = (upcomingPreview ?? [])
    .filter((b: any) => !selectedBookingIds.has(b.id))
    .slice(0, 3)

  // Player's availability for every fixture actually shown in the Upcoming
  // Fixtures preview — feeds the badge on each row.
  const previewResponses: Record<string, string> = {}
  for (const fx of otherUpcoming) {
    const r = avail?.find(a => a.booking_id === fx.id)?.response
    if (r) previewResponses[fx.id] = r
  }

  // Live exemption check — same logic /fixtures itself uses (src/app/fixtures/page.tsx).
  function isCurrentlyExempt(exemptions: { start_date: string; end_date: string | null }[]): boolean {
    return (exemptions ?? []).some(
      e => e.start_date <= today && (e.end_date === null || e.end_date >= today)
    )
  }

  let selectedToPlay: any[] = []
  if (selectedUpcomingBookings.length > 0) {
    const selectedIds = selectedUpcomingBookings.map((b: any) => b.id)
    const { data: fullSquadRows } = await supabase
      .from('squad')
      .select('booking_id, is_captain, is_vc, is_wk, players(id, name, cricheroes_url, fee_exemptions(start_date, end_date))')
      .in('booking_id', selectedIds)
      .eq('status', 'announced')

    const squadByBooking: Record<string, any[]> = {}
    for (const row of fullSquadRows ?? []) {
      const p = (row as any).players
      if (!p) continue
      if (!squadByBooking[row.booking_id]) squadByBooking[row.booking_id] = []
      squadByBooking[row.booking_id].push({
        id: p.id, name: p.name, cricheroes_url: p.cricheroes_url,
        is_match_captain: row.is_captain, is_vc: row.is_vc, is_wk: row.is_wk,
        fee_exemptions: p.fee_exemptions ?? [],
      })
    }

    // Running balance for the wallet-after-this-match projection — same
    // "chain across matches chronologically" approach /fixtures itself
    // uses. selectedUpcomingBookings is already game_date/slot_time
    // ascending, so this naturally deducts each match's fee before the
    // next card's projection is computed.
    let runningWalletBalance: number | null = walletBalance

    selectedToPlay = selectedUpcomingBookings.map((b: any) => {
      const squadRows = squadByBooking[b.id] ?? []
      const baseFee: number | null = b.match_fee_override ?? b.tournament?.match_fee ?? null
      const nonExemptCount = squadRows.filter((p: any) => !isCurrentlyExempt(p.fee_exemptions)).length
      const feePerPlayer = baseFee && squadRows.length > 0
        ? (nonExemptCount > 0 ? Math.ceil(baseFee / nonExemptCount) : null)
        : null

      const myRow = squadRows.find((p: any) => p.id === playerId)
      const isExempt = myRow ? isCurrentlyExempt(myRow.fee_exemptions) : false

      const loggedInWalletBalance = runningWalletBalance
      if (!isExempt && feePerPlayer !== null && runningWalletBalance !== null) {
        runningWalletBalance = runningWalletBalance - feePerPlayer
      }

      return {
        ...b,
        squad: squadRows
          .map((p: any) => ({
            id: p.id, name: p.name, cricheroes_url: p.cricheroes_url,
            is_match_captain: p.is_match_captain, is_vc: p.is_vc, is_wk: p.is_wk,
          }))
          .sort((x: any, y: any) => x.name.localeCompare(y.name)),
        feePerPlayer,
        isLoggedInPlayerExempt: isExempt,
        loggedInWalletBalance,
      }
    })
  }

  return {
    upcomingCount: upcomingCount ?? 0,
    upcomingPreview: otherUpcoming,
    nextFixture, nextFixtureResponse, previewResponses, nudge, weekendGap,
    walletBalance, duesOverride, tournamentCount,
    matchesPlayedThisYear, lastPlayedOn,
    selectedToPlay,
  }
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

function slotLabel(slot: string) {
  const map: Record<string, string> = {
    '07:30': '7:15 AM', '10:30': '10:15 AM', '12:30': '12:15 PM', '14:30': '2:15 PM',
  }
  return map[slot] || slot
}

function formatRupees(n: number) {
  return `₹${Math.abs(n).toLocaleString('en-IN')}`
}

function formatSignedRupees(n: number) {
  return `${n < 0 ? '-' : ''}₹${Math.abs(n).toLocaleString('en-IN')}`
}

// Short "last played" caption for the Matches Played stat tile — no
// weekday (unlike formatDate, used for fixture rows where the day of week
// matters); year included only when it isn't the current one, to keep a
// tile-width caption from wrapping.
function formatLastPlayed(dateStr: string) {
  const d = new Date(dateStr)
  const year = d.getFullYear()
  const currentYear = new Date().getFullYear()
  const short = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  return `Last played ${short}${year === currentYear ? '' : `, ${year}`}`
}

const AVAIL_CONFIG: Record<string, { color: string; bg: string; border: string; label: string }> = {
  Y: { color: '#4ade80', bg: '#1a4731', border: '#166534', label: 'Available' },
  E: { color: '#60a5fa', bg: '#1e3a5f', border: '#1d4ed8', label: 'Either game today' },
  O: { color: '#fbbf24', bg: '#3d2e00', border: '#d97706', label: 'One game this weekend' },
  L: { color: '#c084fc', bg: '#2e1a47', border: '#7e22ce', label: 'On leave' },
}

// --- icons — light-theme dashboard set, 20px stroke ---
function CalendarGlyph({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="5" width="17" height="15" rx="2" /><line x1="3.5" y1="9.5" x2="20.5" y2="9.5" /><line x1="8" y1="3" x2="8" y2="7" /><line x1="16" y1="3" x2="16" y2="7" />
    </svg>
  )
}
function TrophyGlyph({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4z" /><path d="M7 5H4.5A2.5 2.5 0 0 0 4 9.9c.4 1.3 1.6 2.1 3 2.1" /><path d="M17 5h2.5A2.5 2.5 0 0 1 20 9.9c-.4 1.3-1.6 2.1-3 2.1" /><line x1="12" y1="13" x2="12" y2="17" /><path d="M9 20h6" /><path d="M10 17h4v3h-4z" />
    </svg>
  )
}
function CheckGlyph({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.5" /><polyline points="8.5 12.5 11 15 15.5 9.5" />
    </svg>
  )
}
function RupeeGlyph({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="4" x2="18" y2="4" /><line x1="6" y1="8" x2="18" y2="8" /><path d="M6 8c5 0 7.5 1.5 7.5 4.5S13 17 8 17" /><line x1="8" y1="17" x2="18" y2="21" />
    </svg>
  )
}
function ClipboardGlyph({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="4.5" width="12" height="16" rx="1.6" /><path d="M9 4.5V3.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" /><polyline points="8.5 12.5 10.5 14.5 15 10" />
    </svg>
  )
}
function ScalesGlyph({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="3" x2="12" y2="19" /><line x1="5" y1="7" x2="19" y2="7" /><path d="M5 7l-3 6a3 3 0 0 0 6 0l-3-6z" /><path d="M19 7l-3 6a3 3 0 0 0 6 0l-3-6z" /><path d="M8 21h8" />
    </svg>
  )
}
function PersonGlyph({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="3.5" /><path d="M4.5 20c1.2-4 4-6 7.5-6s6.3 2 7.5 6" />
    </svg>
  )
}
function ChevronGlyph({ color = '#A8A29E' }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 5 16 12 9 19" />
    </svg>
  )
}

// Stat tile — light card, Warm Light palette. Pass `href` to make the whole
// tile a tap target (e.g. "Upcoming Matches" → /fixtures); omitted for tiles
// with no drill-down destination yet (e.g. "My Tournaments" — see
// navigation.md's Home page section for why that one stays static for now).
function StatTile({ icon, value, label, tag, tone, href, sublabel }: {
  icon: React.ReactNode; value: string | number; label: string; tag?: string
  tone: 'gold' | 'amber' | 'emerald' | 'crimson'
  href?: string
  sublabel?: string
}) {
  const toneMap = {
    gold:    { bg: '#FEF3C7', tagBg: '#FEF3C7', tagText: '#B45309' },
    amber:   { bg: '#FEF3C7', tagBg: '#FEF3C7', tagText: '#B45309' },
    emerald: { bg: '#D1FAE5', tagBg: '#D1FAE5', tagText: '#059669' },
    crimson: { bg: '#FEE2E2', tagBg: '#FEE2E2', tagText: '#DC2626' },
  }[tone]

  const content = (
    <>
      <div className="flex items-start justify-between mb-3">
        <span className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: toneMap.bg }}>
          {icon}
        </span>
        {tag && (
          <span className="font-rajdhani text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full"
            style={{ background: toneMap.tagBg, color: toneMap.tagText }}>
            {tag}
          </span>
        )}
      </div>
      <p className="font-cinzel text-2xl font-bold" style={{ color: '#1C1917' }}>{value}</p>
      <p className="font-rajdhani text-xs mt-1" style={{ color: '#78716C' }}>{label}</p>
      {sublabel && (
        <p className="font-rajdhani text-[10px] mt-0.5" style={{ color: '#A8A29E' }}>{sublabel}</p>
      )}
    </>
  )

  if (href) {
    return (
      <Link href={href}
        className="rounded-xl p-4 block transition-colors hover:bg-black/[0.02] active:bg-black/[0.04]"
        style={{ background: '#FFFFFF', border: '1px solid #D4C9B0' }}>
        {content}
      </Link>
    )
  }

  return (
    <div className="rounded-xl p-4" style={{ background: '#FFFFFF', border: '1px solid #D4C9B0' }}>
      {content}
    </div>
  )
}

function QuickActionRow({ href, icon, title, subtitle }: {
  href: string; icon: React.ReactNode; title: string; subtitle: string
}) {
  return (
    <Link href={href}
      className="flex items-center gap-3 py-3 px-3 -mx-1 rounded-lg transition-colors hover:bg-black/[0.03]">
      <span className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#FEF3C7' }}>
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-rajdhani text-sm font-bold" style={{ color: '#1C1917' }}>{title}</p>
        <p className="font-rajdhani text-xs" style={{ color: '#78716C' }}>{subtitle}</p>
      </div>
      <ChevronGlyph />
    </Link>
  )
}

export default async function HomePage() {
  const session = await getServerSession(authOptions)
  const player  = session?.user as any

  const isLoggedIn  = !!session
  const isPlayer    = isLoggedIn && !!player?.playerId && player?.playerStatus !== 'expelled'
  const isCaptain   = isPlayer && !!player?.isCaptain
  const isGC        = isPlayer && !!player?.isGC
  const isAdmin     = isLoggedIn && !!player?.isAdmin
  const isExpelled  = isLoggedIn && player?.playerStatus === 'expelled'
  const isUnmatched = isLoggedIn && !player?.playerId && !isExpelled

  const playerData = isPlayer ? await getPlayerData(player.playerId, player?.playerStatus) : null
  const firstName  = player?.playerName?.split(' ')[0] ?? 'Spartan'

  return (
    <div className="min-h-screen bg-ink grain">
      <SiteNav activePage="home" />

      {/* ── HERO ── */}
      <div className="relative overflow-hidden bg-ink-2 border-b border-ink-4">
        {/* Background glow */}
        <div className="absolute -top-16 -right-16 w-80 h-80 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(201,168,76,0.08) 0%, transparent 70%)' }} />
        <div className="absolute -bottom-8 -left-8 w-60 h-60 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(192,19,44,0.06) 0%, transparent 70%)' }} />

        <div className="px-5 md:px-8 lg:px-10 py-10 md:py-14 relative z-10">
          <p className="text-gold text-xs font-rajdhani font-semibold tracking-[3px] uppercase mb-3 flex items-center gap-2">
            <span className="w-4 h-px bg-gold inline-block" />
            Spartans Cricket Club · Bengaluru · Est. 2014
          </p>
          <h1 className="font-cinzel text-3xl md:text-4xl font-bold text-parchment mb-3 tracking-wide leading-tight">
            Spartans Hub
          </h1>
          <p className="text-muted text-sm md:text-base max-w-lg leading-relaxed font-rajdhani">
            Club operations platform — fixtures, availability, scheduling and more.
          </p>
        </div>
      </div>

      {/* ── EXPELLED STATE ── */}
      {isExpelled && (
        <div className="px-5 md:px-8 lg:px-10 py-8 max-w-4xl">
          <div className="bg-red-950/40 border border-red-800 rounded p-6 text-center">
            <p className="font-cinzel text-red-400 font-semibold mb-1">Account Suspended</p>
            <p className="font-rajdhani text-sm text-red-600">
              Your account has been suspended. Contact the club admin for more information.
            </p>
          </div>
        </div>
      )}

      {/* ── UNMATCHED (signed in but not a registered player) ── */}
      {isUnmatched && (
        <div className="px-5 md:px-8 lg:px-10 py-8 max-w-4xl">
          <div className="bg-amber-950/30 border border-amber-800/50 rounded p-5 flex items-start gap-4">
            <span className="text-2xl flex-shrink-0">👋</span>
            <div>
              <p className="font-cinzel text-sm text-amber-300 font-semibold mb-1">
                You're signed in but not registered as a Spartans player
              </p>
              <p className="font-rajdhani text-xs text-amber-600 mb-3">
                Your Google account ({player?.email}) isn't linked to a player profile yet. Contact the admin to get set up.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── PLAYER DASHBOARD — Warm Light, self-contained (nav + hero above stay dark) ── */}
      {isPlayer && playerData && (
        <div style={{ background: '#F0F4F5' }} className="px-5 md:px-8 lg:px-10 py-6">
          <div className="max-w-4xl mx-auto">
            <WeekendAvailabilityGreeting
              playerId={player.playerId}
              firstName={firstName}
              bookings={playerData.weekendGap}
            />

            {/* Welcome banner */}
            <div className="rounded-2xl p-6 mb-5 flex flex-wrap items-start justify-between gap-4"
              style={{ background: 'linear-gradient(135deg, #FEF3C7 0%, #FFF7ED 100%)' }}>
              <div>
                <img
                  src={player?.photoUrl ?? player?.image ?? '/default-avatar.png'}
                  alt=""
                  className="w-10 h-10 rounded-full object-cover border-2 mb-3"
                  style={{ borderColor: '#D97706' }}
                />
                <p className="font-cinzel text-2xl font-bold leading-snug" style={{ color: '#1C1917' }}>
                  Welcome back, {firstName}! 👋
                </p>
                <p className="font-rajdhani text-sm mt-1 max-w-md" style={{ color: '#57534E' }}>
                  Here's your real-time overview for matches &amp; availability.
                </p>
              </div>
              <span className="font-rajdhani text-xs font-bold px-4 py-2 rounded-full flex items-center gap-2 flex-shrink-0"
                style={{ background: '#FFFFFF', color: '#B45309', border: '1px solid #F5D9A8' }}>
                🛡️ Spartans CC Bengaluru
              </span>
            </div>

            {/* Stat tiles — 2x2 */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <StatTile
                icon={<CalendarGlyph color="#B45309" />}
                value={playerData.upcomingCount}
                label="Upcoming Matches"
                tag="Upcoming"
                tone="gold"
                href="/fixtures"
              />
              <StatTile
                icon={<TrophyGlyph color="#B45309" />}
                value={playerData.tournamentCount}
                label="My Tournaments"
                tag="Tournaments"
                tone="gold"
              />
              <StatTile
                icon={<CheckGlyph color="#B45309" />}
                value={playerData.matchesPlayedThisYear}
                label="Matches Played"
                sublabel={playerData.lastPlayedOn ? formatLastPlayed(playerData.lastPlayedOn) : 'No matches yet'}
                tag={String(new Date().getFullYear())}
                tone="gold"
                href="/matches/history?month=all"
              />
              <StatTile
                icon={<RupeeGlyph color={playerData.walletBalance >= 0 ? '#059669' : '#DC2626'} />}
                value={formatSignedRupees(playerData.walletBalance)}
                label="Wallet Balance"
                tag={
                  playerData.walletBalance >= 0
                    ? undefined
                    : playerData.duesOverride
                    ? 'Exempted'
                    : 'Overdue'
                }
                tone={
                  playerData.walletBalance >= 0
                    ? 'emerald'
                    : playerData.duesOverride
                    ? 'amber'
                    : 'crimson'
                }
                href="/wallet"
              />
            </div>

            {/* Availability nudge — read-only rendering of the Sun-Wed cron logic */}
            {playerData.nudge && (
              <Link href={`/fixtures/${playerData.nudge.booking.id}`}
                className="mb-5 flex items-center justify-between gap-4 rounded-xl p-4 transition-colors group"
                style={{ background: '#FEF3C7', border: '1px solid #F5D9A8' }}>
                <div className="flex items-start gap-3 min-w-0">
                  <span className="text-xl flex-shrink-0">{playerData.nudge.title.split(' ')[0]}</span>
                  <div className="min-w-0">
                    <p className="font-cinzel text-xs font-semibold truncate" style={{ color: '#92400E' }}>
                      {playerData.nudge.title.replace(/^\S+\s/, '')}
                    </p>
                    <p className="font-rajdhani text-xs mt-0.5" style={{ color: '#B45309' }}>
                      {playerData.nudge.body}
                    </p>
                  </div>
                </div>
                <span className="font-rajdhani text-xs font-bold flex-shrink-0" style={{ color: '#B45309' }}>
                  Mark now →
                </span>
              </Link>
            )}

            {/* You're Selected to Play — one card per upcoming booking with an
                announced squad this player is in. Shown ahead of Upcoming
                Fixtures below; those bookings are excluded from that plain
                list (see otherUpcoming in getPlayerData) so they aren't
                shown twice. */}
            {playerData.selectedToPlay.length > 0 && (
              <div className="mb-5">
                <h2 className="font-cinzel text-lg font-bold flex items-center gap-2 mb-3" style={{ color: '#1C1917' }}>
                  <span className="w-1 h-5 rounded-full inline-block" style={{ background: '#059669' }} />
                  You're Selected to Play
                </h2>
                {playerData.selectedToPlay.map((match: any) => (
                  <SelectedMatchCard key={match.id} match={match} viewerPlayerId={player.playerId} />
                ))}
              </div>
            )}

            {/* Upcoming Fixtures — relabelled "Upcoming Other Fixtures" once
                the section above exists, since this list no longer includes
                those bookings. */}
            <div className="rounded-xl p-5 mb-5" style={{ background: '#FFFFFF', border: '1px solid #D4C9B0' }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-cinzel text-lg font-bold flex items-center gap-2" style={{ color: '#1C1917' }}>
                  <span className="w-1 h-5 rounded-full inline-block" style={{ background: '#D97706' }} />
                  {playerData.selectedToPlay.length > 0 ? 'Upcoming Other Fixtures' : 'Upcoming Fixtures'}
                </h2>
                <Link href="/fixtures" className="font-rajdhani text-sm font-bold" style={{ color: '#D97706' }}>
                  View All →
                </Link>
              </div>

              {playerData.upcomingPreview.length === 0 ? (
                <div className="rounded-xl py-10 flex flex-col items-center text-center border-2 border-dashed" style={{ borderColor: '#D4C9B0' }}>
                  <CalendarGlyph color="#A8A29E" />
                  <p className="font-cinzel text-base font-bold mt-3" style={{ color: '#1C1917' }}>
                    {playerData.selectedToPlay.length > 0 ? 'No Other Matches Scheduled' : 'No Upcoming Matches Scheduled'}
                  </p>
                  <p className="font-rajdhani text-sm mt-1 max-w-xs" style={{ color: '#78716C' }}>
                    Check fixtures for your next match once it's confirmed.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {playerData.upcomingPreview.map((fx: any) => {
                    const resp = playerData.previewResponses[fx.id] ?? null
                    return (
                      <Link key={fx.id} href="/fixtures"
                        className="flex items-center justify-between gap-3 rounded-lg p-3 transition-colors hover:bg-black/[0.03]"
                        style={{ background: '#F8F4EE' }}>
                        <div className="min-w-0">
                          <p className="font-rajdhani text-sm font-bold truncate" style={{ color: '#1C1917' }}>
                            vs {fx.opponent_name ?? 'TBD'}
                          </p>
                          <p className="font-rajdhani text-xs mt-0.5" style={{ color: '#78716C' }}>
                            {fx.tournament?.name ?? fx.format} · {formatDate(fx.game_date)} · {slotLabel(fx.slot_time)}
                          </p>
                        </div>
                        {resp ? (
                          <span className="font-rajdhani text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full flex-shrink-0"
                            style={{ background: AVAIL_CONFIG[resp]?.bg, color: AVAIL_CONFIG[resp]?.color }}>
                            {resp}
                          </span>
                        ) : (
                          <span className="font-rajdhani text-[10px] font-bold flex-shrink-0" style={{ color: '#D97706' }}>
                            Not marked
                          </span>
                        )}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="rounded-xl p-5" style={{ background: '#FFFFFF', border: '1px solid #D4C9B0' }}>
              <h2 className="font-cinzel text-lg font-bold flex items-center gap-2 mb-2" style={{ color: '#1C1917' }}>
                <span className="w-1 h-5 rounded-full inline-block" style={{ background: '#D97706' }} />
                Quick Actions
              </h2>
              <div className="divide-y" style={{ borderColor: '#E7E0D3' }}>
                <QuickActionRow href="/fixtures" icon={<CalendarGlyph color="#B45309" />} title="Set Availability" subtitle="Update weekend match availability" />
                {isCaptain && (
                  <QuickActionRow href="/captains-corner" icon={<ClipboardGlyph color="#B45309" />} title="Squad Selection" subtitle="Pick the squad & view availability grid" />
                )}
                {isGC && (
                  <QuickActionRow href="/gc-review" icon={<ScalesGlyph color="#B45309" />} title="Squad Review" subtitle="Approve or return submitted squads" />
                )}
                <QuickActionRow href="/profile" icon={<PersonGlyph color="#B45309" />} title="My Profile" subtitle="Update your details & photo" />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="px-5 md:px-8 lg:px-10 py-8 max-w-4xl">

        {/* ── SPLIT AUDIENCE PATHS — logged-out / expelled / unmatched only.
            A registered player already has the full dashboard above; these
            "For Players" / "For Organisers" cards are the pre-sign-in pitch,
            not something a signed-in player needs to see again. ── */}
        {!isPlayer && (
          <div className="grid sm:grid-cols-2 gap-4">

            {/* Players path */}
            <div className="rounded border p-6 flex flex-col bg-ink-3 border-gold-dim">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-gold/10 border border-gold-dim rounded flex items-center justify-center flex-shrink-0">
                  <span className="text-lg">🏏</span>
                </div>
                <div>
                  <p className="font-cinzel text-sm font-semibold text-gold">For Players</p>
                  <p className="font-rajdhani text-xs text-zinc-600">Spartans CC members</p>
                </div>
              </div>
              <ul className="font-rajdhani text-xs text-zinc-500 space-y-1.5 mb-5 flex-1">
                <li className="flex items-center gap-2"><span className="text-gold">·</span> View upcoming confirmed fixtures</li>
                <li className="flex items-center gap-2"><span className="text-gold">·</span> Mark your Y/O/E/L availability</li>
                <li className="flex items-center gap-2"><span className="text-gold">·</span> See squad announcements</li>
                <li className="flex items-center gap-2"><span className="text-gold">·</span> Sign in with your club Gmail</li>
              </ul>
              <Link href="/fixtures"
                className="font-rajdhani text-xs font-bold tracking-widest uppercase bg-gold/10 border border-gold-dim text-gold hover:bg-gold/20 px-4 py-2.5 rounded text-center transition-colors">
                View Fixtures →
              </Link>
            </div>

            {/* Organisers path */}
            <div className="rounded border p-6 flex flex-col bg-ink-3 border-ink-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-emerald-950 border border-emerald-800 rounded flex items-center justify-center flex-shrink-0">
                  <span className="text-lg">📅</span>
                </div>
                <div>
                  <p className="font-cinzel text-sm font-semibold text-emerald-400">For Organisers</p>
                  <p className="font-rajdhani text-xs text-zinc-600">Tournament promoters</p>
                </div>
              </div>
              <ul className="font-rajdhani text-xs text-zinc-500 space-y-1.5 mb-5 flex-1">
                <li className="flex items-center gap-2"><span className="text-emerald-700">·</span> Check live slot availability</li>
                <li className="flex items-center gap-2"><span className="text-emerald-700">·</span> 3-month rolling schedule view</li>
                <li className="flex items-center gap-2"><span className="text-emerald-700">·</span> WhatsApp us to book an open slot</li>
                <li className="flex items-center gap-2"><span className="text-emerald-700">·</span> No login required</li>
              </ul>
              <Link href="/schedule"
                className="font-rajdhani text-xs font-bold tracking-widest uppercase bg-emerald-950 border border-emerald-800 text-emerald-400 hover:bg-emerald-900 px-4 py-2.5 rounded text-center transition-colors">
                View Available Slots →
              </Link>
            </div>

          </div>
        )}

        {/* ── SIGN IN PROMPT for logged-out non-admin visitors ── */}
        {!isLoggedIn && (
          <div className="mt-6 bg-ink-3 border border-ink-5 rounded p-5 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="font-cinzel text-sm text-parchment font-semibold mb-1">Spartans player?</p>
              <p className="font-rajdhani text-xs text-zinc-500">
                Sign in with your club Gmail to mark availability and see your personalised dashboard.
              </p>
            </div>
            <a href="/api/auth/signin"
              className="font-rajdhani text-xs font-bold tracking-widest uppercase border border-gold-dim text-gold hover:bg-gold/10 px-5 py-2.5 rounded transition-colors whitespace-nowrap flex items-center gap-2">
              <GoogleIcon /> Sign in with Google
            </a>
          </div>
        )}

      </div>

      <footer className="border-t border-ink-4 py-5 text-center font-rajdhani text-xs text-zinc-600 mt-8">
        © 2026 <span className="text-gold-dim">Spartans Cricket Club</span> · Bengaluru · Est. 2014
        <span className="mx-2 text-ink-5">·</span>
        <a href="https://spartanscricketclub.vercel.app" className="text-zinc-700 hover:text-zinc-500 transition-colors">
          Club Site
        </a>
      </footer>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}
