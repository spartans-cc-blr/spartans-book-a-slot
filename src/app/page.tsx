// app/page.tsx
// Spartans Hub — Home / Landing Page
// Split-audience: players see a personalised dashboard, organisers see a schedule CTA.
// Logged-out users see both paths clearly.

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { SiteNav } from '@/components/ui/SiteNav'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export const revalidate = 60

async function getPlayerData(playerId: string) {
  const supabase = createServiceClient()

  // Upcoming fixtures count
  const today = new Date().toISOString().split('T')[0]
  const { count: upcomingCount } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'confirmed')
    .gte('game_date', today)

  // Player's availability responses for upcoming matches
  const { data: avail } = await supabase
    .from('availability')
    .select('booking_id, response')
    .eq('player_id', playerId)

  // Next confirmed fixture
  const { data: nextFixture } = await supabase
    .from('bookings')
    .select(`
      id, game_date, slot_time, format, opponent_name,
      tournament:tournaments(name, ball_type)
    `)
    .eq('status', 'confirmed')
    .gte('game_date', today)
    .order('game_date', { ascending: true })
    .order('slot_time', { ascending: true })
    .limit(1)
    .single()

  // Player's availability for next fixture
  const nextFixtureResponse = nextFixture
    ? avail?.find(a => a.booking_id === nextFixture.id)?.response ?? null
    : null

  // Count of upcoming fixtures player has NOT responded to
  const { data: upcomingBookings } = await supabase
    .from('bookings')
    .select('id')
    .eq('status', 'confirmed')
    .gte('game_date', today)

  const respondedIds = new Set((avail ?? []).map(a => a.booking_id))
  const pendingCount = (upcomingBookings ?? []).filter(b => !respondedIds.has(b.id)).length

  return { upcomingCount: upcomingCount ?? 0, nextFixture, nextFixtureResponse, pendingCount }
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

const AVAIL_CONFIG: Record<string, { color: string; bg: string; border: string; label: string }> = {
  Y: { color: '#4ade80', bg: '#1a4731', border: '#166534', label: 'Available' },
  E: { color: '#60a5fa', bg: '#1e3a5f', border: '#1d4ed8', label: 'Either game today' },
  O: { color: '#fbbf24', bg: '#3d2e00', border: '#d97706', label: 'One game this weekend' },
  L: { color: '#c084fc', bg: '#2e1a47', border: '#7e22ce', label: 'On leave' },
}

