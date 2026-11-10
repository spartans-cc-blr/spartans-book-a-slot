'use client'
// Admin-only controls under the balance sheet on /admin/finance: bank
// balance, manual entries and opening figures. Every route re-checks isAdmin;
// this component only renders for the admin page. See
// features/finance-balance-sheet.md.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  FINANCE_LINES, MANUAL_ENTRY_LINE_KEYS, OPENING_PERIODS, FINANCE_CUTOVER_DATE,
  formatRupees, lineLabel, type BalanceSheet,
} from '@/lib/financeCore'

type Entry = {
  id: string; entry_date: string; line_key: string; amount: number
  particulars: string; remarks: string | null; created_by_email: string
}
type Bank = { id: string; as_of: string; amount: number; note: string | null; recorded_by_email: string }

const card = 'bg-white dark:bg-ink-3 border border-[#D4C9B0] dark:border-ink-5 rounded p-4'
const heading = 'font-cinzel text-sm text-amber-700 dark:text-gold font-semibold mb-3'
const muted = 'font-rajdhani text-xs text-[#78716C] dark:text-zinc-500'
const btn = 'font-rajdhani text-xs font-bold tracking-wide uppercase border border-amber-600 dark:border-gold-dim text-amber-700 dark:text-gold hover:bg-amber-50 dark:hover:bg-gold/10 disabled:opacity-40 px-4 py-2 rounded transition-colors'

async function send(url: string, method: string, body: unknown): Promise<string | null> {
  try {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (res.ok) return null
    const d = await res.json().catch(() => ({}))
    return d.error ?? `Request failed (${res.status})`
  } catch {
    return 'Network error. Please try again.'
  }
}

