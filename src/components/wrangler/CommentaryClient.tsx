'use client'

import { useMemo, useState } from 'react'
import { DateChipSlider } from '@/components/ui/DateChipSlider'
import { MonthStepper, distinctMonths, monthOfDate } from '@/components/ui/MonthStepper'
import { groupDatesIntoChips } from '@/lib/dateChipGroups'
import {
  COMMENTARY_SIDES, SIDE_LABEL, validateCommentaryPdf, matchesNeedingCommentary,
  type CommentaryMatchOption, type CommentaryResult, type CommentarySide,
} from '@/lib/commentary'

interface SideState {
  file:        File | null
  checking:    boolean
  saving:      boolean
  error:       string
  result:      CommentaryResult | null
  saveAnyway:  boolean
  savedAt:     string | null
}

const EMPTY: SideState = {
  file: null, checking: false, saving: false, error: '', result: null, saveAnyway: false, savedAt: null,
}

function matchLabel(m: CommentaryMatchOption) {
  const mark = m.bbb_status === 'complete' ? '✓ ' : ''
  return `${mark}${m.game_date} · ${m.format} · vs ${m.opponent_name ?? 'Unknown'}`
}

const STATUS_TEXT: Record<string, string> = {
  none: 'No commentary', partial: 'One innings', mismatch: 'Needs re-upload',
}

