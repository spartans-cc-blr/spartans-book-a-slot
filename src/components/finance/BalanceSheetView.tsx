'use client'
// The club balance sheet: Receivables, Expenses and the closing block, laid
// out like the legacy Google Sheet. Summary figures only, so it is safe for
// the GC page as well as the admin one. See features/finance-balance-sheet.md.

import { useState } from 'react'
import { formatRupees, type BalanceSheet, type BalanceSheetRow } from '@/lib/financeCore'

const SOURCE_NOTE: Record<BalanceSheetRow['source'], string> = {
  derived: 'From Hub data',
  live: 'Live from player wallets',
  manual: 'Entered by admin',
}

function Section({ title, tone, rows, totals, totalLabel, sheet }: {
  title: string
  tone: 'income' | 'expense'
  rows: BalanceSheetRow[]
  totals: number[]
  totalLabel: string
  sheet: BalanceSheet
}) {
  const rule = tone === 'income'
    ? 'border-emerald-700 dark:border-emerald-600'
    : 'border-red-700 dark:border-red-500'
  return (
    <section className="mb-8">
      <h2 className="font-cinzel text-lg font-bold text-[#1C1917] dark:text-parchment mb-2">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] font-rajdhani text-sm">
          <thead>
            <tr className={`border-y-2 ${rule}`}>
              <th className="text-left py-2 pr-3 font-bold text-[#1C1917] dark:text-parchment">Particulars</th>
              {sheet.columns.map(c => (
                <th key={c.key} className="text-right py-2 pl-3 font-bold text-[#1C1917] dark:text-parchment whitespace-nowrap">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.key} className="border-b border-[#E2DACE] dark:border-ink-4">
                <td className="py-1.5 pr-3 text-[#44403C] dark:text-zinc-300" title={SOURCE_NOTE[r.source]}>{r.label}</td>
                {r.values.map((v, i) => (
                  <td key={sheet.columns[i].key}
                    className={`py-1.5 pl-3 text-right tabular-nums whitespace-nowrap ${v < 0 ? 'text-red-700 dark:text-red-400' : 'text-[#1C1917] dark:text-parchment'}`}>
                    {formatRupees(v)}
                  </td>
                ))}
              </tr>
            ))}
            <tr className={`border-b-2 ${rule}`}>
              <td className="py-2 pr-3 font-bold text-[#1C1917] dark:text-parchment">{totalLabel}</td>
              {totals.map((v, i) => (
                <td key={sheet.columns[i].key} className="py-2 pl-3 text-right font-bold tabular-nums whitespace-nowrap text-[#1C1917] dark:text-parchment">
                  {formatRupees(v)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ClosingRow({ label, value, strong, hint }: { label: string; value: string; strong?: boolean; hint?: string }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-1.5 ${strong ? 'border-y-2 border-sky-600 dark:border-sky-500 my-1' : ''}`}>
      <span className={`font-rajdhani ${strong ? 'font-cinzel text-lg font-bold text-[#1C1917] dark:text-parchment' : 'text-sm text-[#44403C] dark:text-zinc-300'}`}>
        {label}
        {hint && <span className="block font-rajdhani text-xs font-normal text-[#78716C] dark:text-zinc-500">{hint}</span>}
      </span>
      <span className={`font-rajdhani tabular-nums whitespace-nowrap ${strong ? 'text-lg font-bold' : 'text-sm'} text-[#1C1917] dark:text-parchment`}>
        {value}
      </span>
    </div>
  )
}

export function BalanceSheetView({ sheet }: { sheet: BalanceSheet }) {
  const [excludeDues, setExcludeDues] = useState(true)
  const total = excludeDues ? sheet.totalBalanceExcludingDues : sheet.totalBalanceIncludingDues

  return (
    <div>
      <Section title="Receivables" tone="income" rows={sheet.income} totals={sheet.totalIncome} totalLabel="Total Income" sheet={sheet} />
      <Section title="Expenses" tone="expense" rows={sheet.expenses} totals={sheet.totalExpenses} totalLabel="Total Expenses" sheet={sheet} />

      <section className="max-w-xl">
        <div className="flex items-center justify-between gap-4 py-1.5">
          <span className="font-rajdhani text-sm text-[#44403C] dark:text-zinc-300">
            Dues to be collected ({formatRupees(sheet.walletDues)})
          </span>
          <select
            aria-label="Dues to be collected"
            value={excludeDues ? 'exclude' : 'include'}
            onChange={e => setExcludeDues(e.target.value === 'exclude')}
            className="font-rajdhani text-sm bg-white dark:bg-ink-3 border border-[#D4C9B0] dark:border-ink-5 rounded px-2 py-1 text-[#1C1917] dark:text-parchment">
            <option value="exclude">Exclude</option>
            <option value="include">Include</option>
          </select>
        </div>
        <ClosingRow strong label="Total Balance" value={formatRupees(total)} />
        <ClosingRow label="Players' Cash Wallet" value={formatRupees(sheet.playersCashWallet)}
          hint="Sum of positive player balances" />
        <ClosingRow label="Wallet Balance After Match Fee Advances" value={formatRupees(sheet.walletAfterAdvances)} />
        <ClosingRow label="Balance Fund from Membership Fee" value={formatRupees(sheet.clubFund)}
          hint="Total balance without dues, less the players' cash wallet" />
        <ClosingRow label="Net Balance in Bank"
          value={sheet.bank ? formatRupees(sheet.bank.amount) : 'Not entered'}
          hint={sheet.bank ? `As of ${sheet.bank.as_of}` : undefined} />
        {sheet.bankDifference !== null && (
          <ClosingRow label="Bank minus total balance"
            value={formatRupees(sheet.bankDifference)}
            hint={Math.abs(sheet.bankDifference) < 1 ? 'Reconciled' : 'Bank and books differ'} />
        )}
      </section>
    </div>
  )
}
