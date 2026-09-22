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
import { applyFilters, SPLIT_LABEL, type FormatFilter, type InningsFilter, type PitchFilter, type StageFilter, type SplitDimension, type TeamMatch, type TossFilter } from '@/lib/teamStatsCore'
import {
  FILTER_LABEL,
  activeFilterKeys, buildTeamStatsHref, clearAllFilters, clearFilter, filterValueLabel, isFilterSet, toTeamFilters,
  visibleFilterKeys, visibleSplitDimensions,
  type FilterKey, type TeamFilterOptions, type TeamFilterState,
} from '@/lib/teamStatsFilters'

const LABEL  = 'font-rajdhani text-[10px] font-bold tracking-widest uppercase text-[var(--stats-text-muted)] dark:text-zinc-500'
const CARD   = 'bg-[var(--stats-card-bg)] dark:bg-ink-3 border border-[var(--stats-card-border)] dark:border-ink-5'

interface ShellProps {
  state:    TeamFilterState
  options:  TeamFilterOptions
  matches:  TeamMatch[]        // the unfiltered set, for the live "Show N matches" count
  children: ReactNode          // the server-rendered results column
  // Captain filter/split — restricted to captains, GC and admin, see
  // features/team-stats.md §3.6. Server-resolved in page.tsx; this only
  // ever mirrors it, never decides it — a tampered client can't widen
  // access since page.tsx re-validates any resulting `captain`/`by`/`then`
  // param independently.
  canUseCaptainDimension: boolean
}

export function TeamFilterShell({ state, options, matches, children, canUseCaptainDimension }: ShellProps) {
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
      options={options} count={draftCount} dirty={dirty} onApply={apply} onReset={reset}
      canUseCaptainDimension={canUseCaptainDimension} />
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
  canUseCaptainDimension: boolean
}

function FilterPanelBody({ draft, setDraft, added, setAdded, options, count, dirty, onApply, onReset, canUseCaptainDimension }: BodyProps) {
  const [picking, setPicking] = useState(false)
  const filterKeys = visibleFilterKeys(canUseCaptainDimension)
  const visible = filterKeys.filter(k => isFilterSet(draft, k) || added.includes(k))
  const available = filterKeys.filter(k => !visible.includes(k))

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

const PITCH_OPTIONS: { id: PitchFilter; name: string }[] = [
  { id: 'Matted', name: 'Matted' }, { id: 'Astro', name: 'Astro' }, { id: 'Turf', name: 'Turf' },
]
const TOSS_OPTIONS: { id: TossFilter; name: string }[] = [
  { id: 'won', name: 'Won the toss' }, { id: 'lost', name: 'Lost the toss' },
]
const FORMAT_OPTIONS: { id: FormatFilter; name: string }[] = [
  { id: 'T20', name: 'T20' }, { id: 'T30', name: 'T30' }, { id: 'other', name: 'Other (T10/T25)' },
]
const INNINGS_OPTIONS: { id: InningsFilter; name: string }[] = [
  { id: 'defending', name: 'Defending (batted first)' }, { id: 'chasing', name: 'Chasing (batted second)' },
]
const STAGE_OPTIONS: { id: StageFilter; name: string }[] = [
  { id: 'league', name: 'League' }, { id: 'knockout', name: 'Knockout' },
]

// One checkbox per option — every filter dimension is multi-select (added
// September 2026, see features/team-stats.md §3.8), so "no boxes checked"
// is what used to be the '<dimension> = all' sentinel. Generic over the
// option id's literal type so a caller like `pitch` (PitchFilter) gets a
// correctly-typed onChange with no cast, while an id-based dimension like
// `tournament` (plain string ids from the fetched option list) still works
// the same way.
function CheckboxList<T extends string>({ options, selected, onChange, emptyLabel }: {
  options: { id: T; name: string }[]
  selected: T[]
  onChange: (next: T[]) => void
  emptyLabel: string
}) {
  function toggle(id: T) {
    onChange(selected.includes(id) ? selected.filter(v => v !== id) : [...selected, id])
  }
  return (
    <div className={`rounded-md ${CARD} max-h-48 overflow-y-auto p-1.5 flex flex-col gap-0.5`}>
      {options.length === 0 ? (
        <p className="font-rajdhani text-xs text-[var(--stats-text-faint)] dark:text-zinc-600 px-1.5 py-1">{emptyLabel}</p>
      ) : options.map(o => (
        <label key={o.id} className="flex items-center gap-2 font-rajdhani text-sm px-1.5 py-1 rounded text-[var(--stats-text)] dark:text-zinc-200 cursor-pointer select-none hover:bg-[var(--stats-row-hover)] dark:hover:bg-ink-4">
          <input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggle(o.id)}
            className="accent-[var(--stats-accent)] dark:accent-gold flex-none" />
          <span className="truncate">{o.name}</span>
        </label>
      ))}
    </div>
  )
}

