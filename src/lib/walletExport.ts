// Admin wallet Excel export — src/app/api/admin/wallet/export/route.ts is the
// only caller. See features/wallet-ledger.md §16.
//
// Produces a single downloadable workbook with two named sheets:
//   - "Summary"  — one row per player: name + current wallet balance.
//   - "Detailed" — one row per transaction, grouped by player, in
//     chronological (oldest-first) order, with a running total that starts
//     from that player's own opening balance (the same "Brought Forward"
//     figure the /wallet statement page computes — see §5 of the feature
//     doc) so the numbers tie out to a real ledger, not just a bare list.
//
// No xlsx library dependency — this repo deliberately keeps its runtime
// dependency count minimal (see limitations.md's cold-start audit). Instead
// this emits the long-standing "HTML + SpreadsheetML" workbook format
// (the same thing Excel itself produces via File > Save As > Web Page),
// which real Excel opens as a normal multi-sheet workbook with no library
// needed on either side.

import { createServiceClient } from '@/lib/supabase'

export type WalletSummaryRow = { name: string; wallet_balance: number }
export type WalletDetailRow = { name: string; transaction: string; running_total: number }

type TxRow = {
  player_id: string
  type: 'credit' | 'debit'
  amount: number
  reason: string
  created_at: string
}

// PostgREST silently caps an unpaginated response at 1000 rows — this exact
// class of bug has bitten this app before on a club-wide analytics read
// (features/leaderboard.md §8.1). The wallet ledger can plausibly cross
// 1000 rows across a season, so page explicitly rather than trust one call.
async function fetchAllTransactions(supabase: ReturnType<typeof createServiceClient>): Promise<TxRow[]> {
  const PAGE = 1000
  const all: TxRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('wallet_transactions')
      .select('player_id, type, amount, reason, created_at')
      .order('player_id', { ascending: true })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    all.push(...((data ?? []) as TxRow[]))
    if (!data || data.length < PAGE) break
  }
  return all
}

export async function buildWalletExportData(): Promise<{
  summary: WalletSummaryRow[]
  detailed: WalletDetailRow[]
}> {
  const supabase = createServiceClient()

  const { data: players, error: playersErr } = await supabase
    .from('players')
    .select('id, name, wallet_balance, wallet_opening_balance')
    .order('name', { ascending: true })
  if (playersErr) throw new Error(playersErr.message)

  const rows = players ?? []

  const summary: WalletSummaryRow[] = rows.map(p => ({
    name: p.name,
    wallet_balance: Number(p.wallet_balance ?? 0),
  }))

  const allTx = await fetchAllTransactions(supabase)
  const txByPlayer = new Map<string, TxRow[]>()
  for (const t of allTx) {
    const list = txByPlayer.get(t.player_id)
    if (list) list.push(t)
    else txByPlayer.set(t.player_id, [t])
  }

  const detailed: WalletDetailRow[] = []
  for (const p of rows) {
    const txs = txByPlayer.get(p.id) ?? []
    if (txs.length === 0) continue

    // Same "opening = current balance − Σ ledger deltas" formula the
    // /wallet statement's Brought Forward line uses — see wallet-ledger.md
    // §5 — with an admin's explicit wallet_opening_balance override, if
    // set, taking precedence exactly as it does there.
    const ledgerSum = txs.reduce(
      (sum, t) => sum + (t.type === 'credit' ? Number(t.amount) : -Number(t.amount)), 0
    )
    const computedOpening = Number(p.wallet_balance ?? 0) - ledgerSum
    const opening = p.wallet_opening_balance != null ? Number(p.wallet_opening_balance) : computedOpening

    let running = opening
    detailed.push({ name: p.name, transaction: 'Brought Forward', running_total: round2(running) })

    for (const t of txs) {
      const delta = t.type === 'credit' ? Number(t.amount) : -Number(t.amount)
      running += delta
      const dateStr = new Date(t.created_at).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric',
      })
      const label = `${dateStr} · ${t.type === 'credit' ? 'Credit' : 'Debit'} ₹${Number(t.amount).toLocaleString('en-IN')} — ${t.reason}`
      detailed.push({ name: p.name, transaction: label, running_total: round2(running) })
    }
  }

  return { summary, detailed }
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildWalletExportWorkbook(summary: WalletSummaryRow[], detailed: WalletDetailRow[]): string {
  const summaryRows = summary
    .map(r => `<tr><td>${escapeHtml(r.name)}</td><td>${r.wallet_balance}</td></tr>`)
    .join('')

  const detailedRows = detailed
    .map(r => `<tr><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.transaction)}</td><td>${r.running_total}</td></tr>`)
    .join('')

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="UTF-8">
<!--[if gte mso 9]><xml>
<x:ExcelWorkbook><x:ExcelWorksheets>
<x:ExcelWorksheet><x:Name>Summary</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet>
<x:ExcelWorksheet><x:Name>Detailed</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet>
</x:ExcelWorksheets></x:ExcelWorkbook>
</xml><![endif]-->
<style>
table { border-collapse: collapse; font-family: Calibri, Arial, sans-serif; font-size: 12px; margin-bottom: 24px; }
th, td { border: 1px solid #B0AFAF; padding: 4px 10px; }
th { background: #1A1208; color: #D97706; font-weight: bold; text-align: left; }
</style>
</head>
<body>
<table>
<tr><th>Player Name</th><th>Wallet Balance</th></tr>
${summaryRows}
</table>
<table>
<tr><th>Player Name</th><th>Transaction</th><th>Running Total</th></tr>
${detailedRows}
</table>
</body>
</html>`
}
