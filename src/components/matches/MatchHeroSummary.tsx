// No 'use client' — plain, stateless; safe from both the Server Component
// standalone match page and the Client Component MatchHistoryCard.
//
// Result-strip "hero": the team that batted first on the left, the team that
// batted second on the right, and a WON/LOST/TIED pill (plus margin) between
// them — followed by a toss / top scorer / best bowler row. Replaces the
// stacked toss line + score line + result badge + top-bat/bowl line. See
// features/post-match-scorecard.md §17.8.

import type { ResultLine } from '@/lib/matchResultDisplay'
import { BallIcon } from '@/components/matches/BallIcon'

type Innings = { total: number | null; wickets: number | null; overs: number | null }

function scoreText(i: Innings): string {
  if (i.total == null) return '—'
  return i.wickets != null ? `${i.total}/${i.wickets}` : `${i.total}`
}

function TeamSide({ name, innings, align }: { name: string; innings: Innings; align: 'left' | 'right' }) {
  return (
    <div style={{ flex: 1, minWidth: 0, textAlign: align }}>
      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--scorecard-text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {name}
      </div>
      <div style={{ fontSize: '20px', fontWeight: 700, lineHeight: 1.15, color: 'var(--scorecard-heading-text)', fontVariantNumeric: 'tabular-nums' }}>
        {scoreText(innings)}
      </div>
      {innings.overs != null && (
        <div style={{ fontSize: '10px', color: 'var(--scorecard-text-faint)' }}>({innings.overs} ov)</div>
      )}
    </div>
  )
}

const PILL: Record<string, string> = {
  won: 'bg-emerald-600 text-white',
  lost: 'bg-red-600 text-white',
  tied: 'bg-amber-600 text-white',
}

function CenterResult({ line }: { line: ResultLine | null }) {
  if (!line) return <div style={{ width: '64px', flexShrink: 0 }} />
  return (
    <div style={{ flexShrink: 0, maxWidth: '38%', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
      <span className={`inline-block text-[10px] font-bold px-2.5 py-0.5 rounded-full ${(line.kind && PILL[line.kind]) || 'bg-stone-400 text-white'}`}>
        {line.word}
      </span>
      {line.marginText && (
        <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--scorecard-text-muted)' }}>{line.marginText}</span>
      )}
    </div>
  )
}

function Cell({ icon, children, label }: { icon: React.ReactNode; children: React.ReactNode; label?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
      <span style={{ fontSize: '16px', lineHeight: 1, flexShrink: 0, display: 'inline-flex' }}>{icon}</span>
      <div style={{ minWidth: 0, fontSize: '10px', lineHeight: 1.3, color: 'var(--scorecard-text-muted)' }}>
        {children}
        {label && <div style={{ color: 'var(--scorecard-text-faint)' }}>{label}</div>}
      </div>
    </div>
  )
}

export function MatchHeroSummary({
  battedFirst, ourName = 'Spartans CC', opponentName,
  own, opp, resultLine, tossLine, topBat, topBowl, ballType,
}: {
  battedFirst: boolean | null
  ourName?: string
  opponentName: string | null | undefined
  own: Innings
  opp: Innings
  resultLine: ResultLine | null
  tossLine: string | null
  topBat: { name: string; runs: number; balls: number } | null | undefined
  topBowl: { name: string; wickets: number; runs: number; overs: number } | null | undefined
  ballType: 'red' | 'white' | 'pink' | string
}) {
  const oppName = opponentName || 'Opponent'
  // Batting order decides the sides; unknown toss keeps Spartans on the left.
  const ownFirst = battedFirst !== false
  const left  = ownFirst ? { name: ourName, innings: own } : { name: oppName, innings: opp }
  const right = ownFirst ? { name: oppName, innings: opp } : { name: ourName, innings: own }
  const hasBottom = tossLine || topBat || topBowl

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <TeamSide name={left.name} innings={left.innings} align="left" />
        <CenterResult line={resultLine} />
        <TeamSide name={right.name} innings={right.innings} align="right" />
      </div>

      {hasBottom && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', borderTop: '1px solid var(--scorecard-divider)', paddingTop: '8px' }}>
          {tossLine && <Cell icon="🪙">{tossLine}</Cell>}
          {topBat && (
            <Cell icon="🏏" label="Top Scorer">
              <div style={{ color: 'var(--fx-accent)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{topBat.name}</div>
              <div>{topBat.runs} ({topBat.balls})</div>
            </Cell>
          )}
          {topBowl && (
            <Cell icon={<BallIcon type={ballType as any} size={16} />} label="Best Bowler">
              <div style={{ color: 'var(--fx-accent)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{topBowl.name}</div>
              <div>{topBowl.wickets}/{topBowl.runs} ({topBowl.overs} ov)</div>
            </Cell>
          )}
        </div>
      )}
    </div>
  )
}
