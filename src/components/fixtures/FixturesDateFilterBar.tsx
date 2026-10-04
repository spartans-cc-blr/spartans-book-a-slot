'use client'
import { useMemo, useState } from 'react'
import { DateChipSlider, type DateChipGroup } from '@/components/ui/DateChipSlider'
import { MonthStepper, distinctMonths, monthOfDate } from '@/components/ui/MonthStepper'

// Wraps the server-rendered weekend groups on /fixtures with a month stepper
// and a date-chip jump bar, without touching FixturesWeekendGroup's own live
// availability state at all. Each weekend group is rendered by the server
// with a `data-dates="YYYY-MM-DD,YYYY-MM-DD"` wrapper (see fixtures/page.tsx)
// — this component just toggles CSS rules that hide any wrapper whose
// `data-dates` doesn't contain the selected date (chip) or any date in the
// selected month (stepper), via plain substring `*=` attribute selectors
// (safe here since every date token is a fixed 10-char ISO string, so
// `2026-10-` can only match the start of an October token).
//
// `groups` mirrors the exact same grouping fixtures/page.tsx already uses to
// render one <FixturesWeekendGroup> per group — a Sat/Sun weekend is one
// chip (dates.length === 2), an isolated weekday game is its own chip
// (dates.length === 1). Selecting a group's chip matches on its first date,
// which is always present in that same group's data-dates wrapper, so one
// tap shows the whole weekend rather than just the day that was tapped.
//
// A weekend straddling a month boundary (Sat 31 Oct + Sun 1 Nov) belongs to
// both months — the month rule keeps a group if ANY of its dates is in the
// month, which is also how the chip row below is narrowed.
export function FixturesDateFilterBar({ groups }: { groups: DateChipGroup[] }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [month, setMonth] = useState('') // '' = All time

  const months = useMemo(() => distinctMonths(groups.flatMap(g => g.dates)), [groups])
  const visibleGroups = useMemo(
    () => month ? groups.filter(g => g.dates.some(d => monthOfDate(d) === month)) : groups,
    [groups, month],
  )

  function changeMonth(next: string) {
    setMonth(next)
    setSelected(null) // a chip from the previous month can't still be selected
  }

  return (
    <>
      {month && !selected && (
        <style>{`[data-dates]:not([data-dates*="${month}-"]) { display: none; }`}</style>
      )}
      {selected && (
        <style>{`[data-dates]:not([data-dates*="${selected}"]) { display: none; }`}</style>
      )}
      <div className="rounded-xl p-3 mb-4" style={{ background: 'var(--fx-shell-bg)', border: '1px solid var(--fx-border)' }}>
        <MonthStepper months={months} value={month} onChange={changeMonth} />
        <DateChipSlider groups={visibleGroups} selected={selected} onSelect={setSelected} />
      </div>
    </>
  )
}
