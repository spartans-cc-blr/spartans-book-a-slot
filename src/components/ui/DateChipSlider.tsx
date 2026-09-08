'use client'

// Shared date-chip picker — Warm Light palette (parchment bg, saturated gold
// accent), matching the reference mockup rather than the app's existing dark
// ink theme. Self-contained "light island" the same way GC Players / Kit
// Room already run their own light content on an otherwise dark app — see
// architecture.md's theme notes. Purely presentational + controlled: caller
// owns `selected` and does the actual filtering.

interface DateChipSliderProps {
  dates:    string[] // sorted ISO game_date strings, e.g. '2026-09-12'
  selected: string | null // null = "All"
  onSelect: (date: string | null) => void
}

function chipParts(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`)
  return {
    dow:   d.toLocaleDateString('en-IN', { weekday: 'short' }).toUpperCase(),
    day:   d.getDate(),
    month: d.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase(),
  }
}

export function DateChipSlider({ dates, selected, onSelect }: DateChipSliderProps) {
  if (dates.length === 0) return null

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

      {dates.map(date => {
        const { dow, day, month } = chipParts(date)
        const active = selected === date
        return (
          <button
            key={date}
            onClick={() => onSelect(active ? null : date)}
            className="flex-shrink-0 w-[58px] flex flex-col items-center justify-center rounded-xl py-1.5 transition-colors"
            style={active
              ? { background: '#D97706', color: '#fff' }
              : { background: '#EEEAE2', border: '1px solid #D4C9B0', color: '#1C1917' }}
          >
            <span className="font-rajdhani text-[10px] font-bold" style={{ color: active ? 'rgba(255,255,255,0.85)' : '#78716C' }}>
              {dow}
            </span>
            <span className="font-rajdhani text-lg font-extrabold leading-tight">{day}</span>
            <span className="font-rajdhani text-[10px] font-bold" style={{ color: active ? 'rgba(255,255,255,0.85)' : '#78716C' }}>
              {month}
            </span>
          </button>
        )
      })}
    </div>
  )
}
