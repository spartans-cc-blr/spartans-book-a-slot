'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { GenerateInviteItem } from '@/components/ui/GenerateInviteItem'

// Plain top-level nav row — no children, navigates directly.
interface LinkEntry {
  kind: 'link'
  href: string
  label: string
  icon: string
  exact?: boolean
  section?: string
}

// A single child row inside a dropdown group.
interface GroupChild {
  href: string
  label: string
  icon: string
  exact?: boolean
}

// A hover-expandable group, mirroring one of SiteNav's own desktop dropdowns
// (Matches ▾ / Captains' Corner ▾ / Stats ▾ / Council ⚖ / Wrangler ⚒) —
// the button itself never navigates, only its children do.
interface GroupEntry {
  kind: 'group'
  key: string
  label: string
  icon: string
  section?: string
  children: GroupChild[]
  // Council's "🔗 Generate Invite Link" action sits at the bottom of its
  // flyout in SiteNav too — not a plain Link, so it's flagged rather than
  // modelled as a GroupChild.
  invite?: boolean
}

type NavEntry = LinkEntry | GroupEntry

const NAV: NavEntry[] = [
  { kind: 'link', href: '/admin', label: 'Matches', icon: '📋', exact: true },
  // After the Matches entry:
  { kind: 'link', href: '/admin/bookings/new', label: 'New Booking', icon: '➕' },
  { kind: 'link', href: '/admin/soft-blocks/new', label: 'Soft Blocks', icon: '🔒' },
  { kind: 'link', href: '/admin/captains', label: 'Captains', icon: '👥', section: 'Master Data' },
  { kind: 'link', href: '/admin/tournaments', label: 'Tournaments', icon: '🏆' },
  { kind: 'link', href: '/admin/players', label: 'Players', icon: '🏏' },
  { kind: 'link', href: '/admin/wallet', label: 'Wallet', icon: '💰' },
  { kind: 'link', href: '/admin/scorecard-backfill', label: 'Scorecard Backfill', icon: '📥', section: 'Utilities' },
  { kind: 'link', href: '/admin/booking-backfill', label: 'Booking Backfill', icon: '🗓️' },
  { kind: 'link', href: '/admin/player-reconciliation', label: 'Player Reconciliation', icon: '🪪' },
  { kind: 'link', href: '/admin/cricheroes-id-backfill', label: 'CricHeroes ID Backfill', icon: '🔗' },

  // Hub Views — the exact same nav SiteNav renders for a signed-in member,
  // one entry per destination, in the same order, with the same dropdown
  // groups (Matches ▾/Captains' Corner ▾/Stats ▾/Council ⚖/Wrangler ⚒)
  // rendered as real hover-expandable flyouts below, not a flat list — so
  // an admin never has to leave /admin to reach any of them. Placed after
  // Utilities per the same request that retired the standalone "The Dugout"
  // section this replaced — Store Orders (inside Council ⚖ below) now
  // points at /dugout/store-orders (the player-chrome page), not the old
  // /admin/dugout/kit-room duplicate, which is byte-for-byte the same
  // AdminKitRoomClient/isAdmin||isGC gate — see navigation.md.
  { kind: 'link', href: '/', label: 'Home', icon: '🏠', exact: true, section: 'Hub Views' },
  {
    kind: 'group', key: 'matches', label: 'Matches', icon: '🏏',
    children: [
      { href: '/fixtures', label: 'Upcoming Fixtures', icon: '🏏' },
      { href: '/matches/history', label: 'Past Matches', icon: '📜' },
    ],
  },
  {
    kind: 'group', key: 'captains', label: "Captains' Corner", icon: '📝',
    children: [
      { href: '/captains-corner', label: 'Squad Selection', icon: '🏏', exact: true },
      { href: '/captains-corner/unavailable-dates', label: 'Unavailable Dates', icon: '🚫' },
      { href: '/captains-corner/my-players', label: 'My Players', icon: '📈' },
      { href: '/captains-corner/match-planning', label: 'Match Planning', icon: '🧭' },
      { href: '/opponents', label: 'Opponents', icon: '⚔️' },
    ],
  },
  {
    kind: 'group', key: 'stats', label: 'Stats', icon: '📊',
    children: [
      { href: '/leaderboard', label: 'Yours Statistically', icon: '📊' },
      { href: '/team-stats', label: 'Team Record', icon: '🛡️' },
      { href: '/players', label: 'Players', icon: '👤' },
    ],
  },
  { kind: 'link', href: '/schedule', label: 'Schedule', icon: '🌐' },
  { kind: 'link', href: '/dugout', label: 'The Dugout', icon: '🏟️', exact: true },
  { kind: 'link', href: '/tournament-planner', label: 'Tournament Planner', icon: '📈' },
  { kind: 'link', href: '/profile', label: 'My Profile', icon: '👤' },
  {
    kind: 'group', key: 'council', label: 'Council ⚖', icon: '⚖️',
    children: [
      { href: '/gc-review', label: 'Squad Review', icon: '⚖️' },
      { href: '/captains-corner/my-players', label: 'Captaincy Records', icon: '📈' },
      { href: '/gc/feedback', label: 'Feedback', icon: '📋' },
      { href: '/dugout/store-orders', label: 'Store Orders', icon: '🥎' },
      { href: '/wrangler/grounds', label: 'Grounds', icon: '📍' },
      { href: '/opponents', label: 'Opponents', icon: '⚔️' },
    ],
    invite: true,
  },
  {
    kind: 'group', key: 'wrangler', label: 'Wrangler ⚒', icon: '⚒️',
    children: [
      { href: '/wrangler/backfill-squad', label: 'Squad Backfill', icon: '🧩' },
      { href: '/wrangler/grounds', label: 'Grounds', icon: '📍' },
      { href: '/wrangler/commentary', label: 'Commentary', icon: '📊' },
      { href: '/opponents', label: 'Opponents', icon: '⚔️' },
    ],
  },
  { kind: 'link', href: '/wallet', label: 'My Wallet', icon: '🪙' },
]

