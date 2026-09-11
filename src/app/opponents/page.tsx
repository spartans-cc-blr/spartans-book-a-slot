// /opponents — opponent master list + reconciliation queue. Reached from
// the Captains' Corner ▾, Council ⚖ and Wrangler ⚒ nav dropdowns (and the
// matching mobile More-sheet sections). See features/team-stats.md §5.
//
// Write access is captain / GC / wrangler / admin, re-enforced server-side
// in /api/opponents — the page gate here is the visibility half of the
// same rule, same "UI mirrors the API, never replaces it" posture as
// /wrangler/grounds.

import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { SiteNav } from '@/components/ui/SiteNav'
import { OpponentsClient } from '@/components/opponents/OpponentsClient'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Opponents — Spartans CC' }
export const revalidate = 0

export default async function OpponentsPage() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session) redirect('/login?callbackUrl=%2Fopponents')
  if (user?.playerStatus === 'expelled') redirect('/')
  if (!user?.isCaptain && !user?.isGC && !user?.isWrangler && !user?.isAdmin) redirect('/team-stats')

  return (
    <div className="min-h-screen bg-[var(--stats-shell-bg)] dark:bg-ink grain">
      <SiteNav activePage="opponents" />
      <div className="bg-[var(--stats-card-bg)] dark:bg-ink-2 border-b border-[var(--stats-divider)] dark:border-ink-4 px-5 md:px-8 lg:px-10 py-7">
        <p className="text-[var(--stats-accent)] dark:text-gold text-xs font-rajdhani font-semibold tracking-[3px] uppercase mb-2 flex items-center gap-2">
          <span className="w-4 h-px bg-[var(--stats-accent)] dark:bg-gold inline-block" />
          Master data
        </p>
        <h1 className="font-cinzel text-2xl md:text-3xl font-bold text-[var(--stats-text)] dark:text-parchment tracking-wide">Opponents</h1>
        <p className="font-rajdhani text-sm text-[var(--stats-text-muted)] dark:text-zinc-500 mt-2 max-w-2xl">
          One entry per club we play, so every spelling on a booking counts towards the same head-to-head record on <a href="/team-stats?by=opponent" className="text-[var(--stats-accent)] dark:text-gold underline decoration-dotted">Team Record</a>. Star the marquee rivals to pin them at the top.
        </p>
      </div>
      <main className="px-5 md:px-8 lg:px-10 py-6 max-w-5xl">
        <OpponentsClient />
      </main>
    </div>
  )
}
