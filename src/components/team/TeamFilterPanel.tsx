'use client'
// Filter shell for /team-stats ("Team Record") — see features/team-stats.md §3.
//
// Replaces the original inline filter bar (seven selects + a checkbox +
// eleven split pills stacked above the numbers, which on a phone pushed
// the record itself below the fold). Three pieces:
//
//   1. A one-line summary row — a "Filters" button plus one removable chip
//      per active filter — so the current view is always readable without
//      opening anything. Removing a chip navigates immediately.
//   2. The panel itself, rendered as a persistent, collapsible left aside on
//      md+ and as a bottom sheet on mobile (same sheet idiom MobileTabBar's
//      "More" uses, and within thumb reach). Filters are *staged* in a local
//      draft and applied once via "Show N matches" — one URL update instead
//      of a server round-trip per select. The live count is cheap because
//      applyFilters() lives in the client-safe teamStatsCore.
//   3. SplitByRow — the split dimension as one horizontally scrolling row of
//      link pills directly above the split table, since that's the page's
//      primary interaction and shouldn't be buried in the panel.
//
// Still entirely URL-driven: the Server Component owns the data and parses
// searchParams; this only ever pushes a new href (buildTeamStatsHref), so
// every view remains a shareable link and BackButton restores it.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { applyFilters, SPLIT_LABEL, type TeamMatch } from '@/lib/teamStatsCore'
import {
  FILTER_KEYS, FILTER_LABEL, SPLIT_DIMENSIONS,
  activeFilterKeys, buildTeamStatsHref, clearAllFilters, clearFilter, filterValueLabel, isFilterSet, toTeamFilters,
  type FilterKey, type TeamFilterOptions, type TeamFilterState,
} from '@/lib/teamStatsFilters'

const SELECT = 'form-input font-rajdhani text-sm py-1.5 w-full truncate min-w-0 bg-[var(--stats-card-bg)] dark:bg-zinc-900 border-[var(--stats-card-border)] dark:border-zinc-700 text-[var(--stats-text)] dark:text-zinc-100'
const LABEL  = 'font-rajdhani text-[10px] font-bold tracking-widest uppercase text-[var(--stats-text-muted)] dark:text-zinc-500'
const CARD   = 'bg-[var(--stats-card-bg)] dark:bg-ink-3 border border-[var(--stats-card-border)] dark:border-ink-5'

interface ShellProps {
  state:    TeamFilterState
  options:  TeamFilterOptions
  matches:  TeamMatch[]        // the unfiltered set, for the live "Show N matches" count
  children: ReactNode          // the server-rendered results column
}

