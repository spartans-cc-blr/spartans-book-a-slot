'use client'
import Link from 'next/link'
import { useState } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'

interface SiteNavProps {
  activePage?: string
  isAdmin?:    boolean
}

export function SiteNav({ activePage, isAdmin }: SiteNavProps) {
  const [open,        setOpen]        = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const { data: session, status }     = useSession()

  const player     = session?.user as any
  const isLoggedIn = status === 'authenticated'
  const isExpelled = player?.playerStatus === 'expelled'

  const links = [
    { href: 'https://spartanscricketclub.vercel.app', label: 'Club Site' },
    { href: '/schedule', label: 'Schedule', key: 'schedule' },
    { href: '/fixtures', label: 'Fixtures',  key: 'fixtures' },
    { href: '/profile', label: 'Profile', key: 'profile' }
  ]

  return (
    <nav className="bg-ink-2 border-b border-gold-dim sticky top-0 z-50">
      <div className="flex items-center px-5 md:px-8 lg:px-10 h-14">
        {/* Logo */}
        <Link href="/schedule" className="flex items-center gap-2.5">
          <img src="/Transparent High Resolution.png" alt="Spartans CC" className="w-8 h-8 object-contain" />
          <span className="font-cinzel font-bold text-gold tracking-[2px] text-[13px] hidden sm:block">
            SPARTANS CC
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center ml-auto gap-0">
          {links.map(item => (
            <Link key={item.label} href={item.href}
              className={`font-rajdhani text-xs font-semibold tracking-[1.5px] uppercase px-4 h-14 flex items-center border-b-2 transition-all
                ${activePage === item.key ? 'text-gold border-crimson' : 'text-zinc-500 border-transparent hover:text-gold'}`}>
              {item.label}
            </Link>
          ))}

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

        {/* Mobile: hamburger + auth */}
        <div className="md:hidden ml-auto flex items-center gap-3">
          {isAdmin && (
            <Link href="/admin" className="font-rajdhani text-xs font-bold text-crimson">Admin</Link>
          )}
          {isLoggedIn ? (
            <button onClick={() => setProfileOpen(v => !v)}>
              <img
                src={player?.photoUrl ?? player?.image ?? '/default-avatar.png'}
                alt=""
                className="w-7 h-7 rounded-full object-cover border border-gold-dim"
              />
            </button>
          ) : (
            <button onClick={() => signIn('google')}
              className="font-rajdhani text-[10px] font-bold text-gold border border-gold-dim px-2 py-1 rounded">
              Sign in
            </button>
          )}
          <button onClick={() => setOpen(v => !v)} className="flex flex-col gap-1.5 p-1">
            <span className={`block w-5 h-px bg-gold-dim transition-transform ${open ? 'rotate-45 translate-y-2' : ''}`} />
            <span className={`block w-5 h-px bg-gold-dim transition-opacity ${open ? 'opacity-0' : ''}`} />
            <span className={`block w-5 h-px bg-gold-dim transition-transform ${open ? '-rotate-45 -translate-y-2' : ''}`} />
          </button>
        </div>
      </div>

      {/* Mobile profile dropdown */}
      {profileOpen && isLoggedIn && (
        <div className="md:hidden bg-ink-2 border-t border-ink-5 px-5 py-3">
          <p className="font-rajdhani text-xs font-bold text-parchment">{player?.playerName ?? player?.name}</p>
          <p className="font-rajdhani text-[10px] text-zinc-600 mb-3">{player?.email}</p>
          {player?.playerId && !isExpelled && (
            <Link href="/profile" onClick={() => setProfileOpen(false)}
              className="block font-rajdhani text-sm text-zinc-400 hover:text-gold py-2 border-b border-ink-4">
              My Profile
            </Link>
          )}
          {!player?.playerId && (
            <Link href="/join" onClick={() => setProfileOpen(false)}
              className="block font-rajdhani text-sm text-zinc-400 hover:text-gold py-2 border-b border-ink-4">
              Complete Registration
            </Link>
          )}
          <button onClick={() => { signOut(); setProfileOpen(false) }}
            className="font-rajdhani text-sm text-zinc-600 hover:text-zinc-300 py-2">
            Sign out
          </button>
        </div>
      )}

      {/* Mobile nav dropdown */}
      {open && (
        <div className="md:hidden bg-ink-2 border-t border-ink-5 px-5 py-3 flex flex-col gap-1">
          {links.map(item => (
            <Link key={item.label} href={item.href} onClick={() => setOpen(false)}
              className={`font-rajdhani text-sm font-semibold tracking-wide uppercase py-2.5 border-b border-ink-4 transition-colors
                ${activePage === item.key ? 'text-gold' : 'text-zinc-400 hover:text-gold'}`}>
              {item.label}
            </Link>
          ))}
          {isAdmin && (
            <Link href="/admin" onClick={() => setOpen(false)}
              className="font-rajdhani text-sm font-bold tracking-wide uppercase py-2.5 text-crimson">
              Admin ⚙
            </Link>
          )}
        </div>
      )}
    </nav>
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
