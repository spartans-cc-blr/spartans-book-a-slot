// /admin/finance — club balance sheet plus the entries behind it (admin only;
// the /admin layout already redirects everyone else). GC sees the summary at
// /gc/finance. See features/finance-balance-sheet.md.

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { BalanceSheetView } from '@/components/finance/BalanceSheetView'
import { FinanceAdminClient } from '@/components/finance/FinanceAdminClient'
import { getFinanceAdminData, FINANCE_CUTOVER_DATE } from '@/lib/finance'
import { istToday } from '@/lib/matchCompletion'

export const revalidate = 0

export default async function AdminFinancePage() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin) redirect('/?error=unauthorized')

  let data: Awaited<ReturnType<typeof getFinanceAdminData>> | null = null
  let loadError: string | null = null
  try {
    data = await getFinanceAdminData()
  } catch (err: any) {
    console.error('[admin/finance] load failed:', err)
    loadError = err?.message ?? 'Unknown error'
  }

  const today = istToday()
  return (
    <div>
      <h1 className="font-cinzel text-xl font-bold text-amber-700 dark:text-gold mb-1">Finance</h1>
      <p className="font-rajdhani text-[#78716C] dark:text-zinc-500 text-sm mb-6">
        Club balance sheet. Figures up to 2026 are opening figures from the club spreadsheet; from{' '}
        {FINANCE_CUTOVER_DATE} they come from the Hub.
      </p>
      {!data && (
        <p className="font-rajdhani text-sm text-red-700 dark:text-red-400">
          The balance sheet could not be loaded ({loadError}). If the finance tables have not been created yet,
          apply migration 091.
        </p>
      )}
      {data && (
        <>
          <BalanceSheetView sheet={data.sheet} />
          <FinanceAdminClient
            sheet={data.sheet}
            entries={data.entries}
            bankHistory={data.bankHistory}
            today={today}
            entriesOpen={today >= FINANCE_CUTOVER_DATE}
          />
        </>
      )}
    </div>
  )
}