export function TeamFilterShell({ state, options, matches, children }: ShellProps) {
  const router = useRouter()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [asideOpen, setAsideOpen] = useState(true)

  const appliedHref = buildTeamStatsHref(state)
  const [draft, setDraft] = useState<TeamFilterState>(state)
  // Rows the user has added in the panel but not yet given a value — they
  // still need to render (with their select) even though isFilterSet is false.
  const [added, setAdded] = useState<FilterKey[]>([])

  // Resync the draft whenever the applied URL changes (apply, chip removal,
  // browser back) — keyed on the href, not the object, since the Server
  // Component hands down a fresh object on every render.
  useEffect(() => { setDraft(state); setAdded([]) }, [appliedHref]) // eslint-disable-line react-hooks/exhaustive-deps

  const draftHref = buildTeamStatsHref(draft)
  const dirty = draftHref !== appliedHref
  const draftCount = useMemo(() => applyFilters(matches, toTeamFilters(draft)).length, [matches, draft])
  const active = activeFilterKeys(state)

  function apply() { setSheetOpen(false); if (dirty) router.push(draftHref) }
  function reset() { setDraft(state); setAdded([]) }

  const panel = (
    <FilterPanelBody draft={draft} setDraft={setDraft} added={added} setAdded={setAdded}
      options={options} count={draftCount} dirty={dirty} onApply={apply} onReset={reset} />
  )

  return (
    <div className="md:flex md:items-start md:gap-6">
      {asideOpen && (
        <aside className={`hidden md:block w-[272px] flex-none sticky top-20 rounded-lg ${CARD}`}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--stats-divider)] dark:border-ink-4">
            <span className="font-rajdhani text-xs font-bold tracking-[3px] uppercase text-[var(--stats-text)] dark:text-parchment">Filters</span>
            <button onClick={() => setAsideOpen(false)} className="font-rajdhani text-xs font-semibold text-[var(--stats-text-muted)] dark:text-zinc-500 hover:text-[var(--stats-accent)] dark:hover:text-gold" aria-label="Hide filters">‹ Hide</button>
          </div>
          <div className="px-4 py-3">{panel}</div>
        </aside>
      )}

      <div className="flex-1 min-w-0">
        {/* Summary row */}
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <button onClick={() => setSheetOpen(true)} className={`md:hidden ${filterButtonClass(active.length > 0)}`}>
            <FilterIcon /> Filters{active.length > 0 ? ` · ${active.length}` : ''}
          </button>
          {!asideOpen && (
            <button onClick={() => setAsideOpen(true)} className={`hidden md:inline-flex ${filterButtonClass(active.length > 0)}`}>
              <FilterIcon /> Filters{active.length > 0 ? ` · ${active.length}` : ''}
            </button>
          )}
          {active.length === 0 ? (
            <span className="font-rajdhani text-xs text-[var(--stats-text-faint)] dark:text-zinc-600">All matches — no filters applied</span>
          ) : (
            <>
              {active.map(k => (
                <Chip key={k} label={filterValueLabel(state, k, options)} title={FILTER_LABEL[k]}
                  onRemove={() => router.push(buildTeamStatsHref(clearFilter(state, k)))} />
              ))}
              <button onClick={() => router.push(buildTeamStatsHref(clearAllFilters(state)))}
                className="font-rajdhani text-xs font-bold tracking-widest uppercase text-[var(--stats-text-muted)] dark:text-zinc-500 hover:text-[var(--stats-accent)] dark:hover:text-gold">
                Clear all
              </button>
            </>
          )}
        </div>

        {children}
      </div>

      {sheetOpen && <FilterSheet onClose={() => { setSheetOpen(false); reset() }}>{panel}</FilterSheet>}
    </div>
  )
}

// ── Panel body (shared by aside + sheet) ──────────────────────────────────

interface BodyProps {
  draft:    TeamFilterState
  setDraft: (s: TeamFilterState) => void
  added:    FilterKey[]
  setAdded: (k: FilterKey[]) => void
  options:  TeamFilterOptions
  count:    number
  dirty:    boolean
  onApply:  () => void
  onReset:  () => void
}

function FilterPanelBody({ draft, setDraft, added, setAdded, options, count, dirty, onApply, onReset }: BodyProps) {
  const [picking, setPicking] = useState(false)
  const visible = FILTER_KEYS.filter(k => isFilterSet(draft, k) || added.includes(k))
  const available = FILTER_KEYS.filter(k => !visible.includes(k))

  function addKey(k: FilterKey) {
    setPicking(false)
    // Adding "Practice games" *means* include them — there's no value to pick.
    if (k === 'practice') { setDraft({ ...draft, practice: true }); return }
    setAdded([...added, k])
  }
  function removeKey(k: FilterKey) {
    setDraft(clearFilter(draft, k))
    setAdded(added.filter(a => a !== k))
  }

  return (
    <div className="flex flex-col gap-3">
      {visible.length === 0 && (
        <p className="font-rajdhani text-sm text-[var(--stats-text-muted)] dark:text-zinc-500">No filters yet — every synced match counts.</p>
      )}
      {visible.map(k => (
        <div key={k}>
          <div className="flex items-center justify-between mb-1">
            <span className={LABEL}>{FILTER_LABEL[k]}</span>
            <button onClick={() => removeKey(k)} className="font-rajdhani text-xs text-[var(--stats-text-faint)] dark:text-zinc-600 hover:text-red-600 dark:hover:text-red-400" aria-label={`Remove ${FILTER_LABEL[k]} filter`}>✕ remove</button>
          </div>
          <FilterControl k={k} draft={draft} setDraft={setDraft} options={options} />
        </div>
      ))}

      {available.length > 0 && (
        picking ? (
          <div className={`rounded-md ${CARD} overflow-hidden`}>
            {available.map(k => (
              <button key={k} onClick={() => addKey(k)}
                className="w-full text-left font-rajdhani text-sm px-3 py-2 text-[var(--stats-text)] dark:text-zinc-200 hover:bg-[var(--stats-row-hover)] border-b last:border-b-0 border-[var(--stats-divider)] dark:border-ink-4">
                {FILTER_LABEL[k]}
              </button>
            ))}
            <button onClick={() => setPicking(false)} className="w-full text-left font-rajdhani text-xs px-3 py-2 text-[var(--stats-text-faint)] dark:text-zinc-600 hover:text-[var(--stats-text-2)]">Cancel</button>
          </div>
        ) : (
          <button onClick={() => setPicking(true)}
            className="self-start font-rajdhani text-sm font-bold text-[var(--stats-accent)] dark:text-gold hover:text-[var(--stats-accent-dim)] dark:hover:text-gold-light">
            + Add filter
          </button>
        )
      )}

      <div className="flex items-center gap-3 pt-2 border-t border-[var(--stats-divider)] dark:border-ink-4">
        <button onClick={onApply} disabled={!dirty}
          className={`flex-1 font-rajdhani text-sm font-bold py-2 rounded-md transition-colors
            ${dirty
              ? 'bg-[var(--stats-accent)] text-white dark:text-ink hover:opacity-90'
              : 'bg-[var(--stats-row-bg)] dark:bg-ink-4 text-[var(--stats-text-muted)] dark:text-zinc-500 cursor-default'}`}>
          {dirty ? `Show ${count} ${count === 1 ? 'match' : 'matches'}` : `Showing ${count} ${count === 1 ? 'match' : 'matches'}`}
        </button>
        {dirty && (
          <button onClick={onReset} className="font-rajdhani text-xs font-semibold text-[var(--stats-text-muted)] dark:text-zinc-500 hover:text-[var(--stats-accent)] dark:hover:text-gold">Reset</button>
        )}
      </div>
    </div>
  )
}

