'use client'
// The club record book: every standing record, T20 and T30 side by side (collapsible
// on mobile), one season at a time. Shared by the player-facing /records page and the
// admin "Current records" tab. `admin` adds the alert-baseline details (entry counts,
// "not armed yet") and the WhatsApp share icon. See .claude/rules/features/record-breaking.md.

import { useState } from 'react'
import Link from 'next/link'
import { WA_ICON } from '@/components/tournament-planner/TournamentShareButton'

export type BookEntry = {
  message: string
  format: string; scopeKey: string; scopeLabel: string; year: string | null
  recordKey: string; title: string; holder: string; display: string
  bookingId: string; gameDate: string; opponentName: string; entries: number; armed: boolean
  setInYear: string | null; beat: { display: string; holder: string; year: string; bookingId: string; gameDate: string } | null
}

// "3 months" / "2 yrs 4 mo" since the record was set.
function age(d: string) {
  const days = Math.max(0, Math.floor((Date.now() - new Date(`${d}T00:00:00`).getTime()) / 86400000))
  if (days < 31) return days <= 1 ? 'today' : `${days} days`
  const months = Math.floor(days / 30.44)
  if (months < 12) return `${months} mo`
  const y = Math.floor(months / 12), m = months % 12
  return m ? `${y} yr${y > 1 ? 's' : ''} ${m} mo` : `${y} yr${y > 1 ? 's' : ''}`
}

function formatDate(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

export function RecordBookView({ records, loading = false, admin }: { records: BookEntry[] | null; loading?: boolean; admin: boolean }) {
  const [openFmt, setOpenFmt] = useState<Record<string, boolean>>({ T20: true, T30: false })  // mobile only
  const [bookScope, setBookScope] = useState<string>('alltime')
  const [onlyNew, setOnlyNew] = useState(false)

  const book = records
  const bookYears = Array.from(new Set((book ?? []).filter(b => b.year).map(b => b.year as string))).sort().reverse()
  const latestYear = (book ?? []).reduce((m, b) => (b.year && b.year > m ? b.year : m), '')
  const bookRows = (book ?? [])
    .filter(b => (b.year === null ? bookScope === 'alltime' : b.year === bookScope))
    .filter(b => !(onlyNew && b.year === null) || b.setInYear === latestYear)
  const pill = (active: boolean) =>
    `px-3 py-1.5 rounded-full font-rajdhani text-xs font-bold tracking-wide border ${
      active
        ? 'bg-amber-600 text-white border-amber-600 dark:bg-gold dark:text-ink dark:border-gold'
        : 'bg-white text-[#44403C] border-[#D4C9B0] dark:bg-ink-3 dark:text-zinc-400 dark:border-ink-5'
    }`

  return (
    <div className="mb-4">
      {admin && (
        <p className="font-rajdhani text-xs text-[#78716C] dark:text-zinc-500 mb-3">
          Every standing record — this is the baseline each new scorecard is checked against. A record only
          alerts once its scope has at least 5 earlier entries; ones with fewer show as &ldquo;not armed&rdquo;.
        </p>
      )}
      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => setBookScope('alltime')} className={pill(bookScope === 'alltime')}>All-time</button>
        {bookYears.map(y => (
          <button key={y} onClick={() => setBookScope(y)} className={pill(bookScope === y)}>{y}</button>
        ))}
      </div>
      {bookScope === 'alltime' && latestYear && (
        <label className="flex items-center gap-2 font-rajdhani text-xs text-[#44403C] dark:text-zinc-300 mb-4">
          <input type="checkbox" checked={onlyNew} onChange={e => setOnlyNew(e.target.checked)} />
          Only all-time records set in {latestYear}
        </label>
      )}
      {loading && <p className="font-rajdhani text-sm text-[#78716C] dark:text-zinc-500">Computing records…</p>}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {(['T20', 'T30'] as const).map(f => {
          const rows = bookRows.filter(b => b.format === f)
          return (
            <section key={f}>
              <button
                onClick={() => setOpenFmt(o => ({ ...o, [f]: !o[f] }))}
                className="w-full flex items-center justify-between mb-2 lg:cursor-default"
                aria-expanded={openFmt[f]}
              >
                <h2 className="font-cinzel text-base font-bold text-amber-700 dark:text-gold">{f} <span className="font-rajdhani text-xs text-[#78716C] dark:text-zinc-500">({rows.length})</span></h2>
                <span className="lg:hidden text-[#78716C] dark:text-zinc-500">{openFmt[f] ? '▾' : '▸'}</span>
              </button>
              <div className={`space-y-2 ${openFmt[f] ? '' : 'hidden'} lg:block`}>
                {book && rows.length === 0 && (
                  <p className="font-rajdhani text-sm text-[#78716C] dark:text-zinc-500">No {f} records in this scope yet.</p>
                )}
                {rows.map(b => (
                  <div key={b.scopeKey + b.recordKey} className="bg-white dark:bg-ink-3 border border-[#D4C9B0] dark:border-ink-5 rounded p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-cinzel text-sm font-bold text-[#1C1917] dark:text-parchment">{b.title}</p>
                      <div className="flex items-center gap-2">
                        <p className="font-cinzel text-base font-bold text-amber-700 dark:text-gold whitespace-nowrap">{b.display}</p>
                        {admin && latestYear && b.gameDate.startsWith(latestYear) && (
                          <button
                            onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(b.message)}`, '_blank', 'noopener,noreferrer')}
                            title="Share this record on WhatsApp"
                            aria-label="Share this record on WhatsApp"
                            className="flex-shrink-0 flex items-center justify-center p-1.5 rounded-md text-[#059669] hover:bg-[#059669]/10 transition-colors"
                          >
                            {WA_ICON}
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="font-rajdhani text-sm text-[#44403C] dark:text-zinc-300">{b.holder}</p>
                    <p className="font-rajdhani text-xs text-[#78716C] dark:text-zinc-500">
                      vs {b.opponentName} · {formatDate(b.gameDate)} · <span className="font-bold">standing {age(b.gameDate)}</span> ·{' '}
                      <Link href={`/matches/history/${b.bookingId}`} className="underline hover:text-amber-700 dark:hover:text-gold">scorecard</Link>
                      {admin && <>{' · '}{b.entries} {b.entries === 1 ? 'entry' : 'entries'}</>}
                      {b.setInYear && b.setInYear === latestYear && (
                        <span className="ml-1 text-emerald-700 dark:text-emerald-400 font-bold">
                          · set in {b.setInYear}{b.beat ? `, beat ${b.beat.display} (${b.beat.holder}, ${b.beat.year}, held ${age(b.beat.gameDate)}) ` : ' — first entry'}
                          {b.beat && <Link href={`/matches/history/${b.beat.bookingId}`} className="underline">old scorecard</Link>}
                        </span>
                      )}
                      {admin && !b.armed && <span className="ml-1 text-amber-700 dark:text-amber-400 font-bold">· not armed yet</span>}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
