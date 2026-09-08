'use client'
import { useState } from 'react'
import { DateChipSlider } from '@/components/ui/DateChipSlider'

// Wraps the server-rendered weekend groups on /fixtures with a date-chip
// jump bar, without touching FixturesWeekendGroup's own live availability
// state at all. Each weekend group is rendered by the server with a
// `data-dates="YYYY-MM-DD,YYYY-MM-DD"` wrapper (see fixtures/page.tsx) —
// this component just toggles a CSS rule that hides any wrapper whose
// `data-dates` doesn't contain the selected date, via a plain substring
// `*=` attribute selector (safe here since every date token is a fixed
// 10-char ISO string, so it can't accidentally match a different date).
//
// Deliberately a "jump to this weekend" control, not a "hide the other
// day's game" one: a Sat/Sun weekend group shares one OYE validation state
// by design (see player-availability.md), so selecting one day of a
// weekend still shows both days of that same group — only an isolated
// weekday game (its own group) ever appears alone.
export function FixturesDateFilterBar({ dates }: { dates: string[] }) {
  const [selected, setSelected] = useState<string | null>(null)

  return (
    <>
      {selected && (
        <style>{`[data-dates]:not([data-dates*="${selected}"]) { display: none; }`}</style>
      )}
      <div className="rounded-xl p-3 mb-4" style={{ background: '#F8F4EE', border: '1px solid #D4C9B0' }}>
        <DateChipSlider dates={dates} selected={selected} onSelect={setSelected} />
      </div>
    </>
  )
}
