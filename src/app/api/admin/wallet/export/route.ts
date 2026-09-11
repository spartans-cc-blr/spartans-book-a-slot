// GET /api/admin/wallet/export
// Admin only. Downloadable wallet report for the "⬇ Export" menu on
// /admin/wallet — a single real .xlsx workbook with a "Summary" sheet
// (every player's current wallet balance, plus a small dashboard header of
// KPI tiles) and a "Detailed" sheet (every transaction, per player, with a
// running total). See features/wallet-ledger.md §16.
//
// Read-only, no rate limit — same convention as the other admin-only GET
// panels (e.g. /api/admin/fee-reminders).

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { buildWalletExportData, buildWalletExportWorkbook } from '@/lib/walletExport'

export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })

  const { summary, detailed } = await buildWalletExportData()
  const buffer = await buildWalletExportWorkbook(summary, detailed)

  const dateStamp = new Date().toISOString().slice(0, 10)

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="wallet-report-${dateStamp}.xlsx"`,
    },
  })
}
