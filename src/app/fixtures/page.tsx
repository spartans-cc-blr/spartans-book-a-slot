import { Suspense } from 'react'
import { SiteNav } from '@/components/ui/SiteNav'
import { ScheduleGrid } from '@/components/schedule/ScheduleGrid'
import { ScheduleSkeleton } from '@/components/schedule/ScheduleSkeleton'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Upcoming Fixtures — Spartans Cricket Club',
  description: 'Upcoming match fixtures for Spartans CC players.',
}

export const revalidate = 60

export default async function PlayersPage() {
  return (
    <div className="min-h-screen bg-ink grain">
      <SiteNav activePage="players" />

      {/* Hero */}
      <div className="bg-ink-2 border-b border-ink-4 px-5 md:px-8 lg:px-10 py-7 md:py-9 relative overflow-hidden">
        <div className="absolute -top-8 -right-8 w-48 h-48 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(201,168,76,0.1) 0%, transparent 70%)' }} />
        <p className="text-gold text-xs font-rajdhani font-semibold tracking-[3px] uppercase mb-2 flex items-center gap-2">
          <span className="w-4 h-px bg-gold inline-block" />
          Spartans Cricket Club · Bengaluru
        </p>
        <h1 className="font-cinzel text-2xl md:text-3xl font-bold text-parchment mb-2 tracking-wide">
          Upcoming Fixtures
        </h1>
        <p className="text-muted text-sm md:text-base max-w-xl leading-relaxed font-rajdhani">
          Confirmed and upcoming matches for Spartans CC. Tap a booked slot to view match details on CricHeroes.
        </p>
      </div>

      <div className="px-5 md:px-8 lg:px-10 py-6">
        <Suspense fallback={<ScheduleSkeleton />}>
          <ScheduleGrid playerView />
        </Suspense>
      </div>

      <footer className="border-t border-ink-4 py-5 text-center font-rajdhani text-xs text-zinc-600 mt-8">
        © 2026 <span className="text-gold-dim">Spartans Cricket Club</span> · Bengaluru · Est. 2014
      </footer>
    </div>
  )
}