function FilterControl({ k, draft, setDraft, options }: { k: FilterKey; draft: TeamFilterState; setDraft: (s: TeamFilterState) => void; options: TeamFilterOptions }) {
  switch (k) {
    case 'year':
      return (
        <select value={draft.year} onChange={e => setDraft({ ...draft, year: e.target.value })} className={SELECT}>
          <option value="all">All time</option>
          {options.years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      )
    case 'tournament':
      return (
        <select value={draft.tournament} onChange={e => setDraft({ ...draft, tournament: e.target.value })} className={SELECT}>
          <option value="all">All tournaments</option>
          {options.tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      )
    case 'ground':
      return (
        <select value={draft.ground} onChange={e => setDraft({ ...draft, ground: e.target.value })} className={SELECT}>
          <option value="all">All grounds</option>
          {options.grounds.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      )
    case 'opponent':
      return (
        <select value={draft.opponent} onChange={e => setDraft({ ...draft, opponent: e.target.value })} className={SELECT}>
          <option value="all">All opponents</option>
          {options.opponents.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      )
    case 'format':
      return (
        <select value={draft.format} onChange={e => setDraft({ ...draft, format: e.target.value as TeamFilterState['format'] })} className={SELECT}>
          <option value="all">All formats</option>
          <option value="T20">T20</option>
          <option value="T30">T30</option>
          <option value="other">Other (T10/T25)</option>
        </select>
      )
    case 'innings':
      return (
        <select value={draft.innings} onChange={e => setDraft({ ...draft, innings: e.target.value as TeamFilterState['innings'] })} className={SELECT}>
          <option value="all">Defending + Chasing</option>
          <option value="defending">Defending only</option>
          <option value="chasing">Chasing only</option>
        </select>
      )
    case 'stage':
      return (
        <select value={draft.stage} onChange={e => setDraft({ ...draft, stage: e.target.value as TeamFilterState['stage'] })} className={SELECT}>
          <option value="all">League + Knockout</option>
          <option value="league">League only</option>
          <option value="knockout">Knockout only</option>
        </select>
      )
    case 'practice':
      return (
        <label className="flex items-center gap-2 font-rajdhani text-sm text-[var(--stats-text)] dark:text-zinc-200 cursor-pointer select-none">
          <input type="checkbox" checked={draft.practice} onChange={e => setDraft({ ...draft, practice: e.target.checked })} className="accent-[var(--stats-accent)] dark:accent-gold" />
          Include practice games
        </label>
      )
  }
}

// ── Mobile bottom sheet ───────────────────────────────────────────────────

function FilterSheet({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])

  return (
    <>
      <div onClick={onClose} className="md:hidden fixed inset-0 z-[55] bg-black/50" />
      <div role="dialog" aria-modal="true" aria-label="Filters"
        className="md:hidden fixed inset-x-0 bottom-0 z-[60] rounded-t-2xl shadow-2xl max-h-[85vh] flex flex-col bg-[var(--stats-card-bg)] dark:bg-ink-2 border-t border-x border-[var(--stats-card-border)] dark:border-ink-5 pb-[env(safe-area-inset-bottom)]">
        <div className="w-9 h-1 rounded-full mx-auto mt-2.5 mb-1 flex-none bg-[var(--stats-card-border)] dark:bg-ink-5" />
        <div className="flex items-center justify-between px-5 py-2 flex-none">
          <span className="font-rajdhani text-xs font-bold tracking-[3px] uppercase text-[var(--stats-text)] dark:text-parchment">Filters</span>
          <button onClick={onClose} className="font-rajdhani text-sm text-[var(--stats-text-muted)] dark:text-zinc-500 hover:text-[var(--stats-accent)] dark:hover:text-gold" aria-label="Close filters">✕</button>
        </div>
        <div className="overflow-y-auto px-5 pb-5">{children}</div>
      </div>
    </>
  )
}

// ── Split-by row ──────────────────────────────────────────────────────────

export function SplitByRow({ state }: { state: TeamFilterState }) {
  const ref = useRef<HTMLDivElement>(null)
  // Keep the active pill in view — the row scrolls horizontally on a phone
  // and the selected dimension may otherwise sit off-screen to the right.
  useEffect(() => {
    const row = ref.current
    const el = row?.querySelector<HTMLElement>('[data-active="true"]')
    if (!row || !el) return
    const target = el.offsetLeft - (row.clientWidth - el.offsetWidth) / 2
    row.scrollTo({ left: Math.max(0, target), behavior: 'auto' })
  }, [state.by])

  return (
    <div className="flex items-center gap-3 mb-2">
      <span className="font-rajdhani text-[10px] font-bold tracking-[3px] uppercase text-[var(--stats-text-faint)] dark:text-zinc-600 flex-none">Split by</span>
      <div ref={ref} className="flex gap-2 overflow-x-auto -my-1 py-1 min-w-0" style={{ scrollbarWidth: 'none' }}>
        {SPLIT_DIMENSIONS.map(d => {
          const on = state.by === d
          return (
            <Link key={d} href={buildTeamStatsHref({ ...state, by: d })} data-active={on} scroll={false}
              className={`font-rajdhani text-xs font-bold tracking-widest uppercase px-3 py-1.5 rounded border transition-colors whitespace-nowrap flex-none
                ${on
                  ? 'bg-[var(--stats-badge-bg)] dark:bg-gold/20 border-[var(--stats-accent-dim)] dark:border-gold-dim text-[var(--stats-accent)] dark:text-gold'
                  : 'border-[var(--stats-card-border)] dark:border-ink-5 text-[var(--stats-text-muted)] dark:text-zinc-500 hover:text-[var(--stats-text-2)] dark:hover:text-zinc-300'}`}>
              {SPLIT_LABEL[d]}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

// ── Bits ──────────────────────────────────────────────────────────────────

function filterButtonClass(active: boolean): string {
  return `items-center gap-1.5 font-rajdhani text-xs font-bold tracking-widest uppercase px-3 py-1.5 rounded border transition-colors
    ${active
      ? 'bg-[var(--stats-badge-bg)] dark:bg-gold/20 border-[var(--stats-accent-dim)] dark:border-gold-dim text-[var(--stats-accent)] dark:text-gold'
      : 'border-[var(--stats-card-border)] dark:border-ink-5 text-[var(--stats-text-2)] dark:text-zinc-300 hover:border-[var(--stats-accent-dim)] dark:hover:border-gold-dim'}`
}

function Chip({ label, title, onRemove }: { label: string; title: string; onRemove: () => void }) {
  return (
    <span title={title} className="inline-flex items-center gap-1.5 max-w-[16rem] font-rajdhani text-xs font-semibold px-2.5 py-1 rounded-full bg-[var(--stats-badge-bg)] dark:bg-gold/15 border border-[var(--stats-badge-border)] dark:border-gold-dim text-[var(--stats-badge-text)] dark:text-gold">
      <span className="truncate">{label}</span>
      <button onClick={onRemove} aria-label={`Remove ${title} filter`} className="flex-none leading-none hover:text-red-600 dark:hover:text-red-400">✕</button>
    </span>
  )
}

function FilterIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 5h18M6 12h12M10 19h4" />
    </svg>
  )
}