export function CommentaryClient({ matches }: { matches: CommentaryMatchOption[] }) {
  const [bookingId, setBookingId] = useState(matches[0]?.booking_id ?? '')
  const [dayFilter, setDayFilter] = useState<string | null>(null)
  const [monthFilter, setMonthFilter] = useState('')
  const [sides, setSides] = useState<Record<CommentarySide, SideState>>({
    spartans: EMPTY, opponent: EMPTY,
  })

  function patch(side: CommentarySide, next: Partial<SideState>) {
    setSides(prev => ({ ...prev, [side]: { ...prev[side], ...next } }))
  }

  // Date chips, same picker as the match history: narrows the dropdown to those dates.
  // A month stepper sits above the chips and narrows both to one month ('' = All time).
  const months = useMemo(() => distinctMonths(matches.map(m => m.game_date)), [matches])
  const monthMatches = useMemo(
    () => monthFilter ? matches.filter(m => monthOfDate(m.game_date) === monthFilter) : matches,
    [matches, monthFilter],
  )
  const dateChipGroups = useMemo(
    () => groupDatesIntoChips(Array.from(new Set(monthMatches.map(m => m.game_date))).sort()).reverse(),
    [monthMatches],
  )
  const selectedGroup = dayFilter ? dateChipGroups.find(g => g.key === dayFilter) : undefined
  const visibleMatches = selectedGroup ? monthMatches.filter(m => selectedGroup.dates.includes(m.game_date)) : monthMatches

  function changeDay(key: string | null) {
    setDayFilter(key)
    const group = key ? dateChipGroups.find(g => g.key === key) : undefined
    const next = group ? monthMatches.filter(m => group.dates.includes(m.game_date)) : monthMatches
    if (!next.some(m => m.booking_id === bookingId) && next[0]) changeMatch(next[0].booking_id)
  }

  function changeMonth(month: string) {
    setMonthFilter(month)
    setDayFilter(null)
    const next = month ? matches.filter(m => monthOfDate(m.game_date) === month) : matches
    if (!next.some(m => m.booking_id === bookingId) && next[0]) changeMatch(next[0].booking_id)
  }

  function changeMatch(id: string) {
    setBookingId(id)
    setSides({ spartans: EMPTY, opponent: EMPTY })
  }

  async function send(side: CommentarySide, file: File, dryRun: boolean, saveAnyway: boolean) {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('booking_id', bookingId)
    fd.append('side', side)
    fd.append('dry_run', String(dryRun))
    fd.append('save_anyway', String(saveAnyway))
    const res = await fetch('/api/wrangler/commentary', { method: 'POST', body: fd })
    const data = await res.json().catch(() => null)
    return { res, data }
  }

  async function handleFile(side: CommentarySide, file: File | null) {
    if (!file) { patch(side, { ...EMPTY }); return }
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer())
    const problem = validateCommentaryPdf(file.size, head)
    if (problem) { patch(side, { ...EMPTY, file, error: problem }); return }

    patch(side, { ...EMPTY, file, checking: true })
    try {
      const { res, data } = await send(side, file, true, false)
      if (!res.ok) patch(side, { checking: false, error: data?.error ?? 'Could not check this PDF' })
      else patch(side, { checking: false, result: data as CommentaryResult })
    } catch {
      patch(side, { checking: false, error: 'Network error while checking the PDF' })
    }
  }

  async function handleSave(side: CommentarySide) {
    const s = sides[side]
    if (!s.file) return
    patch(side, { saving: true, error: '' })
    try {
      const { res, data } = await send(side, s.file, false, s.saveAnyway)
      if (res.status === 422) patch(side, { saving: false, error: 'Checks failed, nothing saved. Tick “Save anyway” to keep it with the failures recorded.' })
      else if (!res.ok) patch(side, { saving: false, error: data?.error ?? 'Save failed' })
      else patch(side, { saving: false, savedAt: new Date().toLocaleTimeString(), result: data as CommentaryResult })
    } catch {
      patch(side, { saving: false, error: 'Network error while saving' })
    }
  }

  if (matches.length === 0) {
    return (
      <p className="font-rajdhani text-sm text-[#78716C] dark:text-zinc-500 bg-white dark:bg-ink-3 border border-[#D4C9B0] dark:border-ink-5 rounded p-4">
        No finished matches with an imported scorecard yet. Upload the match scorecard first, then come back here.
      </p>
    )
  }

  const needing = matchesNeedingCommentary(matches)
  const known = matches.filter(m => m.bbb_status !== undefined).length

  function pickFromList(id: string) {
    setDayFilter(null)
    setMonthFilter('')
    changeMatch(id)
    document.getElementById('commentary-match')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div className="space-y-5">
      {known > 0 && (
        <details open={needing.length > 0}
          className="bg-white dark:bg-ink-3 border border-[#D4C9B0] dark:border-ink-5 rounded p-4">
          <summary className="cursor-pointer font-rajdhani text-sm font-bold tracking-wide uppercase text-[#1C1917] dark:text-zinc-300">
            Commentary needed ({needing.length} of {known} matches)
          </summary>
          {needing.length === 0 ? (
            <p className="font-rajdhani text-xs text-emerald-700 dark:text-emerald-400 mt-2">Every match has both innings loaded.</p>
          ) : (
            <ul className="mt-3 max-h-72 overflow-y-auto divide-y divide-[#E2DACE] dark:divide-ink-5">
              {needing.map(m => (
                <li key={m.booking_id} className="flex items-center gap-3 py-2 font-rajdhani text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-[#1C1917] dark:text-zinc-200">
                      {m.game_date} · {m.format} · vs {m.opponent_name ?? 'Unknown'}
                    </div>
                    <div className="text-xs text-[#78716C] dark:text-zinc-500">
                      {STATUS_TEXT[m.bbb_status as string] ?? m.bbb_status}
                      {m.cricheroes_url
                        ? <> · <a href={m.cricheroes_url} target="_blank" rel="noopener noreferrer" className="underline">CricHeroes ↗</a></>
                        : ' · no CricHeroes link on booking'}
                    </div>
                  </div>
                  <button type="button" onClick={() => pickFromList(m.booking_id)}
                    className="shrink-0 rounded border border-[#D4C9B0] dark:border-ink-5 px-3 py-1 text-xs font-bold text-[#B45309] dark:text-gold hover:bg-[#FEF3C7] dark:hover:bg-ink-4">
                    Upload
                  </button>
                </li>
              ))}
            </ul>
          )}
        </details>
      )}

      {dateChipGroups.length > 0 && (
        <div className="bg-white dark:bg-ink-3 border border-[#D4C9B0] dark:border-ink-5 rounded-xl p-3">
          <MonthStepper months={months} value={monthFilter} onChange={changeMonth} />
          <DateChipSlider groups={dateChipGroups} selected={dayFilter} onSelect={changeDay} />
        </div>
      )}

      <div className="bg-white dark:bg-ink-3 border border-[#D4C9B0] dark:border-ink-5 rounded p-4">
        <label className="form-label" htmlFor="commentary-match">
          Match <span className="text-[#78716C] dark:text-zinc-500 font-normal">({visibleMatches.length}{dayFilter || monthFilter ? ` of ${matches.length}` : ''})</span>
        </label>
        <select id="commentary-match" className="form-input bg-white dark:bg-zinc-900 border-[#D4C9B0] dark:border-zinc-700 text-[#1C1917] dark:text-zinc-100" value={bookingId}
          onChange={e => changeMatch(e.target.value)}>
          {visibleMatches.map(m => (
            <option key={m.booking_id} value={m.booking_id}>{matchLabel(m)}</option>
          ))}
        </select>
        <p className="font-rajdhani text-xs text-[#78716C] dark:text-zinc-500 mt-2">
          On the CricHeroes commentary page, pick the team in the dropdown, scroll until every over has
          loaded, then print the page to PDF. Do that once per team. Printing from your phone keeps the
          file small; files over 4MB can’t be uploaded.
        </p>
      </div>

      {COMMENTARY_SIDES.map(side => (
        <SideCard key={side} side={side} state={sides[side]} bookingKey={bookingId}
          onFile={f => handleFile(side, f)}
          onToggleAnyway={v => patch(side, { saveAnyway: v })}
          onSave={() => handleSave(side)} />
      ))}
    </div>
  )
}

