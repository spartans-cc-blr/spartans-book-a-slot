'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

const NAV = [
  { href: '/admin',                  label: 'Matches',      icon: '📋', exact: true },
  // After the Matches entry:
  { href: '/admin/bookings/new',     label: 'New Booking',      icon: '➕' },
  { href: '/admin/soft-blocks/new',  label: 'Soft Blocks',      icon: '🔒' },
  { href: '/admin/captains',         label: 'Captains',         icon: '👥', section: 'Master Data' },
  { href: '/admin/tournaments',      label: 'Tournaments',      icon: '🏆' },
  { href: '/admin/players',          label: 'Players',          icon: '🏏' },
  { href: '/admin/wallet',           label: 'Wallet',            icon: '💰' },
  { href: '/admin/scorecard-backfill', label: 'Scorecard Backfill', icon: '📥', section: 'Utilities' },
  { href: '/admin/booking-backfill', label: 'Booking Backfill', icon: '🗓️' },
  { href: '/admin/player-reconciliation', label: 'Player Reconciliation', icon: '🪪' },
  { href: '/admin/cricheroes-id-backfill', label: 'CricHeroes ID Backfill', icon: '🔗' },
  // Hub Views — every player-facing destination an admin sees in SiteNav's
  // own dropdowns (Matches ▾/Stats ▾/Captains' Corner ▾/Council ⚖/Wrangler ⚒),
  // deduped to one entry per route and grouped with sub-labels mirroring
  // that structure, so an admin never has to leave /admin to reach them.
  // Placed after Utilities per the same request that retired the standalone
  // "The Dugout" section below — Store Orders now points at
  // /dugout/store-orders (the player-chrome page), not the old
  // /admin/dugout/kit-room duplicate, which is byte-for-byte the same
  // AdminKitRoomClient/isAdmin||isGC gate — see navigation.md.
  { href: '/',                       label: 'Home',              icon: '🏠', section: 'Hub Views', exact: true },
  { href: '/schedule',               label: 'Free Schedules',    icon: '🌐' },
  { href: '/matches/history',        label: 'Past Matches',      icon: '📜', section: 'Hub Views · Matches' },
  { href: '/fixtures',               label: 'Upcoming Fixtures', icon: '🏏' },
  { href: '/leaderboard',            label: 'Yours Statistically', icon: '📊', section: 'Hub Views · Stats' },
  { href: '/team-stats',             label: 'Team Record',       icon: '🛡️' },
  { href: '/dugout/store-orders',    label: 'Store Orders',      icon: '🥎', section: 'Hub Views · The Dugout' },
  { href: '/dugout/gear',            label: 'Gear Exchange',     icon: '🧢' },
  { href: '/dugout',                 label: 'The Dugout',        icon: '🏟️', exact: true },
  { href: '/captains-corner/unavailable-dates', label: 'Unavailable Dates', icon: '🚫', section: "Hub Views · Captains' Corner" },
  { href: '/captains-corner',        label: 'Squad Selection',   icon: '📝', exact: true },
  { href: '/gc-review',              label: 'Squad Review',      icon: '⚖️', section: 'Hub Views · Council' },
  { href: '/gc/feedback',            label: 'Feedback',          icon: '💬' },
  { href: '/gc-players',             label: 'GC Players',        icon: '🧑‍🤝‍🧑' },
  { href: '/wrangler/grounds',       label: 'Grounds',           icon: '📍' },
  { href: '/wrangler/backfill-squad', label: 'Squad Backfill',   icon: '🧩', section: 'Hub Views · Wrangler' },
  { href: '/opponents',              label: 'Opponents',         icon: '⚔️', section: 'Hub Views · Shared' },
  { href: '/tournament-planner',     label: 'Tournament Planner', icon: '📈' },
  { href: '/profile',                label: 'My Profile',        icon: '👤', section: 'Hub Views · Account' },
  { href: '/wallet',                 label: 'My Wallet',         icon: '🪙' },
]

export function AdminSidebar() {
  const path = usePathname()
  const [open, setOpen] = useState(false)

  const currentPage = NAV.find(item =>
    item.exact ? path === item.href : path.startsWith(item.href)
  )

  return (
    <>
      {/* Desktop sidebar — theme-aware, same convention as AdminLayout's top
          bar above (dark preserved exactly, light new). */}
      <aside className="w-52 bg-white dark:bg-ink-2 border-r border-[#D4C9B0] dark:border-ink-5 flex-shrink-0 hidden md:flex flex-col py-4">
        {NAV.map(item => {
          const isActive = item.exact ? path === item.href : path.startsWith(item.href)
          return (
            <div key={item.href}>
              {item.section && (
                <p className="font-rajdhani text-[10px] font-bold tracking-[3px] uppercase text-[#78716C] dark:text-zinc-700 px-5 pt-4 pb-1">
                  {item.section}
                </p>
              )}
              <Link href={item.href}
                className={`flex items-center gap-2.5 px-5 py-2.5 font-rajdhani text-sm font-medium transition-all border-l-2
                  ${isActive ? 'text-gold border-gold bg-gold/5' : 'text-[#78716C] dark:text-zinc-500 border-transparent hover:text-[#292524] dark:hover:text-zinc-300 hover:bg-[#F8F4EE] dark:hover:bg-ink-3'}`}>
                <span className="text-base w-5 text-center">{item.icon}</span>
                {item.label}
              </Link>
            </div>
          )
        })}
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-ink-2 border-t border-[#D4C9B0] dark:border-ink-5">
        {/* Mobile nav drawer */}
        {open && (
          <div className="bg-white dark:bg-ink-2 border-t border-[#D4C9B0] dark:border-ink-5 px-4 py-3 flex flex-col gap-1 max-h-[70vh] overflow-y-auto">
            {NAV.map(item => {
              const isActive = item.exact ? path === item.href : path.startsWith(item.href)
              return (
                <div key={item.href}>
                  {item.section && (
                    <p className="font-rajdhani text-[10px] font-bold tracking-[3px] uppercase text-[#78716C] dark:text-zinc-700 px-2 pt-3 pb-1">
                      {item.section}
                    </p>
                  )}
                  <Link href={item.href} onClick={() => setOpen(false)}
                    className={`flex items-center gap-3 px-3 py-3 rounded font-rajdhani text-sm font-medium transition-all
                      ${isActive ? 'text-gold bg-gold/5' : 'text-[#44403C] dark:text-zinc-400 hover:text-[#1C1917] dark:hover:text-zinc-200 hover:bg-[#F8F4EE] dark:hover:bg-ink-3'}`}>
                    <span className="text-base w-5 text-center">{item.icon}</span>
                    {item.label}
                  </Link>
                </div>
              )
            })}
          </div>
        )}

        {/* Bottom bar */}
        <div className="flex items-center justify-between px-5 h-12">
          <span className="font-rajdhani text-xs text-[#78716C] dark:text-zinc-500 truncate max-w-[60%]">
            {currentPage?.icon} {currentPage?.label ?? 'Admin'}
          </span>
          <button onClick={() => setOpen(v => !v)}
            className="flex flex-col gap-1.5 p-1">
            <span className={`block w-5 h-px bg-gold-dim transition-transform ${open ? 'rotate-45 translate-y-2' : ''}`} />
            <span className={`block w-5 h-px bg-gold-dim transition-opacity ${open ? 'opacity-0' : ''}`} />
            <span className={`block w-5 h-px bg-gold-dim transition-transform ${open ? '-rotate-45 -translate-y-2' : ''}`} />
          </button>
        </div>
      </div>
    </>
  )
}
