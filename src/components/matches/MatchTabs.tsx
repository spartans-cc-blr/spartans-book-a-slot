'use client'

// The scorecard area of a match: the existing Full Scorecard plus, when
// ball-by-ball commentary has been uploaded for the match, Batting / Bowling /
// Fielding / Commentary tabs built from it (see features/ball-by-ball-tabs.md).
//
// Matches without commentary render the plain scorecard exactly as before, with
// no tab bar: the commentary is fetched once on mount and the tabs only appear
// when it exists. Used inside the collapsible SCORECARD panel on /matches/history
// (so it only fetches once that panel is opened) and on the single-match page.

import { useEffect, useRef, useState, type ComponentProps, type KeyboardEvent } from 'react'
import { ScorecardTables } from '@/components/matches/ScorecardTables'
import { BattingView, BowlingView, CommentaryView, FieldingView } from '@/components/matches/BallByBallViews'
import { oversForFormat, type BallRow } from '@/lib/ballByBall'

type ScorecardProps = ComponentProps<typeof ScorecardTables>

type TabKey = 'scorecard' | 'batting' | 'bowling' | 'fielding' | 'commentary'
const TABS: { key: TabKey; label: string }[] = [
  { key: 'scorecard', label: 'Full Scorecard' },
  { key: 'batting', label: 'Batting' },
  { key: 'bowling', label: 'Bowling' },
  { key: 'fielding', label: 'Fielding' },
  { key: 'commentary', label: 'Commentary' },
]

export function MatchTabs({ bookingId, format, ...scorecard }: { bookingId: string; format: string | null } & ScorecardProps) {
  const [balls, setBalls] = useState<BallRow[] | null>(null)   // null = none (yet)
  const [tab, setTab] = useState<TabKey>('scorecard')
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  useEffect(() => {
    let cancelled = false
    fetch(`/api/matches/history/${bookingId}/commentary`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (!cancelled && data?.available && Array.isArray(data.balls)) setBalls(data.balls) })
      .catch(() => { /* ball-by-ball is optional; the plain scorecard stays */ })
    return () => { cancelled = true }
  }, [bookingId])

  if (!balls) return <ScorecardTables {...scorecard} />

  const totalOvers = oversForFormat(format, balls)

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const i = TABS.findIndex(t => t.key === tab)
    let next = i
    if (e.key === 'ArrowRight') next = (i + 1) % TABS.length
    else if (e.key === 'ArrowLeft') next = (i - 1 + TABS.length) % TABS.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = TABS.length - 1
    else return
    e.preventDefault()
    setTab(TABS[next].key)
    tabRefs.current[TABS[next].key]?.focus()
  }

  return (
    <div>
      <div role="tablist" aria-label="Match views" onKeyDown={onKeyDown}
        className="flex gap-5 overflow-x-auto border-b border-[var(--scorecard-table-border)] mb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map(t => {
          const active = t.key === tab
          return (
            <button key={t.key} role="tab" type="button"
              id={`match-tab-${bookingId}-${t.key}`}
              aria-selected={active} aria-controls={`match-panel-${bookingId}`}
              tabIndex={active ? 0 : -1}
              ref={el => { tabRefs.current[t.key] = el }}
              onClick={() => setTab(t.key)}
              className={`font-rajdhani text-xs font-bold tracking-wide uppercase whitespace-nowrap pb-2 -mb-px border-b-2 transition-colors
                ${active
                  ? 'border-[var(--fx-accent)] text-[var(--fx-accent)]'
                  : 'border-transparent text-[var(--scorecard-text-faint)] hover:text-[var(--scorecard-heading-text)]'}`}>
              {t.label}
            </button>
          )
        })}
      </div>

      <div role="tabpanel" id={`match-panel-${bookingId}`} aria-labelledby={`match-tab-${bookingId}-${tab}`}>
        {tab === 'scorecard' && <ScorecardTables {...scorecard} />}
        {tab === 'batting' && <BattingView balls={balls} totalOvers={totalOvers} />}
        {tab === 'bowling' && <BowlingView balls={balls} totalOvers={totalOvers} />}
        {tab === 'fielding' && <FieldingView balls={balls} />}
        {tab === 'commentary' && <CommentaryView balls={balls} />}
      </div>
    </div>
  )
}