function SideCard({ side, state, bookingKey, onFile, onToggleAnyway, onSave }: {
  side: CommentarySide
  state: SideState
  bookingKey: string
  onFile: (f: File | null) => void
  onToggleAnyway: (v: boolean) => void
  onSave: () => void
}) {
  const r = state.result
  const errors = r?.issues.filter(i => i.level === 'error') ?? []
  const warnings = r?.issues.filter(i => i.level === 'warning') ?? []
  const canSave = !!r && !state.saving && !state.checking && (r.ok || state.saveAnyway) && !state.savedAt

  const overs = useMemo(() => {
    const map = new Map<number, { bowler: string; runs: number; wkts: number }>()
    for (const b of r?.balls ?? []) {
      const row = map.get(b.over_no) ?? { bowler: b.bowler, runs: 0, wkts: 0 }
      row.runs += b.runs_total
      row.wkts += b.is_wicket ? 1 : 0
      map.set(b.over_no, row)
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0])
  }, [r])

  return (
    <div className="bg-white dark:bg-ink-3 border border-[#D4C9B0] dark:border-ink-5 rounded p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-rajdhani text-sm font-bold tracking-wide uppercase text-[#1C1917] dark:text-zinc-300">{SIDE_LABEL[side]}</h2>
        {state.savedAt && <span className="font-rajdhani text-xs text-emerald-700 dark:text-emerald-400">Saved {state.savedAt}</span>}
      </div>

      <input
        key={`${bookingKey}-${side}`}
        type="file" accept="application/pdf,.pdf"
        onChange={e => onFile(e.target.files?.[0] ?? null)}
        className="block w-full font-rajdhani text-xs text-[#57534E] dark:text-zinc-400 file:mr-3 file:rounded file:border-0 file:bg-[#EEEAE2] dark:file:bg-ink-5 file:px-3 file:py-2 file:text-[#1C1917] dark:file:text-zinc-200"
      />

      {state.checking && <p className="font-rajdhani text-xs text-[#78716C] dark:text-zinc-500">Checking… (the first request can take up to 30s)</p>}
      {state.error && (
        <p className="font-rajdhani text-xs px-3 py-2 rounded border bg-red-100 border-red-300 text-red-700 dark:bg-red-950/40 dark:border-red-800 dark:text-red-400">{state.error}</p>
      )}

      {r && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-rajdhani">
            <Stat label="Batting" value={r.batting_team || '?'} />
            <Stat label="Deliveries" value={String(r.deliveries)} />
            <Stat label="Runs / wickets" value={`${r.total_runs}/${r.total_wickets}`} />
            <Stat label="Checks" value={r.ok ? '✅ pass' : '❌ fail'} />
          </div>

          {errors.map((i, n) => (
            <p key={n} className="font-rajdhani text-xs px-3 py-2 rounded border bg-red-100 border-red-300 text-red-700 dark:bg-red-950/40 dark:border-red-800 dark:text-red-400">
              {i.over ? `Over ${i.over}: ` : ''}{i.message}
            </p>
          ))}
          {warnings.length > 0 && (
            <details className="font-rajdhani text-xs text-[#57534E] dark:text-zinc-400">
              <summary className="cursor-pointer">{warnings.length} warning{warnings.length === 1 ? '' : 's'}</summary>
              <ul className="mt-1 space-y-1 list-disc pl-5">
                {warnings.map((i, n) => <li key={n}>{i.over ? `Over ${i.over}: ` : ''}{i.message}</li>)}
              </ul>
            </details>
          )}
          {overs.length > 0 && (
            <details className="font-rajdhani text-xs text-[#57534E] dark:text-zinc-400">
              <summary className="cursor-pointer">Over by over</summary>
              <table className="mt-2 w-full text-left">
                <thead><tr className="text-[#78716C] dark:text-zinc-500"><th className="pr-3">Over</th>{side === 'opponent' && <th className="pr-3">Bowler</th>}<th className="pr-3">Runs</th><th className="pr-3">Wkts</th>{side === 'spartans' && <th>Score</th>}</tr></thead>
                <tbody>
                  {overs.map(([o, row], i) => {
                    const cum = overs.slice(0, i + 1).reduce((a, [, r2]) => ({ runs: a.runs + r2.runs, wkts: a.wkts + r2.wkts }), { runs: 0, wkts: 0 })
                    return (
                      <tr key={o}><td className="pr-3">{o}</td>{side === 'opponent' && <td className="pr-3">{row.bowler}</td>}<td className="pr-3">{row.runs}</td><td className="pr-3">{row.wkts}</td>{side === 'spartans' && <td>{cum.runs}/{cum.wkts}</td>}</tr>
                    )
                  })}
                </tbody>
              </table>
            </details>
          )}

          {r.replaces_existing && !state.savedAt && (
            <p className="font-rajdhani text-xs text-amber-700 dark:text-amber-400">Ball-by-ball is already saved for this innings; saving will replace it.</p>
          )}

          {!state.savedAt && (
            <div className="flex flex-wrap items-center gap-4">
              {!r.ok && (
                <label className="flex items-center gap-2 font-rajdhani text-xs text-[#57534E] dark:text-zinc-400">
                  <input type="checkbox" checked={state.saveAnyway} onChange={e => onToggleAnyway(e.target.checked)} />
                  Save anyway (failed checks are recorded)
                </label>
              )}
              <button onClick={onSave} disabled={!canSave}
                className="font-rajdhani text-xs font-bold tracking-wide bg-crimson hover:bg-crimson-dark disabled:opacity-40 text-white px-4 py-2 rounded transition-colors">
                {state.saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[#78716C] dark:text-zinc-500">{label}</div>
      <div className="text-sm text-[#1C1917] dark:text-zinc-200 break-words">{value}</div>
    </div>
  )
}