export default async function HomePage() {
  const session = await getServerSession(authOptions)
  const player  = session?.user as any

  const isLoggedIn  = !!session
  const isPlayer    = isLoggedIn && !!player?.playerId && player?.playerStatus !== 'expelled'
  const isCaptain   = isPlayer && !!player?.isCaptain
  const isAdmin     = isLoggedIn && !!player?.isAdmin
  const isExpelled  = isLoggedIn && player?.playerStatus === 'expelled'
  const isUnmatched = isLoggedIn && !player?.playerId && !isExpelled

  const playerData = isPlayer ? await getPlayerData(player.playerId) : null

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

      <div className="px-5 md:px-8 lg:px-10 py-8 max-w-4xl">

        {/* ── EXPELLED STATE ── */}
        {isExpelled && (
          <div className="bg-red-950/40 border border-red-800 rounded p-6 text-center mb-8">
            <p className="font-cinzel text-red-400 font-semibold mb-1">Account Suspended</p>
            <p className="font-rajdhani text-sm text-red-600">
              Your account has been suspended. Contact the club admin for more information.
            </p>
          </div>
        )}

        {/* ── UNMATCHED (signed in but not a registered player) ── */}
        {isUnmatched && (
          <div className="bg-amber-950/30 border border-amber-800/50 rounded p-5 mb-8 flex items-start gap-4">
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
        )}

        {/* ── PLAYER DASHBOARD ── */}
        {isPlayer && playerData && (
          <div className="mb-10">
            {/* Welcome */}
            <div className="flex items-center gap-3 mb-6">
              <img
                src={player?.photoUrl ?? player?.image ?? '/default-avatar.png'}
                alt=""
                className="w-10 h-10 rounded-full object-cover border border-gold-dim flex-shrink-0"
              />
              <div>
                <p className="font-cinzel text-base font-semibold text-parchment">
                  Welcome back, {player?.playerName?.split(' ')[0] ?? 'Spartan'}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  {isCaptain && (
                    <span className="font-rajdhani text-[9px] font-bold bg-gold/10 border border-gold-dim text-gold px-1.5 py-0.5 rounded">
                      CAPTAIN
                    </span>
                  )}
                  {isAdmin && (
                    <span className="font-rajdhani text-[9px] font-bold bg-crimson/10 border border-crimson/40 text-crimson px-1.5 py-0.5 rounded">
                      ADMIN
                    </span>
                  )}
                  <span className="font-rajdhani text-xs text-zinc-600">Spartans CC BLR</span>
                </div>
              </div>
            </div>

            {/* Action cards row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">

              {/* Upcoming fixtures */}
              <Link href="/fixtures"
                className="bg-ink-3 border border-ink-5 rounded p-4 hover:border-gold-dim hover:bg-ink-4 transition-all group">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-2xl">🏏</span>
                  <span className="font-rajdhani text-[10px] font-bold tracking-wide uppercase text-zinc-600 group-hover:text-gold transition-colors">
                    View Fixtures →
                  </span>
                </div>
                <p className="font-cinzel text-2xl font-bold text-gold">{playerData.upcomingCount}</p>
                <p className="font-rajdhani text-xs text-zinc-500 mt-1">Upcoming confirmed matches</p>
              </Link>

              {/* Pending availability */}
              <Link href="/fixtures"
                className={`rounded p-4 transition-all group border ${
                  playerData.pendingCount > 0
                    ? 'bg-amber-950/30 border-amber-800/60 hover:border-amber-600'
                    : 'bg-ink-3 border-ink-5 hover:border-gold-dim hover:bg-ink-4'
                }`}>
                <div className="flex items-start justify-between mb-3">
                  <span className="text-2xl">{playerData.pendingCount > 0 ? '⚠️' : '✅'}</span>
                  <span className={`font-rajdhani text-[10px] font-bold tracking-wide uppercase transition-colors ${
                    playerData.pendingCount > 0 ? 'text-amber-600 group-hover:text-amber-400' : 'text-zinc-600 group-hover:text-gold'
                  }`}>
                    Mark Availability →
                  </span>
                </div>
                <p className={`font-cinzel text-2xl font-bold ${playerData.pendingCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {playerData.pendingCount}
                </p>
                <p className={`font-rajdhani text-xs mt-1 ${playerData.pendingCount > 0 ? 'text-amber-600' : 'text-zinc-500'}`}>
                  {playerData.pendingCount > 0 ? 'Matches awaiting your response' : 'All marked — you\'re up to date'}
                </p>
              </Link>

              {/* Profile */}
              <Link href="/profile"
                className="bg-ink-3 border border-ink-5 rounded p-4 hover:border-gold-dim hover:bg-ink-4 transition-all group">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-2xl">👤</span>
                  <span className="font-rajdhani text-[10px] font-bold tracking-wide uppercase text-zinc-600 group-hover:text-gold transition-colors">
                    Edit Profile →
                  </span>
                </div>
                <p className="font-cinzel text-sm font-semibold text-parchment truncate">{player?.playerName}</p>
                <p className="font-rajdhani text-xs text-zinc-500 mt-1">Update your details &amp; photo</p>
              </Link>

            </div>

            {/* Next fixture callout */}
            {playerData.nextFixture && (
              <div className="bg-ink-3 border border-ink-5 rounded p-4">
                <p className="font-rajdhani text-[10px] font-bold tracking-[2px] uppercase text-zinc-600 mb-3">
                  Next Match
                </p>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <p className="font-cinzel text-sm font-semibold text-parchment">
                      {(playerData.nextFixture as any).tournament?.name ?? '—'}
                    </p>
                    <p className="font-rajdhani text-xs text-zinc-500 mt-0.5">
                      vs {(playerData.nextFixture as any).opponent_name ?? 'TBD'} · {formatDate((playerData.nextFixture as any).game_date)} · {slotLabel((playerData.nextFixture as any).slot_time)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {playerData.nextFixtureResponse ? (
                      <div className="flex items-center gap-2">
                        <span
                          className="font-rajdhani text-xs font-bold w-7 h-7 flex items-center justify-center rounded-sm"
                          style={{
                            background: AVAIL_CONFIG[playerData.nextFixtureResponse]?.bg,
                            color: AVAIL_CONFIG[playerData.nextFixtureResponse]?.color,
                            border: `1px solid ${AVAIL_CONFIG[playerData.nextFixtureResponse]?.border}`,
                          }}>
                          {playerData.nextFixtureResponse}
                        </span>
                        <span className="font-rajdhani text-xs text-zinc-500">
                          {AVAIL_CONFIG[playerData.nextFixtureResponse]?.label}
                        </span>
                      </div>
                    ) : (
                      <span className="font-rajdhani text-xs text-amber-500 font-semibold">
                        ⚠ Not marked yet
                      </span>
                    )}
                    <Link href="/fixtures"
                      className="font-rajdhani text-xs font-bold tracking-wide border border-ink-5 hover:border-gold-dim text-zinc-400 hover:text-gold px-3 py-1.5 rounded transition-colors">
                      {playerData.nextFixtureResponse ? 'Update' : 'Mark Now'}
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* Captain shortcut */}
            {isCaptain && (
              <Link href="/captains-corner"
                className="mt-3 flex items-center justify-between bg-gold/5 border border-gold-dim rounded p-4 hover:bg-gold/10 transition-colors group">
                <div className="flex items-center gap-3">
                  <span className="text-xl">⚔️</span>
                  <div>
                    <p className="font-cinzel text-sm font-semibold text-gold">Captains Corner</p>
                    <p className="font-rajdhani text-xs text-zinc-500">View availability grid &amp; announce squad</p>
                  </div>
                </div>
                <span className="font-rajdhani text-xs text-gold-dim group-hover:text-gold transition-colors">→</span>
              </Link>
            )}

            {/* Admin shortcut */}
            {isAdmin && (
              <Link href="/admin"
                className="mt-3 flex items-center justify-between bg-crimson/5 border border-crimson/30 rounded p-4 hover:bg-crimson/10 transition-colors group">
                <div className="flex items-center gap-3">
                  <span className="text-xl">⚙️</span>
                  <div>
                    <p className="font-cinzel text-sm font-semibold text-crimson">Admin Panel</p>
                    <p className="font-rajdhani text-xs text-zinc-500">Manage bookings, players &amp; master data</p>
                  </div>
                </div>
                <span className="font-rajdhani text-xs text-crimson/50 group-hover:text-crimson transition-colors">→</span>
              </Link>
            )}
          </div>
        )}

        {/* ── DIVIDER between player section and public paths ── */}
        {isPlayer && (
          <div className="flex items-center gap-4 mb-8">
            <div className="flex-1 h-px bg-ink-5" />
            <span className="font-rajdhani text-[10px] font-bold tracking-[2px] uppercase text-zinc-700">
              Quick Links
            </span>
            <div className="flex-1 h-px bg-ink-5" />
          </div>
        )}

        {/* ── SPLIT AUDIENCE PATHS ── */}
        <div className="grid sm:grid-cols-2 gap-4">

          {/* Players path */}
          <div className={`rounded border p-6 flex flex-col ${
            isPlayer ? 'bg-ink-3 border-ink-5' : 'bg-ink-3 border-gold-dim'
          }`}>
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
              {!isPlayer && <li className="flex items-center gap-2"><span className="text-gold">·</span> Sign in with your club Gmail</li>}
            </ul>
            <Link href="/fixtures"
              className="font-rajdhani text-xs font-bold tracking-widest uppercase bg-gold/10 border border-gold-dim text-gold hover:bg-gold/20 px-4 py-2.5 rounded text-center transition-colors">
              {isPlayer ? 'View My Fixtures →' : 'View Fixtures →'}
            </Link>
          </div>

          {/* Organisers path */}
          <div className={`rounded border p-6 flex flex-col ${
            isPlayer ? 'bg-ink-3 border-ink-5' : 'bg-ink-3 border-ink-5'
          }`}>
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
