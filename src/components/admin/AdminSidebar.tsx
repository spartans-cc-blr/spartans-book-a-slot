'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

const NAV = [
  { href: '/admin',                  label: 'Dashboard',        icon: '📋', exact: true },
  // After the Dashboard entry:
  { href: '/admin/schedule',         label: 'Full Schedule',    icon: '📅' },
  { href: '/admin/bookings/new',     label: 'New Booking',      icon: '➕' },
  { href: '/admin/soft-blocks/new',  label: 'Soft Blocks',      icon: '🔒' },
  { href: '/admin/captains',         label: 'Captains',         icon: '👥', section: 'Master Data' },
  { href: '/admin/tournaments',      label: 'Tournaments',      icon: '🏆' },
  { href: '/admin/grounds',          label: 'Grounds',          icon: '📍' },
  { href: '/schedule',               label: 'Organiser View',   icon: '🌐', section: 'Views' },
  { href: '/fixtures',               label: 'Upcoming Matches', icon: '🏏' },
  { href: '/admin/players',          label: 'Players',          icon: '🏏' },
]

export function AdminSidebar() {
  const path = usePathname()
  const [open, setOpen] = useState(false)

  const currentPage = NAV.find(item =>
    item.exact ? path === item.href : path.startsWith(item.href)
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="w-52 bg-ink-2 border-r border-ink-5 flex-shrink-0 hidden md:flex flex-col py-4">
        {NAV.map(item => {
          const isActive = item.exact ? path === item.href : path.startsWith(item.href)
          return (
            <div key={item.href}>
              {item.section && (
                <p className="font-rajdhani text-[10px] font-bold tracking-[3px] uppercase text-zinc-700 px-5 pt-4 pb-1">
                  {item.section}
                </p>
              )}
              <Link href={item.href}
                className={`flex items-center gap-2.5 px-5 py-2.5 font-rajdhani text-sm font-medium transition-all border-l-2
                  ${isActive ? 'text-gold border-gold bg-gold/5' : 'text-zinc-500 border-transparent hover:text-zinc-300 hover:bg-ink-3'}`}>
                <span className="text-base w-5 text-center">{item.icon}</span>
                {item.label}
              </Link>
            </div>
          )
        })}
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-ink-2 border-t border-ink-5">
        {/* Mobile nav drawer */}
        {open && (
          <div className="bg-ink-2 border-t border-ink-5 px-4 py-3 flex flex-col gap-1 max-h-[70vh] overflow-y-auto">
            {NAV.map(item => {
              const isActive = item.exact ? path === item.href : path.startsWith(item.href)
              return (
                <div key={item.href}>
                  {item.section && (
                    <p className="font-rajdhani text-[10px] font-bold tracking-[3px] uppercase text-zinc-700 px-2 pt-3 pb-1">
                      {item.section}
                    </p>
                  )}
                  <Link href={item.href} onClick={() => setOpen(false)}
                    className={`flex items-center gap-3 px-3 py-3 rounded font-rajdhani text-sm font-medium transition-all
                      ${isActive ? 'text-gold bg-gold/5' : 'text-zinc-400 hover:text-zinc-200 hover:bg-ink-3'}`}>
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
          <span className="font-rajdhani text-xs text-zinc-500 truncate max-w-[60%]">
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