// Flattened leaf list (group children included, group wrapper itself
// excluded since it never navigates) — used only to label the mobile
// bottom bar with whichever destination the current path resolves to.
const ALL_LEAVES: GroupChild[] = NAV.flatMap(entry =>
  entry.kind === 'link' ? [{ href: entry.href, label: entry.label, icon: entry.icon, exact: entry.exact }] : entry.children
)

function matches(path: string, item: { href: string; exact?: boolean }) {
  return item.exact ? path === item.href : path.startsWith(item.href)
}

export function AdminSidebar() {
  const path = usePathname()
  const [open, setOpen] = useState(false)
  const [hoverGroup, setHoverGroup] = useState<string | null>(null)
  const [mobileGroup, setMobileGroup] = useState<Record<string, boolean>>({})

  const currentPage = ALL_LEAVES.find(item => matches(path, item))

  return (
    <>
      {/* Desktop sidebar — theme-aware, same convention as AdminLayout's top
          bar above (dark preserved exactly, light new). Each group is a real
          hover-expandable flyout, mirroring SiteNav's own desktop dropdowns
          (Matches ▾/Captains' Corner ▾/Stats ▾/Council ⚖/Wrangler ⚒) rather
          than a flat always-expanded list. */}
      <aside className="w-52 bg-white dark:bg-ink-2 border-r border-[#D4C9B0] dark:border-ink-5 flex-shrink-0 hidden md:flex flex-col py-4 relative">
        {NAV.map(entry => {
          if (entry.kind === 'link') {
            const isActive = matches(path, entry)
            return (
              <div key={entry.href}>
                {entry.section && (
                  <p className="font-rajdhani text-[10px] font-bold tracking-[3px] uppercase text-[#78716C] dark:text-zinc-700 px-5 pt-4 pb-1">
                    {entry.section}
                  </p>
                )}
                <Link href={entry.href}
                  className={`flex items-center gap-2.5 px-5 py-2.5 font-rajdhani text-sm font-medium transition-all border-l-2
                    ${isActive ? 'text-gold border-gold bg-gold/5' : 'text-[#78716C] dark:text-zinc-500 border-transparent hover:text-[#292524] dark:hover:text-zinc-300 hover:bg-[#F8F4EE] dark:hover:bg-ink-3'}`}>
                  <span className="text-base w-5 text-center">{entry.icon}</span>
                  {entry.label}
                </Link>
              </div>
            )
          }

          // Group — hover-expandable flyout to the right of the sidebar.
          const isGroupActive = entry.children.some(c => matches(path, c))
          const isOpen = hoverGroup === entry.key
          return (
            <div key={entry.key}>
              {entry.section && (
                <p className="font-rajdhani text-[10px] font-bold tracking-[3px] uppercase text-[#78716C] dark:text-zinc-700 px-5 pt-4 pb-1">
                  {entry.section}
                </p>
              )}
              <div className="relative"
                onMouseEnter={() => setHoverGroup(entry.key)}
                onMouseLeave={() => setHoverGroup(null)}>
                <button type="button"
                  className={`w-full flex items-center justify-between gap-2.5 px-5 py-2.5 font-rajdhani text-sm font-medium transition-all border-l-2
                    ${isGroupActive || isOpen ? 'text-gold border-gold bg-gold/5' : 'text-[#78716C] dark:text-zinc-500 border-transparent hover:text-[#292524] dark:hover:text-zinc-300 hover:bg-[#F8F4EE] dark:hover:bg-ink-3'}`}>
                  <span className="flex items-center gap-2.5">
                    <span className="text-base w-5 text-center">{entry.icon}</span>
                    {entry.label}
                  </span>
                  <span className="text-[8px]">▸</span>
                </button>
                {isOpen && (
                  <div className="absolute left-full top-0 w-56 bg-white dark:bg-ink-2 border border-[#D4C9B0] dark:border-ink-5 rounded shadow-xl z-50">
                    {entry.children.map((child, i) => {
                      const childActive = matches(path, child)
                      return (
                        <Link key={child.href + child.label} href={child.href}
                          className={`flex items-center gap-2.5 px-4 py-3 font-rajdhani text-xs font-semibold tracking-wide uppercase transition-colors
                            ${i < entry.children.length - 1 || entry.invite ? 'border-b border-[#D4C9B0] dark:border-ink-5' : ''}
                            ${childActive ? 'text-gold bg-[#FEF3C7] dark:bg-ink-3' : 'text-[#44403C] dark:text-zinc-400 hover:text-gold hover:bg-[#F8F4EE] dark:hover:bg-ink-3'}`}>
                          <span className="w-4 text-center">{child.icon}</span>
                          {child.label}
                        </Link>
                      )
                    })}
                    {entry.invite && <GenerateInviteNavItem />}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-ink-2 border-t border-[#D4C9B0] dark:border-ink-5">
        {/* Mobile nav drawer — groups render as a click-to-expand accordion,
            since hover has no touch equivalent. */}
        {open && (
          <div className="bg-white dark:bg-ink-2 border-t border-[#D4C9B0] dark:border-ink-5 px-4 py-3 flex flex-col gap-1 max-h-[70vh] overflow-y-auto">
            {NAV.map(entry => {
              if (entry.kind === 'link') {
                const isActive = matches(path, entry)
                return (
                  <div key={entry.href}>
                    {entry.section && (
                      <p className="font-rajdhani text-[10px] font-bold tracking-[3px] uppercase text-[#78716C] dark:text-zinc-700 px-2 pt-3 pb-1">
                        {entry.section}
                      </p>
                    )}
                    <Link href={entry.href} onClick={() => setOpen(false)}
                      className={`flex items-center gap-3 px-3 py-3 rounded font-rajdhani text-sm font-medium transition-all
                        ${isActive ? 'text-gold bg-gold/5' : 'text-[#44403C] dark:text-zinc-400 hover:text-[#1C1917] dark:hover:text-zinc-200 hover:bg-[#F8F4EE] dark:hover:bg-ink-3'}`}>
                      <span className="text-base w-5 text-center">{entry.icon}</span>
                      {entry.label}
                    </Link>
                  </div>
                )
              }

              const isGroupActive = entry.children.some(c => matches(path, c))
              const isExpanded = !!mobileGroup[entry.key]
              return (
                <div key={entry.key}>
                  {entry.section && (
                    <p className="font-rajdhani text-[10px] font-bold tracking-[3px] uppercase text-[#78716C] dark:text-zinc-700 px-2 pt-3 pb-1">
                      {entry.section}
                    </p>
                  )}
                  <button type="button"
                    onClick={() => setMobileGroup(prev => ({ ...prev, [entry.key]: !prev[entry.key] }))}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-3 rounded font-rajdhani text-sm font-medium transition-all
                      ${isGroupActive ? 'text-gold bg-gold/5' : 'text-[#44403C] dark:text-zinc-400 hover:text-[#1C1917] dark:hover:text-zinc-200 hover:bg-[#F8F4EE] dark:hover:bg-ink-3'}`}>
                    <span className="flex items-center gap-3">
                      <span className="text-base w-5 text-center">{entry.icon}</span>
                      {entry.label}
                    </span>
                    <span className={`text-[10px] transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▸</span>
                  </button>
                  {isExpanded && (
                    <div className="ml-6 flex flex-col gap-0.5 border-l border-[#D4C9B0] dark:border-ink-5 pl-3 py-1">
                      {entry.children.map(child => {
                        const childActive = matches(path, child)
                        return (
                          <Link key={child.href + child.label} href={child.href} onClick={() => setOpen(false)}
                            className={`flex items-center gap-2 px-2 py-2 rounded font-rajdhani text-xs font-semibold tracking-wide uppercase transition-colors
                              ${childActive ? 'text-gold bg-gold/5' : 'text-[#78716C] dark:text-zinc-500 hover:text-[#1C1917] dark:hover:text-zinc-200 hover:bg-[#F8F4EE] dark:hover:bg-ink-3'}`}>
                            <span className="w-4 text-center">{child.icon}</span>
                            {child.label}
                          </Link>
                        )
                      })}
                      {entry.invite && <GenerateInviteNavItem mobile />}
                    </div>
                  )}
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

// Thin local wrapper around the shared GenerateInviteItem so its two render
// branches (desktop flyout row / mobile sheet row) get the exact styling
// SiteNav's own Council ⚖ dropdown already uses for it — same component,
// not a reimplementation, see navigation.md §11's "GenerateInviteItem —
// onClose prop" note.
function GenerateInviteNavItem({ mobile }: { mobile?: boolean }) {
  return <GenerateInviteItem mobile={mobile} />
}
