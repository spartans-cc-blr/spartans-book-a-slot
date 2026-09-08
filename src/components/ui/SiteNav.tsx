'use client'
import Link from 'next/link'
import { useState } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'
import { JerseyIcon } from '@/components/ui/JerseyIcon'
import { MobileTabBar } from '@/components/ui/MobileTabBar'
import { GenerateInviteItem } from '@/components/ui/GenerateInviteItem'

interface SiteNavProps {
  activePage?: string
}

export function SiteNav({ activePage }: SiteNavProps) {
  const [profileOpen,  setProfileOpen]  = useState(false)
  const [gcOpen,       setGcOpen]       = useState(false)
  const [matchesOpen,  setMatchesOpen]  = useState(false)
  const [captainsOpen, setCaptainsOpen] = useState(false)
  const [wranglerOpen, setWranglerOpen] = useState(false)
  const { data: session, status }     = useSession()

  const player     = session?.user as any
  const isLoggedIn = status === 'authenticated'
  const isExpelled = player?.playerStatus === 'expelled'
  const isAdmin    = !!player?.isAdmin
  const isGC       = !!player?.isGC || isAdmin
  const isCaptain  = !!player?.isCaptain
  const isWrangler = !!player?.isWrangler || isAdmin

  const links = [
    { href: 'https://spartanscricketclub.vercel.app', label: 'Club Site' },
    // Schedule only for public (signed-out) or admin — players use Fixtures
    ...(!isLoggedIn || isAdmin
      ? [{ href: '/schedule', label: 'Schedule', key: 'schedule' }]
      : []),
    ...(isLoggedIn && !isExpelled
      ? [{ href: '/dugout', label: 'The Dugout', key: 'dugout' }]
      : []),
    ...(isLoggedIn && !isExpelled
      ? [{ href: '/leaderboard', label: 'Stats', key: 'leaderboard' }]
      : []),
    // Captains' Corner — its own dropdown now (Squad Selection + Unavailable
    // Dates), rendered separately below, not a flat link here.
    // Tournament Planner — captains, GC, admin
    ...(isCaptain || isGC || isAdmin
      ? [{ href: '/tournament-planner', label: 'Tournaments', key: 'planner' }]
      : []),
    ...(isLoggedIn && !isExpelled
      ? [{ href: '/profile', label: 'My Profile', key: 'profile' }]
      : []),
  ]

  return (
    <>
    <nav className="bg-ink-2 border-b border-gold-dim sticky top-0 z-50">
      <div className="flex items-center px-5 md:px-8 lg:px-10 h-14">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5">
          <img src="/Transparent High Resolution.png" alt="Spartans CC" className="w-8 h-8 object-contain" />
          <span className="font-cinzel font-bold text-gold tracking-[2px] text-[13px] hidden sm:block">
            SPARTANS CC
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center ml-auto gap-0">
          {/* Matches submenu — desktop */}
          {isLoggedIn && !isExpelled && (
            <div className="relative"
              onMouseEnter={() => setMatchesOpen(true)}
              onMouseLeave={() => setMatchesOpen(false)}>
              <button
                className={`font-rajdhani text-xs font-semibold tracking-[1.5px] uppercase px-4 h-14 flex items-center gap-1 border-b-2 transition-all
                  ${activePage === 'fixtures' || activePage === 'matches'
                    ? 'text-gold border-crimson'
                    : 'text-zinc-500 border-transparent hover:text-gold'}`}>
                Matches <span className="text-[8px] mt-0.5">▾</span>
              </button>
              {matchesOpen && (
                <div className="absolute top-14 left-0 w-44 bg-ink-2 border border-ink-5 rounded-b shadow-xl z-50">
                  <Link href="/fixtures"
                    onClick={() => setMatchesOpen(false)}
                    className={`block px-4 py-3 font-rajdhani text-xs font-semibold tracking-wide uppercase transition-colors border-b border-ink-5
                      ${activePage === 'fixtures' ? 'text-gold bg-ink-3' : 'text-zinc-400 hover:text-gold hover:bg-ink-3'}`}>
                    🏏 Upcoming
                  </Link>
                  <Link href="/matches/history"
                    onClick={() => setMatchesOpen(false)}
                    className={`block px-4 py-3 font-rajdhani text-xs font-semibold tracking-wide uppercase transition-colors
                      ${activePage === 'matches' ? 'text-gold bg-ink-3' : 'text-zinc-400 hover:text-gold hover:bg-ink-3'}`}>
                    📜 Past Matches
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Captains' Corner submenu — desktop */}
          {(isCaptain || isAdmin) && (
            <div className="relative ml-1"
              onMouseEnter={() => setCaptainsOpen(true)}
              onMouseLeave={() => setCaptainsOpen(false)}>
              <button
                className={`font-rajdhani text-xs font-semibold tracking-[1.5px] uppercase px-4 h-14 flex items-center gap-1 border-b-2 transition-all
                  ${activePage === 'captains' || activePage === 'captains-unavailable'
                    ? 'text-gold border-crimson'
                    : 'text-zinc-500 border-transparent hover:text-gold'}`}>
                Captains' Corner <span className="text-[8px] mt-0.5">▾</span>
              </button>
              {captainsOpen && (
                <div className="absolute top-14 left-0 w-52 bg-ink-2 border border-ink-5 rounded-b shadow-xl z-50">
                  <Link href="/captains-corner"
                    onClick={() => setCaptainsOpen(false)}
                    className={`block px-4 py-3 font-rajdhani text-xs font-semibold tracking-wide uppercase transition-colors border-b border-ink-5
                      ${activePage === 'captains' ? 'text-gold bg-ink-3' : 'text-zinc-400 hover:text-gold hover:bg-ink-3'}`}>
                    🏏 Squad Selection
                  </Link>
                  <Link href="/captains-corner/unavailable-dates"
                    onClick={() => setCaptainsOpen(false)}
                    className={`block px-4 py-3 font-rajdhani text-xs font-semibold tracking-wide uppercase transition-colors
                      ${activePage === 'captains-unavailable' ? 'text-gold bg-ink-3' : 'text-zinc-400 hover:text-gold hover:bg-ink-3'}`}>
                    🚫 Unavailable Dates
                  </Link>
                </div>
              )}
            </div>
          )}

          {links.map(item => (
            <Link key={item.label} href={item.href}
              className={`font-rajdhani text-xs font-semibold tracking-[1.5px] uppercase px-4 h-14 flex items-center border-b-2 transition-all
                ${activePage === item.key ? 'text-gold border-crimson' : 'text-zinc-500 border-transparent hover:text-gold'}`}>
              {item.label}
            </Link>
          ))}

          {/* GC submenu — desktop */}
          {isGC && (
            <div className="relative ml-1"
              onMouseEnter={() => setGcOpen(true)}
              onMouseLeave={() => setGcOpen(false)}>
              <button
                className={`font-rajdhani text-xs font-semibold tracking-[1.5px] uppercase px-4 h-14 flex items-center gap-1 border-b-2 transition-all
                  ${activePage === 'gc' || activePage === 'invite'
                    ? 'text-gold border-gold'
                    : 'text-zinc-500 border-transparent hover:text-gold'}`}>
                Council ⚖ <span className="text-[8px] mt-0.5">▾</span>
              </button>
              {gcOpen && (
                <div className="absolute top-14 left-0 w-52 bg-ink-2 border border-ink-5 rounded-b shadow-xl z-50">
                  <Link href="/gc-review"
                    onClick={() => setGcOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-3 font-rajdhani text-xs font-semibold tracking-wide uppercase text-zinc-400 hover:text-gold hover:bg-ink-3 transition-colors border-b border-ink-5">
                    ⚖ Squad Review
                  </Link>
                  <Link href="/gc/feedback"
                    onClick={() => setGcOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-3 font-rajdhani text-xs font-semibold tracking-wide uppercase text-zinc-400 hover:text-gold hover:bg-ink-3 transition-colors border-b border-ink-5">
                    📋 Feedback
                  </Link>
                  <Link href="/gc-players"
                    onClick={() => setGcOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-3 font-rajdhani text-xs font-semibold tracking-wide uppercase text-zinc-400 hover:text-gold hover:bg-ink-3 transition-colors border-b border-ink-5">
                    👤 Players
                  </Link>
                  <Link href="/dugout/store-orders"
                    onClick={() => setGcOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-3 font-rajdhani text-xs font-semibold tracking-wide uppercase text-zinc-400 hover:text-gold hover:bg-ink-3 transition-colors border-b border-ink-5">
                    <JerseyIcon colour="gold" size={16} />
                    Store Orders
                  </Link>
                  <Link href="/wrangler/grounds"
                    onClick={() => setGcOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-3 font-rajdhani text-xs font-semibold tracking-wide uppercase text-zinc-400 hover:text-gold hover:bg-ink-3 transition-colors border-b border-ink-5">
                    📍 Grounds
                  </Link>
                  <GenerateInviteItem />
                </div>
              )}
            </div>
          )}

          {/* Wrangler submenu — desktop */}
          {isWrangler && (
            <div className="relative ml-1"
              onMouseEnter={() => setWranglerOpen(true)}
              onMouseLeave={() => setWranglerOpen(false)}>
              <button
                className={`font-rajdhani text-xs font-semibold tracking-[1.5px] uppercase px-4 h-14 flex items-center gap-1 border-b-2 transition-all
                  ${activePage === 'wrangler'
                    ? 'text-gold border-gold'
                    : 'text-zinc-500 border-transparent hover:text-gold'}`}>
                Wrangler ⚒ <span className="text-[8px] mt-0.5">▾</span>
              </button>
              {wranglerOpen && (
                <div className="absolute top-14 left-0 w-52 bg-ink-2 border border-ink-5 rounded-b shadow-xl z-50">
                  <Link href="/wrangler/backfill-squad"
                    onClick={() => setWranglerOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-3 font-rajdhani text-xs font-semibold tracking-wide uppercase text-zinc-400 hover:text-gold hover:bg-ink-3 transition-colors border-b border-ink-5">
                    🧩 Squad Backfill
                  </Link>
                  <Link href="/wrangler/grounds"
                    onClick={() => setWranglerOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-3 font-rajdhani text-xs font-semibold tracking-wide uppercase text-zinc-400 hover:text-gold hover:bg-ink-3 transition-colors">
                    📍 Grounds
                  </Link>
                </div>
              )}
            </div>
          )}

          {isAdmin && (
            <Link href="/admin"
              className="ml-3 font-rajdhani text-xs font-bold tracking-widest uppercase bg-crimson hover:bg-crimson-dark text-white px-4 py-2 rounded transition-colors">
              Admin ⚙
            </Link>
          )}

          {/* Auth button — desktop */}
          <div className="ml-4 relative">
            {!isLoggedIn ? (
              <button onClick={() => signIn('google')}
                className="font-rajdhani text-xs font-bold tracking-wide border border-gold-dim text-gold hover:bg-gold/10 px-4 py-2 rounded transition-colors flex items-center gap-2">
                <GoogleIcon /> Sign in
              </button>
            ) : (
              <button onClick={() => setProfileOpen(v => !v)}
                className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                <img
                  src={player?.photoUrl ?? player?.image ?? '/default-avatar.png'}
                  alt={player?.playerName ?? player?.name ?? ''}
                  className="w-7 h-7 rounded-full object-cover border border-gold-dim"
                />
                <span className="font-rajdhani text-xs text-zinc-400 max-w-[100px] truncate">
                  {player?.playerName ?? player?.name?.split(' ')[0]}
                </span>
              </button>
            )}

            {/* Profile dropdown */}
            {profileOpen && isLoggedIn && (
              <div className="absolute right-0 top-10 w-48 bg-ink-2 border border-ink-5 rounded shadow-xl z-50">
                <div className="px-4 py-3 border-b border-ink-5">
                  <p className="font-rajdhani text-xs font-bold text-parchment truncate">
                    {player?.playerName ?? player?.name}
                  </p>
                  <p className="font-rajdhani text-[10px] text-zinc-600 truncate">{player?.email}</p>
                  {player?.isCaptain && (
                    <span className="font-rajdhani text-[9px] font-bold bg-gold/10 border border-gold-dim text-gold px-1.5 py-0.5 rounded mt-1 inline-block">
                      CAPTAIN
                    </span>
                  )}
                  {player?.isGC && !player?.isAdmin && (
                    <span className="font-rajdhani text-[9px] font-bold bg-sky-900/40 border border-sky-700 text-sky-400 px-1.5 py-0.5 rounded mt-1 inline-block ml-1">
                      GC
                    </span>
                  )}
                </div>
                {player?.playerId && !isExpelled && (
                  <Link href="/profile" onClick={() => setProfileOpen(false)}
                    className="block px-4 py-2.5 font-rajdhani text-xs text-zinc-400 hover:text-gold hover:bg-ink-3 transition-colors">
                    My Profile
                  </Link>
                )}
                {isExpelled && (
                  <div className="px-4 py-2.5 font-rajdhani text-xs text-red-400">
                    Account suspended
                  </div>
                )}
                {!player?.playerId && !isExpelled && (
                  <Link href="/join" onClick={() => setProfileOpen(false)}
                    className="block px-4 py-2.5 font-rajdhani text-xs text-zinc-400 hover:text-gold hover:bg-ink-3 transition-colors">
                    Complete Registration
                  </Link>
                )}
                <button onClick={() => { signOut(); setProfileOpen(false) }}
                  className="w-full text-left px-4 py-2.5 font-rajdhani text-xs text-zinc-600 hover:text-zinc-300 hover:bg-ink-3 transition-colors border-t border-ink-5">
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Mobile: profile shortcut + auth (nav destinations live in the bottom tab bar) */}
        <div className="md:hidden ml-auto flex items-center gap-3">
          {isAdmin && (
            <Link href="/admin" className="font-rajdhani text-xs font-bold text-crimson">Admin</Link>
          )}
          {isGC && !isAdmin && (
            <Link href="/gc-review" className="font-rajdhani text-xs font-bold text-gold">GC</Link>
          )}
          {isLoggedIn ? (
            <Link href={isExpelled ? '/profile' : player?.playerId ? '/profile' : '/join'}>
              <img
                src={player?.photoUrl ?? player?.image ?? '/default-avatar.png'}
                alt=""
                className="w-7 h-7 rounded-full object-cover border border-gold-dim"
              />
            </Link>
          ) : (
            <button onClick={() => signIn('google')}
              className="font-rajdhani text-[10px] font-bold text-gold border border-gold-dim px-2 py-1 rounded">
              Sign in
            </button>
          )}
        </div>
      </div>
    </nav>

    <MobileTabBar
      activePage={activePage}
      isLoggedIn={isLoggedIn}
      isExpelled={isExpelled}
      isAdmin={isAdmin}
      isGC={isGC}
      isCaptain={isCaptain}
      isWrangler={isWrangler}
      playerId={player?.playerId ?? null}
    />
    </>
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