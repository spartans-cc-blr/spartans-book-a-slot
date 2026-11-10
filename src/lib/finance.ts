// Server-only fetch for the club balance sheet. Pure maths and line
// definitions are in financeCore.ts (client-safe). See
// features/finance-balance-sheet.md.

import { createServiceClient } from '@/lib/supabase'
import { istToday } from '@/lib/matchCompletion'
import {
  buildBalanceSheet, istYear, FINANCE_CUTOVER_DATE, FINANCE_CUTOVER_YEAR,
  type BalanceSheet,
} from '@/lib/financeCore'

export * from '@/lib/financeCore'

type Db = ReturnType<typeof createServiceClient>

// PostgREST caps an unpaginated response at 1000 rows, so every multi-row
// read here pages explicitly.
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  const PAGE = 1000
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  return out
}

export interface FinanceEntryRow {
  id: string
  entry_date: string
  line_key: string
  amount: number
  particulars: string
  remarks: string | null
  created_by_email: string
  created_at: string
}

export interface BankBalanceRow {
  id: string
  as_of: string
  amount: number
  note: string | null
  recorded_by_email: string
  created_at: string
}

// Start of the cut-over day in IST, as a UTC instant.
const CUTOVER_INSTANT = `${FINANCE_CUTOVER_DATE}T00:00:00+05:30`

function add(target: Record<string, Record<string, number>>, year: number, line: string, amount: number) {
  if (year < FINANCE_CUTOVER_YEAR) return
  const y = String(year)
  target[y] ??= {}
  target[y][line] = (target[y][line] ?? 0) + amount
}

async function loadBalanceSheet(db: Db): Promise<{ sheet: BalanceSheet; entries: FinanceEntryRow[]; bankHistory: BankBalanceRow[] }> {
  const [openingRows, entries, bankHistory, players, walletTx, membershipLinks, organiserPayments] = await Promise.all([
    fetchAll<{ period: string; line_key: string; amount: number }>((f, t) =>
      db.from('finance_opening_figures').select('period, line_key, amount').order('period').order('line_key').range(f, t)),
    fetchAll<FinanceEntryRow>((f, t) =>
      db.from('finance_entries')
        .select('id, entry_date, line_key, amount, particulars, remarks, created_by_email, created_at')
        .is('deleted_at', null)
        .order('entry_date', { ascending: false }).order('id').range(f, t)),
    fetchAll<BankBalanceRow>((f, t) =>
      db.from('finance_bank_balances')
        .select('id, as_of, amount, note, recorded_by_email, created_at')
        .order('as_of', { ascending: false }).order('created_at', { ascending: false }).range(f, t)),
    fetchAll<{ wallet_balance: number | null }>((f, t) =>
      db.from('players').select('wallet_balance').order('id').range(f, t)),
    // Wallet movements that are not match fees (booking_id is only ever set on
    // match-fee rows): top-ups, refunds, admin debits, membership fee debits.
    fetchAll<{ id: string; type: string; amount: number; created_at: string }>((f, t) =>
      db.from('wallet_transactions')
        .select('id, type, amount, created_at')
        .is('deleted_at', null).is('booking_id', null)
        .gte('created_at', CUTOVER_INSTANT)
        .order('created_at').order('id').range(f, t)),
    fetchAll<{ wallet_transaction_id: string | null }>((f, t) =>
      db.from('membership_fee_charges')
        .select('wallet_transaction_id')
        .not('wallet_transaction_id', 'is', null)
        .order('id').range(f, t)),
    fetchAll<{ amount: number; match_date: string }>((f, t) =>
      db.from('organiser_payments')
        .select('amount, match_date')
        .gte('match_date', FINANCE_CUTOVER_DATE)
        .order('match_date').order('booking_id').range(f, t)),
  ])

  const opening: Record<string, Record<string, number>> = {}
  for (const r of openingRows) {
    opening[r.period] ??= {}
    opening[r.period][r.line_key] = Number(r.amount)
  }

  const live: Record<string, Record<string, number>> = {}

  // The membership fee is debited from the wallet, so it is a transfer from
  // wallet money to club money: it lowers Accrued Cash Wallet and raises
  // Membership Fee by the same amount. The two lines together are the cash
  // players actually paid in.
  const membershipTxIds = new Set(membershipLinks.map(l => l.wallet_transaction_id))
  for (const tx of walletTx) {
    const year = istYear(tx.created_at)
    const amount = Number(tx.amount)
    add(live, year, 'accrued_cash_wallet', tx.type === 'credit' ? amount : -amount)
    if (tx.type === 'debit' && membershipTxIds.has(tx.id)) add(live, year, 'membership_fee', amount)
  }

  for (const p of organiserPayments) add(live, istYear(p.match_date), 'match_fees_paid', Number(p.amount))
  for (const e of entries) add(live, istYear(e.entry_date), e.line_key, Number(e.amount))

  let walletPositive = 0
  let walletDues = 0
  for (const p of players) {
    const b = Number(p.wallet_balance ?? 0)
    if (b > 0) walletPositive += b
    else if (b < 0) walletDues += -b
  }

  const latestBank = bankHistory[0]
  const sheet = buildBalanceSheet({
    opening,
    live,
    walletPositive,
    walletDues,
    currentYear: Number(istToday().slice(0, 4)),
    bank: latestBank ? { amount: Number(latestBank.amount), as_of: latestBank.as_of, note: latestBank.note } : null,
  })

  return { sheet, entries, bankHistory }
}

// Summary only: what the GC page is allowed to see.
export async function getBalanceSheet(): Promise<BalanceSheet> {
  return (await loadBalanceSheet(createServiceClient())).sheet
}

// Summary plus the manual entries and bank history behind it (admin only).
export async function getFinanceAdminData() {
  return loadBalanceSheet(createServiceClient())
}

// Records (or revises) what was paid to the organiser for a match. Called
// when match fees are applied or corrected. Best-effort: a failure is logged
// and never fails the fee application it is attached to.
export async function recordOrganiserPayment(db: Db, bookingId: string, amount: number, recordedByEmail: string | null) {
  try {
    const { data: booking } = await db.from('bookings').select('game_date').eq('id', bookingId).maybeSingle()
    if (!booking?.game_date) return
    const { error } = await db.from('organiser_payments').upsert({
      booking_id: bookingId,
      amount,
      match_date: booking.game_date,
      recorded_by_email: recordedByEmail,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'booking_id' })
    if (error) console.error('[finance] organiser payment not recorded:', bookingId, error.message)
  } catch (err) {
    console.error('[finance] organiser payment not recorded:', bookingId, err)
  }
}