function FilterControl({ k, draft, setDraft, options }: { k: FilterKey; draft: TeamFilterState; setDraft: (s: TeamFilterState) => void; options: TeamFilterOptions }) {
  switch (k) {
    case 'year':
      return (
        <CheckboxList options={options.years.map(y => ({ id: y, name: y }))} selected={draft.year}
          onChange={v => setDraft({ ...draft, year: v })} emptyLabel="No seasons yet" />
      )
    case 'tournament':
      return (
        <CheckboxList options={options.tournaments} selected={draft.tournament}
          onChange={v => setDraft({ ...draft, tournament: v })} emptyLabel="No tournaments yet" />
      )
    case 'ground':
      return (
        <CheckboxList options={options.grounds} selected={draft.ground}
          onChange={v => setDraft({ ...draft, ground: v })} emptyLabel="No grounds yet" />
      )
    case 'pitch':
      return (
        <CheckboxList options={PITCH_OPTIONS} selected={draft.pitch}
          onChange={v => setDraft({ ...draft, pitch: v })} emptyLabel="No pitch types" />
      )
    case 'opponent':
      return (
        <CheckboxList options={options.opponents} selected={draft.opponent}
          onChange={v => setDraft({ ...draft, opponent: v })} emptyLabel="No opponents yet" />
      )
    case 'month':
      return (
        <CheckboxList options={options.months} selected={draft.month}
          onChange={v => setDraft({ ...draft, month: v })} emptyLabel="No months yet" />
      )
    case 'captain':
      return (
        <CheckboxList options={options.captains} selected={draft.captain}
          onChange={v => setDraft({ ...draft, captain: v })} emptyLabel="No captains yet" />
      )
    case 'slot':
      return (
        <CheckboxList options={options.slots} selected={draft.slot}
          onChange={v => setDraft({ ...draft, slot: v })} emptyLabel="No slot times yet" />
      )
    case 'toss':
      return (
        <CheckboxList options={TOSS_OPTIONS} selected={draft.toss}
          onChange={v => setDraft({ ...draft, toss: v })} emptyLabel="No toss data" />
      )
    case 'format':
      return (
        <CheckboxList options={FORMAT_OPTIONS} selected={draft.format}
          onChange={v => setDraft({ ...draft, format: v })} emptyLabel="No formats" />
      )
    case 'innings':
      return (
        <CheckboxList options={INNINGS_OPTIONS} selected={draft.innings}
          onChange={v => setDraft({ ...draft, innings: v })} emptyLabel="No innings data" />
      )
    case 'stage':
      return (
        <CheckboxList options={STAGE_OPTIONS} selected={draft.stage}
          onChange={v => setDraft({ ...draft, stage: v })} emptyLabel="No stages" />
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

export function SplitByRow({ state, canUseCaptainDimension }: { state: TeamFilterState; canUseCaptainDimension: boolean }) {
  // "Then by" is the second-level breakdown shown inside each row when it
  // is expanded (§3.2) — the other way to answer a two-dimension question,
  // alongside filtering one dimension and splitting the other. It offers
  // every dimension except the primary one: splitting a group by the thing
  // that defined it would just yield one sub-row per group.
  const splitDimensions = visibleSplitDimensions(canUseCaptainDimension)
  const thenOptions = splitDimensions.filter(d => d !== state.by)
  return (
    <div className="flex flex-col gap-1.5 mb-2">
      <PillRow label="Split by" active={state.by}
        options={splitDimensions} hrefFor={d => buildTeamStatsHref({ ...state, by: d, then: state.then === d ? null : state.then })} />
      <PillRow label="Then by" active={state.then} includeNone
        options={thenOptions} hrefFor={d => buildTeamStatsHref({ ...state, then: d })}
        noneHref={buildTeamStatsHref({ ...state, then: null })} />
    </div>
  )
}

function PillRow({ label, active, options, hrefFor, includeNone, noneHref }: {
  label: string
  active: SplitDimension | null
  options: SplitDimension[]
  hrefFor: (d: SplitDimension) => string
  includeNone?: boolean
  noneHref?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  // Keep the active pill in view — the row scrolls horizontally on a phone
  // and the selected dimension may otherwise sit off-screen to the right.
  useEffect(() => {
    const row = ref.current
    const el = row?.querySelector<HTMLElement>('[data-active="true"]')
    if (!row || !el) return
    const target = el.offsetLeft - (row.clientWidth - el.offsetWidth) / 2
    row.scrollTo({ left: Math.max(0, target), behavior: 'auto' })
  }, [active])

  return (
    <div className="flex items-center gap-3">
      <span className="font-rajdhani text-[10px] font-bold tracking-[3px] uppercase text-[var(--stats-text-faint)] dark:text-zinc-600 flex-none w-[4.5rem]">{label}</span>
      <div ref={ref} className="flex gap-2 overflow-x-auto -my-1 py-1 min-w-0" style={{ scrollbarWidth: 'none' }}>
        {includeNone && (
          <Link href={noneHref!} data-active={active === null} scroll={false} className={splitPill(active === null)}>None</Link>
        )}
        {options.map(d => (
          <Link key={d} href={hrefFor(d)} data-active={active === d} scroll={false} className={splitPill(active === d)}>
            {SPLIT_LABEL[d]}
          </Link>
        ))}
      </div>
    </div>
  )
}

function splitPill(on: boolean): string {
  return `font-rajdhani text-xs font-bold tracking-widest uppercase px-3 py-1.5 rounded border transition-colors whitespace-nowrap flex-none
    ${on
      ? 'bg-[var(--stats-badge-bg)] dark:bg-gold/20 border-[var(--stats-accent-dim)] dark:border-gold-dim text-[var(--stats-accent)] dark:text-gold'
      : 'border-[var(--stats-card-border)] dark:border-ink-5 text-[var(--stats-text-muted)] dark:text-zinc-500 hover:text-[var(--stats-text-2)] dark:hover:text-zinc-300'}`
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
