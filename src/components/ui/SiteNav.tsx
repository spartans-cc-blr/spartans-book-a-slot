'use client'
import Link from 'next/link'

interface SiteNavProps {
  activePage?: string
  isAdmin?:    boolean
}

export function SiteNav({ activePage, isAdmin }: SiteNavProps) {
  return (
    <nav className="bg-ink-2 border-b border-gold-dim sticky top-0 z-50">
      <div className="flex items-center px-5 md:px-8 lg:px-10 h-14">
        {/* Logo */}
        <Link href="/schedule" className="flex items-center gap-2.5">
          <img 
            src="/Transparent High Resolution.png" 
            alt="Spartans CC" 
            className="w-8 h-8 object-contain"
          />
          <span className="font-cinzel font-bold text-gold tracking-[2px] text-[13px] hidden sm:block">
            SPARTANS CC
          </span>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center ml-auto gap-0">
          {[
            { href: 'https://spartanscricketclub.vercel.app', label: 'Club Site' },
            { href: '/schedule', label: 'Schedule', key: 'schedule' },
            { href: '/fixtures', label: 'Fixtures', key: 'fixtures' },
          ].map(item => (
            <Link key={item.label} href={item.href}
              className={`font-rajdhani text-xs font-semibold tracking-[1.5px] uppercase px-4 h-14 flex items-center border-b-2 transition-all
                ${activePage === item.key
                  ? 'text-gold border-crimson'
                  : 'text-zinc-500 border-transparent hover:text-gold'}`}>
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

        {/* Mobile: hamburger placeholder */}
        <div className="md:hidden ml-auto flex items-center gap-2">
          {isAdmin && (
            <Link href="/admin" className="font-rajdhani text-xs font-bold text-crimson">
              Admin
            </Link>
          )}
          <div className="flex flex-col gap-1.5 p-1 cursor-pointer">
            <span className="block w-5 h-px bg-gold-dim" />
            <span className="block w-5 h-px bg-gold-dim" />
            <span className="block w-5 h-px bg-gold-dim" />
          </div>
        </div>
      </div>
    </nav>
  )
}
