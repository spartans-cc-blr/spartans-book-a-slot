'use client'

// Shared date-chip picker. Originally a permanent Warm Light "light island"
// (parchment bg, saturated gold accent) regardless of the app's dark-ink
// default — see architecture.md's theme notes for that history. Now
// Light/Dark/System-aware by default (`theme="auto"`, the default — reads
// the `--fx-*` CSS variables from globals.css, which flip with the
// visitor's own theme choice, same convention as the rest of /fixtures —
// see ui-theme.md). `theme="light"` pins the original literal Warm Light
// colours regardless of the visitor's choice, for a caller whose own page
// body hasn't been made theme-aware yet (e.g. /matches/history — see
// MatchHistoryClient.tsx's own call site). Purely presentational +
// controlled: caller owns `selected` and does the actual filtering.

const LIGHT = {
  trackBg: '#EEEAE2', trackBorder: '#D4C9B0',
  accent: '#D97706', accentText: '#fff',
  chipText: '#1C1917', mutedText: '#78716C', mutedTextOnDark: 'rgba(255,255,255,0.85)',
}
const AUTO = {
  trackBg: 'var(--fx-card-header-bg)', trackBorder: 'var(--fx-border)',
  accent: 'var(--fx-accent)', accentText: '#fff',
  chipText: 'var(--fx-card-text)', mutedText: 'var(--fx-card-text-muted)', mutedTextOnDark: 'rgba(255,255,255,0.85)',
}

export interface DateChipGroup {
  // A representative ISO date from this group (its earliest date) — used
  // both as the React key and as the value passed to onSelect/compared
  // against `selected`. Callers that filter via a CSS `data-dates*="..."`
  // substring match (see FixturesDateFilterBar) can use this directly,
  // since it's always one of the dates actually present in that group.
  key: string
  // 1 date for an isolated day, 2 for a combined weekend (Sat+Sun) — sorted
  // ascending. A chip renders as a single-day chip or a combined range chip
  // depending on this length.
  dates: string[]
}

function chipParts(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`)
  return {
    dow:   d.toLocaleDateString('en-IN', { weekday: 'short' }).toUpperCase(),
    day:   d.getDate(),
    month: d.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase(),
  }
}

interface DateChipSliderProps {
  groups:   DateChipGroup[]
  selected: string | null // null = "All"
  onSelect: (key: string | null) => void
  // Trailing "Load Older" chip — optional, only meaningful for a paginated
  // caller (e.g. /matches/history's cursor-paginated match list). Omitted
  // entirely (no chip rendered) for a non-paginated caller like /fixtures,
  // which has nothing further to load. When provided, `onLoadMore` fetches
  // the next page — the chip row then grows on its own since `groups` is
  // derived from whatever's currently loaded, same as the existing
  // "Load Older Matches" button at the bottom of the page.
  hasMore?:     boolean
  loadingMore?: boolean
  onLoadMore?:  () => void
  // See the file header comment — 'auto' (default) follows the visitor's
  // Light/Dark/System choice; 'light' pins the original Warm Light look.
  theme?: 'auto' | 'light'
}

export function DateChipSlider({ groups, selected, onSelect, hasMore, loadingMore, onLoadMore, theme = 'auto' }: DateChipSliderProps) {
  if (groups.length === 0 && !hasMore) return null
  const t = theme === 'light' ? LIGHT : AUTO

  return (
    <div
      className="flex gap-2 overflow-x-auto pb-1"
      style={{ scrollbarWidth: 'none' }}
    >
      <button
        onClick={() => onSelect(null)}
        className="flex-shrink-0 font-rajdhani text-sm font-bold px-4 py-2.5 rounded-xl transition-colors"
        style={selected === null
          ? { background: t.accent, color: t.accentText }
          : { background: t.trackBg, border: `1px solid ${t.trackBorder}`, color: t.mutedText }}
      >
        All
      </button>

      {groups.map(group => {
        const active = selected === group.key
        const activeStyle = active
          ? { background: t.accent, color: t.accentText }
          : { background: t.trackBg, border: `1px solid ${t.trackBorder}`, color: t.chipText }
        const mutedColor = active ? t.mutedTextOnDark : t.mutedText

        if (group.dates.length === 1) {
          const { dow, day, month } = chipParts(group.dates[0])
          return (
            <button
              key={group.key}
              onClick={() => onSelect(active ? null : group.key)}
              className="flex-shrink-0 w-[58px] flex flex-col items-center justify-center rounded-xl py-1.5 transition-colors"
              style={activeStyle}
            >
              <span className="font-rajdhani text-[10px] font-bold" style={{ color: mutedColor }}>{dow}</span>
              <span className="font-rajdhani text-lg font-extrabold leading-tight">{day}</span>
              <span className="font-rajdhani text-[10px] font-bold" style={{ color: mutedColor }}>{month}</span>
            </button>
          )
        }

        // Combined weekend chip (Sat + Sun) — one tap jumps to the whole
        // shared-validation-state group, not just one day of it.
        const first = chipParts(group.dates[0])
        const last  = chipParts(group.dates[group.dates.length - 1])
        const monthLabel = first.month === last.month ? first.month : `${first.month}/${last.month}`
        return (
          <button
            key={group.key}
            onClick={() => onSelect(active ? null : group.key)}
            className="flex-shrink-0 w-[72px] flex flex-col items-center justify-center rounded-xl py-1.5 transition-colors"
            style={activeStyle}
          >
            <span className="font-rajdhani text-[10px] font-bold" style={{ color: mutedColor }}>{first.dow}–{last.dow}</span>
            <span className="font-rajdhani text-base font-extrabold leading-tight">{first.day}–{last.day}</span>
            <span className="font-rajdhani text-[10px] font-bold" style={{ color: mutedColor }}>{monthLabel}</span>
          </button>
        )
      })}

      {hasMore && onLoadMore && (
        <button
          onClick={onLoadMore}
          disabled={loadingMore}
          aria-label="Load older matches"
          title="Load older matches"
          className="flex-shrink-0 w-[58px] flex flex-col items-center justify-center rounded-xl py-1.5 transition-colors disabled:opacity-50"
          style={{ background: t.trackBg, border: `1px dashed ${t.trackBorder}`, color: t.mutedText }}
        >
          <span className="font-rajdhani text-lg font-extrabold leading-tight">{loadingMore ? '…' : '+'}</span>
          <span className="font-rajdhani text-[9px] font-bold leading-tight text-center">{loadingMore ? 'Loading' : 'Older'}</span>
        </button>
      )}
    </div>
  )
}
