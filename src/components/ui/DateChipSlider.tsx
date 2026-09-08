'use client'

// Shared date-chip picker — Warm Light palette (parchment bg, saturated gold
// accent), matching the reference mockup rather than the app's existing dark
// ink theme. Self-contained "light island" the same way GC Players / Kit
// Room already run their own light content on an otherwise dark app — see
// architecture.md's theme notes. Purely presentational + controlled: caller
// owns `selected` and does the actual filtering.

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
}

export function DateChipSlider({ groups, selected, onSelect }: DateChipSliderProps) {
  if (groups.length === 0) return null

  return (
    <div
      className="flex gap-2 overflow-x-auto pb-1"
      style={{ scrollbarWidth: 'none' }}
    >
      <button
        onClick={() => onSelect(null)}
        className="flex-shrink-0 font-rajdhani text-sm font-bold px-4 py-2.5 rounded-xl transition-colors"
        style={selected === null
          ? { background: '#D97706', color: '#fff' }
          : { background: '#EEEAE2', border: '1px solid #D4C9B0', color: '#44403C' }}
      >
        All
      </button>

      {groups.map(group => {
        const active = selected === group.key
        const activeStyle = active
          ? { background: '#D97706', color: '#fff' }
          : { background: '#EEEAE2', border: '1px solid #D4C9B0', color: '#1C1917' }
        const mutedColor = active ? 'rgba(255,255,255,0.85)' : '#78716C'

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
    </div>
  )
}
