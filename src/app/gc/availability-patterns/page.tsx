// /gc/availability-patterns — Council-only view of each player's availability
// habits (slot, day, format, captain, ground) and reliability signals.
// GC and admin only: patterns such as "never available under captain X" are
// sensitive, so the data is never fetched for anyone else.
// See .claude/rules/features/availability-patterns.md.

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { SiteNav } from '@/components/ui/SiteNav'
import { AvailabilityPatternsClient } from '@/components/gc/AvailabilityPatternsClient'
import {
  getAvailabilityPatterns,
  PATTERN_PERIODS,
  DEFAULT_PATTERN_PERIOD,
  type PatternPeriod,
  type AvailabilityPatternsResult,
} from '@/lib/availabilityPatterns'

export const metadata: Metadata = { title: 'Availability Patterns — Spartans CC' }
export const revalidate = 0

export default async function AvailabilityPatternsPage({ searchParams }: { searchParams: { period?: string } }) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user) redirect('/login')
  if (!user.isGC && !user.isAdmin) redirect('/')

  const period: PatternPeriod = (PATTERN_PERIODS as readonly string[]).includes(searchParams.period ?? '')
    ? (searchParams.period as PatternPeriod)
    : DEFAULT_PATTERN_PERIOD

  let result: AvailabilityPatternsResult | null = null
  try {
    result = await getAvailabilityPatterns(period)
  } catch (err) {
    console.error('[gc/availability-patterns] fetch failed:', err)
  }

  return (
    <div className="min-h-screen bg-parchment dark:bg-ink">
      <SiteNav activePage="gc-patterns" back={{ fallbackHref: '/', label: 'Home' }} />
      <main className="px-5 md:px-8 lg:px-10 py-6 max-w-4xl">
        <p className="font-rajdhani text-xs font-bold tracking-widest uppercase text-[#78716C] dark:text-zinc-500">Council · Confidential</p>
        <h1 className="font-cinzel text-xl font-bold text-amber-700 dark:text-gold mb-1">Availability Patterns</h1>
        <p className="font-rajdhani text-sm text-[#78716C] dark:text-zinc-500 mb-5">
          How each player marks availability, compared with the games actually on offer to them. A pattern is shown only
          when the sample is large enough and the difference is clear. These are signals to talk about, not verdicts.
        </p>
        {result
          ? <AvailabilityPatternsClient result={result} period={period} />
          : <p className="font-rajdhani text-sm text-red-700 dark:text-red-400">Availability patterns could not be loaded. Please try again later.</p>}
      </main>
    </div>
  )
}
