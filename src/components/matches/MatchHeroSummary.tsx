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

// Same shortening as the squad-selection matrix view (mobileMatrixName in
// CaptainsCornerGrid.tsx): first name + last initial, e.g. "Kushal V.".
function shortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return parts[0] ?? name
  return `${parts[0]} ${parts[parts.length - 1][0]}.`
}

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

// Equal-width column; toss sits left, top scorer centred, best bowler right,
// with the batting-scorecard row-divider colour as the vertical separator.
// Indian ₹1 coin: stainless-steel silver disc, raised rim, inner ring and
// the ₹ / "1" reverse motif. Purely decorative, replaces the 🪙 emoji.
function RupeeCoin({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <radialGradient id="rc-steel" cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#F4F6F8" />
          <stop offset="55%" stopColor="#C3C9D0" />
          <stop offset="100%" stopColor="#8E969F" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="11.5" fill="url(#rc-steel)" stroke="#6B737C" strokeWidth="0.8" />
      <circle cx="12" cy="12" r="9.6" fill="none" stroke="#7A828B" strokeWidth="0.7" strokeDasharray="0.9 0.9" />
      <circle cx="12" cy="12" r="8" fill="none" stroke="#9AA2AB" strokeWidth="0.5" />
      <text x="12" y="10.6" textAnchor="middle" fontSize="6.4" fontWeight="700" fill="#4A525B" fontFamily="system-ui, sans-serif">₹</text>
      <text x="12" y="18" textAnchor="middle" fontSize="8" fontWeight="800" fill="#4A525B" fontFamily="system-ui, sans-serif">1</text>
    </svg>
  )
}

function Cell({ icon, children, label, align, divider }: {
  icon: React.ReactNode; children: React.ReactNode; label?: string
  align: 'left' | 'center' | 'right'; divider?: boolean
}) {
  if (!children) {
    return <div style={{ flex: '1 1 0', borderLeft: divider ? '1px solid var(--scorecard-table-divider)' : undefined }} />
  }
  const justify = align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center'
  return (
    <div style={{
      flex: '1 1 0', minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: justify, gap: '6px',
      padding: '0 8px', textAlign: align,
      borderLeft: divider ? '1px solid var(--scorecard-table-divider)' : undefined,
    }}>
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', maxWidth: '380px', width: '100%', margin: '0 auto' }}>
        <TeamSide name={left.name} innings={left.innings} align="left" />
        <CenterResult line={resultLine} />
        <TeamSide name={right.name} innings={right.innings} align="right" />
      </div>

      {hasBottom && (
        <div style={{ display: 'flex', alignItems: 'stretch', borderTop: '1px solid var(--scorecard-table-divider)', paddingTop: '8px' }}>
          <Cell icon={<RupeeCoin />} align="left">{tossLine}</Cell>
          <Cell icon="🏏" label="Top Scorer" align="center" divider>
            {topBat && (<>
              <div style={{ color: 'var(--fx-accent)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shortName(topBat.name)}</div>
              <div>{topBat.runs} ({topBat.balls})</div>
            </>)}
          </Cell>
          <Cell icon={<BallIcon type={ballType as any} size={16} />} label="Best Bowler" align="right" divider>
            {topBowl && (<>
              <div style={{ color: 'var(--fx-accent)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shortName(topBowl.name)}</div>
              <div>{topBowl.wickets}/{topBowl.runs} ({topBowl.overs} ov)</div>
            </>)}
          </Cell>
        </div>
      )}
    </div>
  )
}
