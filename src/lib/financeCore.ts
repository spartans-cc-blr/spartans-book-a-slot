// Club balance sheet: line definitions and the pure maths. Client-safe (no
// server imports); the fetch lives in finance.ts. See
// features/finance-balance-sheet.md.

// Hub data counts from this date (IST). Everything earlier is an opening
// figure carried over from the legacy Google Sheet.
export const FINANCE_CUTOVER_DATE = '2027-01-01'
export const FINANCE_CUTOVER_YEAR = 2027

export const OPENING_PERIODS = [
  { key: 'till_2024', label: 'Till 2024' },
  { key: '2025', label: 'CY 2025' },
  { key: '2026', label: 'CY 2026' },
] as const
export type OpeningPeriod = typeof OPENING_PERIODS[number]['key']
export const OPENING_PERIOD_KEYS = OPENING_PERIODS.map(p => p.key) as OpeningPeriod[]

export type FinanceSide = 'income' | 'expense'

export interface FinanceLine {
  key: string
  label: string
  side: FinanceSide
  // Where the figure comes from once Hub data counts (from the cut-over).
  source: 'manual' | 'derived' | 'live'
}

export const FINANCE_LINES: FinanceLine[] = [
  { key: 'cash_reserves',               label: 'Cash Reserves',                 side: 'income',  source: 'manual' },
  { key: 'match_fee_advance',           label: 'Match fees Advance',            side: 'income',  source: 'manual' },
  { key: 'accrued_cash_wallet',         label: 'Total Accrued Cash Wallet',     side: 'income',  source: 'derived' },
  { key: 'pending_dues',                label: 'Pending Dues in Cash Wallet',   side: 'income',  source: 'live' },
  { key: 'membership_fee',              label: 'Membership Fee',                side: 'income',  source: 'derived' },
  { key: 'scheduled_match_fees_unpaid', label: 'Scheduled Match Fees - UnPaid', side: 'expense', source: 'manual' },
  { key: 'match_fees_paid',             label: 'Match Fees Paid',               side: 'expense', source: 'derived' },
  { key: 'match_fee_advances_paid',     label: 'Match Fees Advances Paid',      side: 'expense', source: 'manual' },
  { key: 'match_fee_adjustments',       label: 'Match Fees Adjustments',        side: 'expense', source: 'manual' },
  { key: 'irrecoverable_match_fees',    label: 'Irrecoverable Match Fees',      side: 'expense', source: 'manual' },
  { key: 'rewards_recognition',         label: 'Rewards & Recognition',         side: 'expense', source: 'manual' },
  { key: 'health_fitness',              label: 'Health & Fitness',              side: 'expense', source: 'manual' },
  { key: 'team_kit',                    label: 'Team Kit',                      side: 'expense', source: 'manual' },
]

export const FINANCE_LINE_KEYS = FINANCE_LINES.map(l => l.key)

// Lines an admin can post a manual entry to. Pending dues is always read
// live from player wallets, so it never takes an entry.
export const MANUAL_ENTRY_LINE_KEYS = FINANCE_LINES.filter(l => l.source !== 'live').map(l => l.key)

// Lines that reduce what is left of the players' wallet money (advances the
// club has parked with organisers), as on the legacy sheet.
const ADVANCE_LINE_KEYS = ['scheduled_match_fees_unpaid', 'match_fee_advances_paid', 'match_fee_adjustments']

export function lineLabel(key: string): string {
  return FINANCE_LINES.find(l => l.key === key)?.label ?? key
}

// IST calendar year of a timestamp or a YYYY-MM-DD date.
export function istYear(value: string): number {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return Number(value.slice(0, 4))
  const shifted = new Date(new Date(value).getTime() + 5.5 * 60 * 60 * 1000)
  return shifted.getUTCFullYear()
}

export interface FinanceColumn {
  key: string           // 'till_2024' | '2025' | ... | '2027' ...
  label: string
  opening: boolean      // true = fixed figures from the legacy sheet
}

export interface BalanceSheetInput {
  // opening[period][lineKey]
  opening: Record<string, Record<string, number>>
  // live[year][lineKey]: Hub-derived figures plus manual entries, 2027 onward
  live: Record<string, Record<string, number>>
  walletPositive: number   // sum of positive player balances
  walletDues: number       // sum of negative player balances, as a positive number
  currentYear: number      // IST
  bank: { amount: number; as_of: string; note: string | null } | null
}

export interface BalanceSheetRow {
  key: string
  label: string
  source: FinanceLine['source']
  values: number[]         // one per column
}

export interface BalanceSheet {
  columns: FinanceColumn[]
  income: BalanceSheetRow[]
  expenses: BalanceSheetRow[]
  totalIncome: number[]
  totalExpenses: number[]
  walletDues: number
  // Dues counted as money still to come in.
  totalBalanceIncludingDues: number
  // Dues left out: what the club should actually be holding.
  totalBalanceExcludingDues: number
  playersCashWallet: number
  walletAfterAdvances: number
  clubFund: number
  bank: BalanceSheetInput['bank']
  // bank minus totalBalanceExcludingDues; null when no bank balance entered.
  bankDifference: number | null
}

export function financeColumns(currentYear: number): FinanceColumn[] {
  const cols: FinanceColumn[] = OPENING_PERIODS.map(p => ({ key: p.key, label: p.label, opening: true }))
  for (let y = FINANCE_CUTOVER_YEAR; y <= currentYear; y++) {
    cols.push({ key: String(y), label: `CY ${y}`, opening: false })
  }
  return cols
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

export function buildBalanceSheet(input: BalanceSheetInput): BalanceSheet {
  const columns = financeColumns(input.currentYear)
  const lastIdx = columns.length - 1

  const rowFor = (line: FinanceLine): BalanceSheetRow => ({
    key: line.key,
    label: line.label,
    source: line.source,
    values: columns.map((col, idx) => {
      const base = col.opening
        ? input.opening[col.key]?.[line.key] ?? 0
        : input.live[col.key]?.[line.key] ?? 0
      // Pending dues is a position, not a yearly flow: today's figure sits in
      // the latest column only, as on the legacy sheet.
      const liveDues = line.key === 'pending_dues' && idx === lastIdx ? input.walletDues : 0
      return base + liveDues
    }),
  })

  const income = FINANCE_LINES.filter(l => l.side === 'income').map(rowFor)
  const expenses = FINANCE_LINES.filter(l => l.side === 'expense').map(rowFor)
  const totalIncome = columns.map((_, i) => sum(income.map(r => r.values[i])))
  const totalExpenses = columns.map((_, i) => sum(expenses.map(r => r.values[i])))

  const totalBalanceIncludingDues = sum(totalIncome) - sum(totalExpenses)
  const totalBalanceExcludingDues = totalBalanceIncludingDues - input.walletDues

  const advances = sum(expenses.filter(r => ADVANCE_LINE_KEYS.includes(r.key)).map(r => sum(r.values)))

  return {
    columns,
    income,
    expenses,
    totalIncome,
    totalExpenses,
    walletDues: input.walletDues,
    totalBalanceIncludingDues,
    totalBalanceExcludingDues,
    playersCashWallet: input.walletPositive,
    walletAfterAdvances: input.walletPositive - advances,
    clubFund: totalBalanceExcludingDues - input.walletPositive,
    bank: input.bank,
    bankDifference: input.bank ? input.bank.amount - totalBalanceExcludingDues : null,
  }
}

export function formatRupees(n: number): string {
  const rounded = Math.round(n)
  const abs = Math.abs(rounded).toLocaleString('en-IN')
  return rounded < 0 ? `-₹${abs}` : `₹${abs}`
}
