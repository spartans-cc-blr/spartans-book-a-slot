'use client'
import { useState } from 'react'
import { DateChipSlider, type DateChipGroup } from '@/components/ui/DateChipSlider'

// Wraps the server-rendered weekend groups on /fixtures with a date-chip
// jump bar, without touching FixturesWeekendGroup's own live availability
// state at all. Each weekend group is rendered by the server with a
// `data-dates="YYYY-MM-DD,YYYY-MM-DD"` wrapper (see fixtures/page.tsx) —
// this component just toggles a CSS rule that hides any wrapper whose
// `data-dates` doesn't contain the selected date, via a plain substring
// `*=` attribute selector (safe here since every date token is a fixed
// 10-char ISO string, so it can't accidentally match a different date).
//
// `groups` mirrors the exact same grouping fixtures/page.tsx already uses to
// render one <FixturesWeekendGroup> per group — a Sat/Sun weekend is one
// chip (dates.length === 2), an isolated weekday game is its own chip
// (dates.length === 1). Selecting a group's chip matches on its first date,
// which is always present in that same group's data-dates wrapper, so one
// tap shows the whole weekend rather than just the day that was tapped.
export function FixturesDateFilterBar({ groups }: { groups: DateChipGroup[] }) {
  const [selected, setSelected] = useState<string | null>(null)

  return (
    <>
      {selected && (
        <style>{`[data-dates]:not([data-dates*="${selected}"]) { display: none; }`}</style>
      )}
      <div className="rounded-xl p-3 mb-4" style={{ background: '#F8F4EE', border: '1px solid #D4C9B0' }}>
        <DateChipSlider groups={groups} selected={selected} onSelect={setSelected} />
      </div>
    </>
  )
}
