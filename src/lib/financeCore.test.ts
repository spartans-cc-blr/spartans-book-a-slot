import { describe, it, expect } from 'vitest'
import { buildBalanceSheet, financeColumns, istYear, formatRupees } from './financeCore'

// Opening figures as read from the club spreadsheet on 10 Nov 2026.
const opening = {
  till_2024: {
    cash_reserves: 6065, match_fee_advance: 8750, accrued_cash_wallet: 1263085, pending_dues: 780,
    membership_fee: 91300, match_fees_paid: 1203133.095, match_fee_advances_paid: 52000,
    match_fee_adjustments: -13196.11111, irrecoverable_match_fees: 2400, rewards_recognition: 30420,
    health_fitness: 9479, team_kit: 4500,
  },
  '2025': {
    match_fee_advance: -5326.111111, accrued_cash_wallet: 971109, membership_fee: 49000,
    match_fees_paid: 980373.7778, match_fee_adjustments: -38803.88889, rewards_recognition: 56940,
    health_fitness: 6089, team_kit: 4320,
  },
  '2026': {
    accrued_cash_wallet: 757646, membership_fee: 44500, match_fees_paid: 805165,
    rewards_recognition: 30000, health_fitness: 690,
  },
}

describe('buildBalanceSheet', () => {
  it('reproduces the spreadsheet before the cut-over', () => {
    const s = buildBalanceSheet({
      opening, live: {}, walletPositive: 47892, walletDues: 46537, currentYear: 2026,
      bank: { amount: 53399, as_of: '2026-11-10', note: null },
    })
    expect(s.columns.map(c => c.key)).toEqual(['till_2024', '2025', '2026'])
    expect(Math.round(s.totalIncome[0])).toBe(1369980)
    expect(Math.round(s.totalIncome[1])).toBe(1014783)
    expect(Math.round(s.totalIncome[2])).toBe(848683)      // includes live dues
    expect(Math.round(s.totalExpenses[0])).toBe(1288736)
    expect(Math.round(s.totalExpenses[1])).toBe(1008919)
    expect(Math.round(s.totalExpenses[2])).toBe(835855)
    expect(Math.round(s.totalBalanceExcludingDues)).toBe(53399)
    expect(Math.round(s.totalBalanceIncludingDues)).toBe(53399 + 46537)
    expect(s.playersCashWallet).toBe(47892)
    expect(Math.round(s.clubFund)).toBe(5507)
    expect(Math.abs(s.bankDifference!)).toBeLessThan(1)
  })

  it('adds a column per year from the cut-over and puts live dues in the latest one', () => {
    const s = buildBalanceSheet({
      opening,
      live: { '2027': { accrued_cash_wallet: 10000, membership_fee: 500, match_fees_paid: 8000, team_kit: 300 } },
      walletPositive: 0, walletDues: 1200, currentYear: 2027, bank: null,
    })
    expect(s.columns.map(c => c.key)).toEqual(['till_2024', '2025', '2026', '2027'])
    const dues = s.income.find(r => r.key === 'pending_dues')!
    expect(dues.values).toEqual([780, 0, 0, 1200])
    expect(s.totalIncome[3]).toBe(10000 + 500 + 1200)
    expect(s.totalExpenses[3]).toBe(8300)
    expect(s.bankDifference).toBeNull()
  })

  it('takes advances out of the wallet-after-advances line', () => {
    const s = buildBalanceSheet({
      opening: {}, live: { '2027': { match_fee_advances_paid: 5000, match_fee_adjustments: -1000 } },
      walletPositive: 20000, walletDues: 0, currentYear: 2027, bank: null,
    })
    expect(s.walletAfterAdvances).toBe(16000)
  })
})

describe('helpers', () => {
  it('financeColumns has only the opening periods before 2027', () => {
    expect(financeColumns(2026)).toHaveLength(3)
    expect(financeColumns(2028).map(c => c.label).slice(-2)).toEqual(['CY 2027', 'CY 2028'])
  })
  it('istYear reads the IST year of a timestamp', () => {
    expect(istYear('2026-12-31T19:00:00Z')).toBe(2027)   // 00:30 IST on 1 Jan
    expect(istYear('2026-12-31T18:00:00Z')).toBe(2026)
    expect(istYear('2027-03-05')).toBe(2027)
  })
  it('formatRupees rounds and signs', () => {
    expect(formatRupees(53399.016)).toBe('₹53,399')
    expect(formatRupees(-5326.11)).toBe('-₹5,326')
  })
})
