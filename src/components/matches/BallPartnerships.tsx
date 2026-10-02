'use client'

// Partnerships for a Spartans innings rebuilt from ball-by-ball: each stand shows both
// batters' runs (balls), the stand total, and a bar split between the two. Tapping a stand
// opens it to show the score and overs where it began and ended; closed by default.
// Shown in place of the Fall-of-Wickets partnership bars only on matches with commentary.

import { useState } from 'react'
import { derivePartnerships, formatOvers, type BallRow, type Stand, type StandBatter } from '@/lib/ballByBall'

const ORDINAL = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th']

function BatterSide({ b, align }: { b: StandBatter | null; align: 'left' | 'right' }) {
  const cls = align === 'left' ? 'text-left' : 'text-right'
  if (!b) return <div className={`${cls} min-w-0 text-[var(--scorecard-text-faint)]`}>—</div>
  return (
    <div className={`${cls} min-w-0`}>
      <div className="truncate text-[var(--scorecard-heading-text)] font-semibold">{b.name}</div>
      <div className="tabular-nums text-[var(--scorecard-text-2)]">
        <span className="text-sm font-bold">{b.runs}</span>
        <span className="text-[var(--scorecard-text-faint)]"> ({b.balls})</span>
      </div>
    </div>
  )
}

/** Two bars growing outwards from the centre line, each scaled against the biggest single contribution. */
function SplitBar({ a, b, max }: { a: number; b: number; max: number }) {
  const w = (n: number) => (max > 0 ? Math.min(50, (n / max) * 50) : 0)
  return (
    <div className="relative mt-2 h-1.5 w-full rounded-full bg-[var(--scorecard-divider)] overflow-hidden" aria-hidden>
      <div className="absolute inset-y-0 rounded-l-full bg-crimson" style={{ right: '50%', width: `${w(a)}%`, minWidth: a > 0 ? 2 : 0 }} />
      <div className="absolute inset-y-0 rounded-r-full bg-teal-500" style={{ left: '50%', width: `${w(b)}%`, minWidth: b > 0 ? 2 : 0 }} />
    </div>
  )
}

function Point({ label, score, wkts, balls, align }: { label: string; score: number; wkts: number; balls: number; align: 'left' | 'right' }) {
  return (
    <div className={`flex-1 rounded-md bg-[var(--scorecard-table-bg)] px-3 py-2 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <div className="text-[10px] uppercase tracking-wide text-[var(--scorecard-text-faint)]">{label}</div>
      <div className="font-bold text-[var(--scorecard-heading-text)] tabular-nums">
        {score}/{wkts} <span className="text-xs font-normal text-[var(--scorecard-text-faint)]">{formatOvers(balls)} ov</span>
      </div>
    </div>
  )
}

function StandRow({ s, max, bookingKey }: { s: Stand; max: number; bookingKey: string }) {
  const [open, setOpen] = useState(false)
  const [a, b] = s.batters
  const panelId = `stand-${bookingKey}-${s.wicket}`
  return (
    <li>
      <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(o => !o)}
        className={`w-full text-left rounded-lg px-2 py-2 transition-colors hover:bg-[var(--scorecard-divider)]/30 ${open ? 'bg-[var(--scorecard-divider)]/40' : ''}`}>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <BatterSide b={a} align="left" />
          <div className="text-center tabular-nums">
            <div className="text-[10px] uppercase tracking-wide text-[var(--scorecard-text-faint)]">{ORDINAL[s.wicket] ?? `${s.wicket}th`} wkt</div>
            <div className="text-lg font-bold text-[var(--scorecard-heading-text)] leading-none">{s.runs}{s.outBatter == null && '*'}</div>
            <div className="text-[var(--scorecard-text-faint)]">({s.balls})</div>
          </div>
          <BatterSide b={b} align="right" />
        </div>
        <SplitBar a={a?.runs ?? 0} b={b?.runs ?? 0} max={max} />
      </button>
      {open && (
        <div id={panelId} className="mt-2 px-2 flex items-center gap-2">
          <Point label="Start" score={s.startScore} wkts={s.startWkts} balls={s.startBalls} align="left" />
          <span aria-hidden className="text-[var(--scorecard-text-faint)]">›</span>
          <Point label="End" score={s.endScore} wkts={s.endWkts} balls={s.endBalls} align="right" />
        </div>
      )}
    </li>
  )
}

/** `restOfOrder`: batters in batting order, so a partner who never faced a ball can still be named. */
export function BallPartnerships({ balls, restOfOrder, bookingKey = '' }: { balls: BallRow[]; restOfOrder: string[]; bookingKey?: string }) {
  const stands = derivePartnerships(balls, restOfOrder)
  if (stands.length === 0) return null

  const max = stands.reduce((m, s) => Math.max(m, s.batters[0]?.runs ?? 0, s.batters[1]?.runs ?? 0), 0)

  return (
    <div>
      <p className="font-rajdhani text-xs font-bold tracking-widest uppercase text-[var(--scorecard-text-faint)] mb-2">Partnerships</p>
      <ul className="space-y-1 font-rajdhani text-xs">
        {stands.map(s => <StandRow key={s.wicket} s={s} max={max} bookingKey={bookingKey} />)}
      </ul>
    </div>
  )
}
