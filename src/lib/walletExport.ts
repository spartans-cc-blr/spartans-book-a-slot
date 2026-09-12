// Admin wallet Excel export — src/app/api/admin/wallet/export/route.ts is the
// only caller. See features/wallet-ledger.md §16.
//
// Produces a real, single downloadable .xlsx workbook with two named sheets:
//   - "Summary"  — a small dashboard header (title, generated date, KPI
//     tiles) followed by one row per player: name + current wallet balance.
//   - "Detailed" — one row per transaction, grouped by player, in
//     chronological (oldest-first) order, with a running total that starts
//     from that player's own opening balance (the same "Brought Forward"
//     figure the /wallet statement page computes — see §5 of the feature
//     doc) so the numbers tie out to a real ledger, not just a bare list.
//
// Built via `write-excel-file` — a genuine OOXML (.xlsx) writer, not a raw
// HTML/SpreadsheetML "trick" (see this file's git history for the first cut,
// which used that trick and turned out unreliable in real Excel — the
// "Detailed" sheet routinely came back empty). `write-excel-file` has
// exactly one dependency (`fflate`, itself dependency-free) and adds zero
// new vulnerabilities to this repo's `npm audit` output — confirmed before
// adopting it — so it's a safe fit for this app's otherwise minimal runtime
// dependency footprint (see limitations.md's cold-start audit).

import writeExcelFile from 'write-excel-file/node'
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
      .is('deleted_at', null)
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

// ── Workbook styling tokens — mirrors ui-theme.md's palette so the export
// reads as part of the same app, not a generic spreadsheet dump. ──────────
const HEADER_BG = '#1A1208'   // --color-nav-bg
const HEADER_TEXT = '#D97706' // --color-gold
const TITLE_TEXT = '#1C1917'  // --color-text
const MUTED_TEXT = '#78716C'  // --color-text-muted
const POSITIVE = '#059669'    // --color-success
const NEGATIVE = '#DC2626'    // --color-crimson
const BAND_BG = '#F8F4EE'     // --color-bg
const BORDER = '#D4C9B0'      // --color-border
const MONEY_FORMAT = '"₹"#,##0.00;-"₹"#,##0.00'

function titleRow(text: string, columns: number) {
  return [
    { value: text, fontWeight: 'bold', fontSize: 14, textColor: TITLE_TEXT, columnSpan: columns },
    ...Array(columns - 1).fill(null),
  ]
}

function subtitleRow(text: string, columns: number) {
  return [
    { value: text, fontStyle: 'italic', fontSize: 10, textColor: MUTED_TEXT, columnSpan: columns },
    ...Array(columns - 1).fill(null),
  ]
}

function blankRow(columns: number) {
  return Array(columns).fill(null)
}

function headerCell(text: string) {
  return {
    value: text,
    fontWeight: 'bold',
    textColor: HEADER_TEXT,
    backgroundColor: HEADER_BG,
    borderColor: BORDER,
    borderStyle: 'thin' as const,
  }
}

function labelCell(text: string) {
  return { value: text, fontWeight: 'bold', textColor: MUTED_TEXT }
}

function textCell(text: string, band: boolean, extra: Record<string, unknown> = {}) {
  return {
    value: text,
    borderColor: BORDER,
    borderStyle: 'thin' as const,
    ...(band ? { backgroundColor: BAND_BG } : {}),
    ...extra,
  }
}

function moneyCell(amount: number, band: boolean, extra: Record<string, unknown> = {}) {
  return {
    value: amount,
    type: Number,
    format: MONEY_FORMAT,
    align: 'right' as const,
    textColor: amount < 0 ? NEGATIVE : POSITIVE,
    borderColor: BORDER,
    borderStyle: 'thin' as const,
    ...(band ? { backgroundColor: BAND_BG } : {}),
    ...extra,
  }
}

export async function buildWalletExportWorkbook(
  summary: WalletSummaryRow[],
  detailed: WalletDetailRow[]
): Promise<Buffer> {
  const generatedAt = new Date().toLocaleString('en-IN', {
    dateStyle: 'medium', timeStyle: 'short',
  })

  // ── Summary sheet — dashboard header + KPI tiles + player table ────────
  const totalPlayers = summary.length
  const totalBalance = round2(summary.reduce((sum, p) => sum + p.wallet_balance, 0))
  const overdueCount = summary.filter(p => p.wallet_balance < 0).length

  const summaryData = [
    titleRow('Spartans Hub — Wallet Report', 2),
    subtitleRow(`Generated ${generatedAt}`, 2),
    blankRow(2),
    [labelCell('Total Players'), { value: totalPlayers, type: Number }],
    [labelCell('Total Balance'), moneyCell(totalBalance, false)],
    [labelCell('Players Overdue'), { value: overdueCount, type: Number, textColor: overdueCount > 0 ? NEGATIVE : POSITIVE, fontWeight: 'bold' }],
    blankRow(2),
    [headerCell('Player Name'), headerCell('Wallet Balance')],
    ...summary.map(p => [textCell(p.name, false), moneyCell(p.wallet_balance, false)]),
  ]

  // ── Detailed sheet — one banded block per player ────────────────────────
  let band = false
  let lastName: string | null = null
  const detailedRows = detailed.map(r => {
    if (r.name !== lastName) { band = !band; lastName = r.name }
    const isBroughtForward = r.transaction === 'Brought Forward'
    return [
      textCell(r.name, band, isBroughtForward ? { fontWeight: 'bold' } : {}),
      textCell(r.transaction, band, isBroughtForward ? { fontStyle: 'italic' } : {}),
      moneyCell(r.running_total, band, isBroughtForward ? { fontWeight: 'bold' } : {}),
    ]
  })

  const detailedData = [
    titleRow('Spartans Hub — Wallet Ledger (Detailed)', 3),
    subtitleRow(`Generated ${generatedAt}`, 3),
    blankRow(3),
    [headerCell('Player Name'), headerCell('Transaction'), headerCell('Running Total')],
    ...detailedRows,
  ]

  const buffer = await writeExcelFile([
    {
      sheet: 'Summary',
      data: summaryData,
      columns: [{ width: 26 }, { width: 20 }],
      stickyRowsCount: 8,
    },
    {
      sheet: 'Detailed',
      data: detailedData,
      columns: [{ width: 24 }, { width: 68 }, { width: 18 }],
      stickyRowsCount: 4,
    },
  ]).toBuffer()

  return buffer as Buffer
}
