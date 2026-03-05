'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/admin',              label: 'Dashboard',    icon: '📋', exact: true },
  { href: '/admin/bookings/new', label: 'New Booking',  icon: '➕' },
  { href: '/admin/soft-blocks',  label: 'Soft Blocks',  icon: '🔒' },
  { href: '/admin/captains',     label: 'Captains',     icon: '👥', section: 'Master Data' },
  { href: '/admin/tournaments',  label: 'Tournaments',  icon: '🏆' },
  { href: '/schedule',           label: 'Public View',  icon: '🌐', section: 'Views' },
]

export function AdminSidebar() {
  const path = usePathname()

  return (
    <aside className="w-52 bg-ink-2 border-r border-ink-5 flex-shrink-0 hidden md:flex flex-col py-4">
      {NAV.map((item, i) => {
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
                ${isActive
                  ? 'text-gold border-gold bg-gold/5'
                  : 'text-zinc-500 border-transparent hover:text-zinc-300 hover:bg-ink-3'}`}>
              <span className="text-base w-5 text-center">{item.icon}</span>
              {item.label}
            </Link>
          </div>
        )
      })}
    </aside>
  )
}
