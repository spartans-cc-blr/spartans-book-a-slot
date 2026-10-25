// /records — the club Record Book: every standing record (team totals, individual
// scores and bowling, fielding, partnerships) for T20 and T30, all-time or by season,
// with how long each has stood and what it beat. Player-facing twin of the admin
// "Current records" tab (no alert details, no share button). Any signed-in,
// non-expelled member. See .claude/rules/features/record-breaking.md.

import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { SiteNav } from '@/components/ui/SiteNav'
import { RecordBookView } from '@/components/records/RecordBookView'
import { getRecordBookCached } from '@/lib/recordBreakDetect'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Record Book — Spartans CC' }
export const revalidate = 0

export default async function RecordsPage() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session) redirect(`/login?callbackUrl=${encodeURIComponent('/records')}`)
  if (user?.playerStatus === 'expelled') redirect('/')

  let records = null
  try {
    records = await getRecordBookCached()
  } catch (e) {
    console.error('[records] failed to load record book', e)
  }

  return (
    <div className="min-h-screen bg-parchment dark:bg-ink grain">
      <SiteNav activePage="records" back={{ fallbackHref: '/', label: 'Home' }} />
      <main>
        <div className="bg-white dark:bg-ink-2 border-b border-[#D4C9B0] dark:border-ink-4 px-5 md:px-8 lg:px-10 py-7">
          <p className="text-amber-700 dark:text-gold text-xs font-rajdhani font-semibold tracking-[3px] uppercase mb-2">Performance</p>
          <h1 className="font-cinzel text-2xl md:text-3xl font-bold text-[#1C1917] dark:text-parchment tracking-wide">📖 Record Book</h1>
          <p className="font-rajdhani text-sm text-[#78716C] dark:text-zinc-500 mt-2 max-w-2xl">
            Spartans&apos; best ever — team totals, individual knocks and spells, fielding and partnerships for every
            wicket — with how long each record has stood. Practice games don&apos;t count.
          </p>
        </div>
        <div className="px-5 md:px-8 lg:px-10 py-6 max-w-6xl">
          {records
            ? <RecordBookView records={records as any} admin={false} />
            : <p className="font-rajdhani text-sm text-red-700 dark:text-red-400">Couldn&apos;t load the record book right now. Please try again shortly.</p>}
        </div>
      </main>
    </div>
  )
}