export function FinanceAdminClient({ sheet, entries, bankHistory, today, entriesOpen }: {
  sheet: BalanceSheet
  entries: Entry[]
  bankHistory: Bank[]
  today: string
  entriesOpen: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<{ where: string; message: string } | null>(null)

  // Bank balance
  const [bankDate, setBankDate] = useState(today)
  const [bankAmount, setBankAmount] = useState('')
  const [bankNote, setBankNote] = useState('')

  // Manual entry
  const [entryDate, setEntryDate] = useState(today)
  const [entryLine, setEntryLine] = useState('rewards_recognition')
  const [entryAmount, setEntryAmount] = useState('')
  const [entryParticulars, setEntryParticulars] = useState('')
  const [entryRemarks, setEntryRemarks] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [deleteReason, setDeleteReason] = useState('')

  // Opening figures
  const [openPeriod, setOpenPeriod] = useState<string>('2026')
  const [openLine, setOpenLine] = useState('accrued_cash_wallet')
  const [openAmount, setOpenAmount] = useState('')

  async function run(where: string, url: string, method: string, body: unknown, after?: () => void) {
    setBusy(where); setError(null)
    const message = await send(url, method, body)
    setBusy(null)
    if (message) { setError({ where, message }); return }
    after?.()
    router.refresh()
  }

  const errorFor = (where: string) => error?.where === where
    ? <p className="font-rajdhani text-xs text-red-700 dark:text-red-400 mt-2">{error.message}</p>
    : null

  const currentOpening = (() => {
    const row = [...sheet.income, ...sheet.expenses].find(r => r.key === openLine)
    const idx = sheet.columns.findIndex(c => c.key === openPeriod)
    if (!row || idx < 0) return 0
    // The latest column of Pending Dues also carries today's live dues.
    return row.values[idx] - (openLine === 'pending_dues' && idx === sheet.columns.length - 1 ? sheet.walletDues : 0)
  })()

  return (
    <div className="mt-10 space-y-8 max-w-3xl">
      {/* ── Bank balance ── */}
      <section>
        <h2 className={heading}>Bank Balance</h2>
        <div className={card}>
          <p className={`${muted} mb-3`}>
            Enter the club&apos;s own balance (after taking out any personal money held in the same account).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block">
              <span className="form-label">As of</span>
              <input type="date" max={today} value={bankDate} onChange={e => setBankDate(e.target.value)} className="form-input" />
            </label>
            <label className="block">
              <span className="form-label">Balance (₹)</span>
              <input type="number" inputMode="decimal" value={bankAmount} onChange={e => setBankAmount(e.target.value)} className="form-input" />
            </label>
            <label className="block">
              <span className="form-label">Note (optional)</span>
              <input value={bankNote} onChange={e => setBankNote(e.target.value)} maxLength={300} className="form-input" />
            </label>
          </div>
          <button className={`${btn} mt-3`} disabled={busy !== null || bankAmount === '' || !bankDate}
            onClick={() => run('bank', '/api/admin/finance/bank-balance', 'POST',
              { as_of: bankDate, amount: Number(bankAmount), note: bankNote || undefined },
              () => { setBankAmount(''); setBankNote('') })}>
            {busy === 'bank' ? 'Saving...' : 'Save bank balance'}
          </button>
          {errorFor('bank')}
          {bankHistory.length > 0 && (
            <ul className="mt-4 divide-y divide-[#E2DACE] dark:divide-ink-4">
              {bankHistory.slice(0, 8).map(b => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-1.5 font-rajdhani text-sm">
                  <span className="text-[#44403C] dark:text-zinc-300">{b.as_of}{b.note ? ` · ${b.note}` : ''}</span>
                  <span className="tabular-nums text-[#1C1917] dark:text-parchment">{formatRupees(Number(b.amount))}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ── Manual entries ── */}
      <section>
        <h2 className={heading}>Entries</h2>
        <div className={card}>
          {!entriesOpen ? (
            <p className={muted}>
              Entries open on {FINANCE_CUTOVER_DATE}. Until then, expenses and payments stay in the club spreadsheet
              and reach this page through the CY 2026 opening figures below.
            </p>
          ) : (
            <>
              <p className={`${muted} mb-3`}>
                Club expenses, advances and write-offs. Match fees paid to organisers are added automatically when
                you apply a match fee, so only add one here for a match whose fee was not applied in the Hub. Use a
                negative amount to reverse.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="form-label">Date</span>
                  <input type="date" min={FINANCE_CUTOVER_DATE} max={today} value={entryDate}
                    onChange={e => setEntryDate(e.target.value)} className="form-input" />
                </label>
                <label className="block">
                  <span className="form-label">Line</span>
                  <select value={entryLine} onChange={e => setEntryLine(e.target.value)} className="form-input">
                    {FINANCE_LINES.filter(l => MANUAL_ENTRY_LINE_KEYS.includes(l.key)).map(l => (
                      <option key={l.key} value={l.key}>
                        {l.side === 'income' ? 'Receivable' : 'Expense'}: {l.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="form-label">Amount (₹)</span>
                  <input type="number" inputMode="decimal" value={entryAmount}
                    onChange={e => setEntryAmount(e.target.value)} className="form-input" />
                </label>
                <label className="block">
                  <span className="form-label">Particulars</span>
                  <input value={entryParticulars} onChange={e => setEntryParticulars(e.target.value)}
                    maxLength={200} placeholder="e.g. Trophies for 9th AGM" className="form-input" />
                </label>
                <label className="block sm:col-span-2">
                  <span className="form-label">Remarks (optional)</span>
                  <input value={entryRemarks} onChange={e => setEntryRemarks(e.target.value)}
                    maxLength={300} placeholder="Paid to / paid by" className="form-input" />
                </label>
              </div>
              <button className={`${btn} mt-3`}
                disabled={busy !== null || !entryAmount || Number(entryAmount) === 0 || entryParticulars.trim().length < 3}
                onClick={() => run('entry', '/api/admin/finance/entries', 'POST', {
                  entry_date: entryDate, line_key: entryLine, amount: Number(entryAmount),
                  particulars: entryParticulars.trim(), remarks: entryRemarks.trim() || undefined,
                }, () => { setEntryAmount(''); setEntryParticulars(''); setEntryRemarks('') })}>
                {busy === 'entry' ? 'Saving...' : 'Add entry'}
              </button>
              {errorFor('entry')}
            </>
          )}

          {entries.length > 0 && (
            <ul className="mt-4 divide-y divide-[#E2DACE] dark:divide-ink-4">
              {entries.map(e => (
                <li key={e.id} className="py-2">
                  <div className="flex items-start justify-between gap-3 font-rajdhani text-sm">
                    <div className="min-w-0">
                      <p className="text-[#1C1917] dark:text-parchment">{e.particulars}</p>
                      <p className={muted}>
                        {e.entry_date} · {lineLabel(e.line_key)}{e.remarks ? ` · ${e.remarks}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="tabular-nums text-[#1C1917] dark:text-parchment">{formatRupees(Number(e.amount))}</span>
                      <button className="font-rajdhani text-xs text-red-700 dark:text-red-400 hover:underline"
                        onClick={() => { setDeleting(deleting === e.id ? null : e.id); setDeleteReason('') }}>
                        {deleting === e.id ? 'Cancel' : 'Delete'}
                      </button>
                    </div>
                  </div>
                  {deleting === e.id && (
                    <div className="mt-2 flex flex-col sm:flex-row gap-2">
                      <input value={deleteReason} onChange={ev => setDeleteReason(ev.target.value)}
                        placeholder="Reason for deleting" maxLength={300} className="form-input flex-1" />
                      <button className={btn} disabled={busy !== null || deleteReason.trim().length < 3}
                        onClick={() => run(`del-${e.id}`, '/api/admin/finance/entries', 'DELETE',
                          { id: e.id, delete_reason: deleteReason.trim() }, () => setDeleting(null))}>
                        {busy === `del-${e.id}` ? 'Deleting...' : 'Delete entry'}
                      </button>
                    </div>
                  )}
                  {errorFor(`del-${e.id}`)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ── Opening figures ── */}
      <section>
        <h2 className={heading}>Opening Figures</h2>
        <div className={card}>
          <p className={`${muted} mb-3`}>
            Figures carried over from the club spreadsheet. Till 2024 and CY 2025 are final. Update CY 2026 from the
            spreadsheet until the year closes. Pending dues for the latest year is read live from player wallets, so
            leave its opening figure at 0.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block">
              <span className="form-label">Period</span>
              <select value={openPeriod} onChange={e => setOpenPeriod(e.target.value)} className="form-input">
                {OPENING_PERIODS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="form-label">Line</span>
              <select value={openLine} onChange={e => setOpenLine(e.target.value)} className="form-input">
                {FINANCE_LINES.map(l => <option key={l.key} value={l.key}>{l.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="form-label">New amount (₹)</span>
              <input type="number" inputMode="decimal" value={openAmount}
                onChange={e => setOpenAmount(e.target.value)} placeholder={String(Math.round(currentOpening))}
                className="form-input" />
            </label>
          </div>
          <p className={`${muted} mt-2`}>Current: {formatRupees(currentOpening)}</p>
          <button className={`${btn} mt-3`} disabled={busy !== null || openAmount === ''}
            onClick={() => run('opening', '/api/admin/finance/opening', 'PUT',
              { period: openPeriod, line_key: openLine, amount: Number(openAmount) },
              () => setOpenAmount(''))}>
            {busy === 'opening' ? 'Saving...' : 'Save opening figure'}
          </button>
          {errorFor('opening')}
        </div>
      </section>
    </div>
  )
}
