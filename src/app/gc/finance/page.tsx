// /gc/finance — the club balance sheet, summary only, for GC and admin.
// No player-level balances or individual entries are fetched here; those are
// on /admin/finance. See features/finance-balance-sheet.md.

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { SiteNav } from '@/components/ui/SiteNav'
import { BalanceSheetView } from '@/components/finance/BalanceSheetView'
import { getBalanceSheet, FINANCE_CUTOVER_DATE } from '@/lib/finance'
import { istToday } from '@/lib/matchCompletion'

export const metadata: Metadata = { title: 'Club Finance — Spartans CC' }
export const revalidate = 0

export default async function GCFinancePage() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user) redirect('/login')
  if (!user.isGC && !user.isAdmin) redirect('/')

  let sheet = null
  try {
    sheet = await getBalanceSheet()
  } catch (err) {
    console.error('[gc/finance] balance sheet failed:', err)
  }

  return (
    <div className="min-h-screen bg-parchment dark:bg-ink">
      <SiteNav activePage="gc-finance" back={{ fallbackHref: '/', label: 'Home' }} />
      <main className="px-5 md:px-8 lg:px-10 py-6 max-w-4xl">
        <p className="font-rajdhani text-xs font-bold tracking-widest uppercase text-[#78716C] dark:text-zinc-500">Spartans Finance</p>
        <h1 className="font-cinzel text-xl font-bold text-amber-700 dark:text-gold mb-1">Balance Sheet</h1>
        <p className="font-rajdhani text-sm text-[#78716C] dark:text-zinc-500 mb-6">
          {istToday() < FINANCE_CUTOVER_DATE
            ? 'Figures up to 2026 are carried over from the club spreadsheet. CY 2026 is provisional until the year closes.'
            : 'Figures up to 2026 are carried over from the club spreadsheet. Later years come from the Hub.'}
        </p>
        {sheet
          ? <BalanceSheetView sheet={sheet} />
          : <p className="font-rajdhani text-sm text-red-700 dark:text-red-400">The balance sheet could not be loaded. Please try again later.</p>}
      </main>
    </div>
  )
}
