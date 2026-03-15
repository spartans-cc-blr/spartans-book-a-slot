'use client'
import Link from 'next/link'
import { useState } from 'react'

interface SiteNavProps {
  activePage?: string
  isAdmin?:    boolean
}

export function SiteNav({ activePage, isAdmin }: SiteNavProps) {
  const [open, setOpen] = useState(false)

  const links = [
    { href: 'https://spartanscricketclub.vercel.app', label: 'Club Site' },
    { href: '/schedule', label: 'Schedule', key: 'schedule' },
    { href: '/fixtures', label: 'Fixtures',  key: 'fixtures' },
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
        </div>

        {/* Mobile: hamburger */}
        <div className="md:hidden ml-auto flex items-center gap-3">
          {isAdmin && (
            <Link href="/admin" className="font-rajdhani text-xs font-bold text-crimson">Admin</Link>
          )}
          <button onClick={() => setOpen(v => !v)} className="flex flex-col gap-1.5 p-1">
            <span className={`block w-5 h-px bg-gold-dim transition-transform ${open ? 'rotate-45 translate-y-2' : ''}`} />
            <span className={`block w-5 h-px bg-gold-dim transition-opacity ${open ? 'opacity-0' : ''}`} />
            <span className={`block w-5 h-px bg-gold-dim transition-transform ${open ? '-rotate-45 -translate-y-2' : ''}`} />
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
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