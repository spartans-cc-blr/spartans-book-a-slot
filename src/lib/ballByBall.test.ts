import { describe, it, expect } from 'vitest'
import {
  type BallRow, phaseOf, phaseBounds, phaseRangeLabel, oversForFormat, hasDefinedPhases, formatOvers, ballChip,
  groupOvers, phaseSplit, summariseBatters, summariseBowlers, summariseFielders, wicketRows,
  bowlerRuns, isBowlerWicket, isDotForBowler, isDotForBatters, strikeRate, economy, ballsForSide, howOut, ballLabel, fielderFromText, maxWicketsInOver, derivePartnerships,
} from './ballByBall'

let seq = 0
function ball(over: Partial<BallRow> = {}): BallRow {
  seq += 1
  return {
    batting_side: 'opponent', seq, over_no: 1, ball_in_over: 1, is_legal: true,
    bowler: 'Nagarjun H', batter: 'Anil', outcome: 'no run', runs_bat: 0, extras: 0, extra_type: null,
    runs_total: 0, is_wicket: false, dismissal_kind: null, dismissal_text: null, dismissed_batter: null,
    fielder: null, shot: null, direction: null, score_after: null, wickets_after: null,
    bowler_player_id: null, batter_player_id: null, dismissed_player_id: null, fielder_player_id: null,
    ...over,
  }
}
const resetSeq = () => { seq = 0 }

describe('phases', () => {
  const overs = (total: number) => Array.from({ length: total }, (_, i) => phaseOf(i + 1, total))
  const range = (total: number, phase: string) => {
    const hit = overs(total).map((p, i) => [p, i + 1] as const).filter(([p]) => p === phase).map(([, o]) => o)
    return hit.length ? [hit[0], hit[hit.length - 1]] : null
  }
  it('T20: powerplay 1–6, middle 7–15, death 16–20', () => {
    expect(phaseBounds(20)).toEqual({ ppEnd: 6, deathStart: 16 })
    expect([range(20, 'pp'), range(20, 'mid'), range(20, 'death')]).toEqual([[1, 6], [7, 15], [16, 20]])
    expect(phaseRangeLabel('pp', 20)).toBe('Overs 1–6')
    expect(phaseRangeLabel('mid', 20)).toBe('Overs 7–15')
    expect(phaseRangeLabel('death', 20)).toBe('Overs 16–20')
  })
  it('T30: powerplay 1–8, middle 9–23, death 24–30 (not the T20 phases)', () => {
    expect(phaseBounds(30)).toEqual({ ppEnd: 8, deathStart: 24 })
    expect([range(30, 'pp'), range(30, 'mid'), range(30, 'death')]).toEqual([[1, 8], [9, 23], [24, 30]])
    expect(phaseRangeLabel('pp', 30)).toBe('Overs 1–8')
    expect(phaseRangeLabel('mid', 30)).toBe('Overs 9–23')
    expect(phaseRangeLabel('death', 30)).toBe('Overs 24–30')
  })
  it('the same over lands in different phases in a T20 and a T30', () => {
    expect(phaseOf(7, 20)).toBe('mid')
    expect(phaseOf(7, 30)).toBe('pp')
    expect(phaseOf(16, 20)).toBe('death')
    expect(phaseOf(16, 30)).toBe('mid')
  })
  it('other lengths are scaled from the T20 plan and flagged as such', () => {
    expect(hasDefinedPhases(20)).toBe(true)
    expect(hasDefinedPhases(30)).toBe(true)
    expect(hasDefinedPhases(25)).toBe(false)
    expect(hasDefinedPhases(10)).toBe(false)
    expect(phaseBounds(10)).toEqual({ ppEnd: 3, deathStart: 8 })
    expect(phaseBounds(25)).toEqual({ ppEnd: 8, deathStart: 20 })
    // every over belongs to exactly one phase for any length, and each phase is non-empty
    for (const total of [5, 8, 10, 12, 15, 25, 40, 50]) {
      const ps = overs(total)
      expect(ps).toHaveLength(total)
      expect(new Set(ps).size).toBe(total >= 3 ? 3 : new Set(ps).size)
    }
  })
  it('reads total overs from the format, else the longest over seen', () => {
    expect(oversForFormat('T20', [])).toBe(20)
    expect(oversForFormat('T30', [])).toBe(30)
    expect(oversForFormat(null, [ball({ over_no: 12 })])).toBe(12)
  })
})

describe('helpers', () => {
  it('formats overs and rates', () => {
    expect(formatOvers(24)).toBe('4.0')
    expect(formatOvers(14)).toBe('2.2')
    expect(strikeRate(39, 31)).toBeCloseTo(125.81, 1)
    expect(economy(19, 24)).toBeCloseTo(4.75, 2)
    expect(strikeRate(0, 0)).toBeNull()
    expect(economy(5, 0)).toBeNull()
  })
  it('charges wides and no-balls to the bowler but not byes', () => {
    expect(bowlerRuns(ball({ runs_bat: 4, runs_total: 4 }))).toBe(4)
    expect(bowlerRuns(ball({ extra_type: 'wide', extras: 1, runs_total: 1, is_legal: false }))).toBe(1)
    expect(bowlerRuns(ball({ extra_type: 'bye', extras: 2, runs_total: 2 }))).toBe(0)
    expect(bowlerRuns(ball({ extra_type: 'legbye', extras: 1, runs_total: 1 }))).toBe(0)
  })
  it('does not credit the bowler with run-outs or retirements', () => {
    expect(isBowlerWicket(ball({ is_wicket: true, dismissal_kind: 'Caught out' }))).toBe(true)
    expect(isBowlerWicket(ball({ is_wicket: true, dismissal_kind: 'Stumped' }))).toBe(true)
    expect(isBowlerWicket(ball({ is_wicket: true, dismissal_kind: 'Run out' }))).toBe(false)
    expect(isBowlerWicket(ball({ is_wicket: true, dismissal_kind: 'Retired out' }))).toBe(false)
  })
  it('classifies chips', () => {
    expect(ballChip(ball())).toEqual({ label: '0', kind: 'dot' })
    expect(ballChip(ball({ runs_bat: 1, runs_total: 1 }))).toEqual({ label: '1', kind: 'run' })
    expect(ballChip(ball({ runs_bat: 4, runs_total: 4 }))).toEqual({ label: '4', kind: 'four' })
    expect(ballChip(ball({ runs_bat: 6, runs_total: 6 }))).toEqual({ label: '6', kind: 'six' })
    expect(ballChip(ball({ extra_type: 'wide', extras: 1, runs_total: 1 }))).toEqual({ label: 'wd', kind: 'wide' })
    expect(ballChip(ball({ extra_type: 'wide', extras: 5, runs_total: 5 }))).toEqual({ label: '5wd', kind: 'wide' })
    expect(ballChip(ball({ is_wicket: true }))).toEqual({ label: 'W', kind: 'wicket' })
  })
})

// A small innings: bowler A bowls over 1 (a maiden, with a wicket on ball 3, caught by F1) and
// over 2 (a wide, a four, a six, 1 run, and a run-out). Batters X and Y.
function innings(): BallRow[] {
  resetSeq()
  return [
    ball({ over_no: 1, ball_in_over: 1, bowler: 'A', batter: 'X' }),
    ball({ over_no: 1, ball_in_over: 2, bowler: 'A', batter: 'X' }),
    ball({ over_no: 1, ball_in_over: 3, bowler: 'A', batter: 'X', is_wicket: true, outcome: 'OUT Caught out',
           dismissal_kind: 'Caught out', dismissal_text: 'X c F1 b A', dismissed_batter: 'X', dismissed_player_id: 'px',
           fielder: 'F1', fielder_player_id: 'pf1', score_after: 0, wickets_after: 1 }),
    ball({ over_no: 1, ball_in_over: 4, bowler: 'A', batter: 'Y' }),
    ball({ over_no: 1, ball_in_over: 5, bowler: 'A', batter: 'Y' }),
    ball({ over_no: 1, ball_in_over: 6, bowler: 'A', batter: 'Y' }),
    ball({ over_no: 2, ball_in_over: 1, bowler: 'B', batter: 'Y', extra_type: 'wide', extras: 1, runs_total: 1, is_legal: false, score_after: 1 }),
    ball({ over_no: 2, ball_in_over: 1, bowler: 'B', batter: 'Y', runs_bat: 4, runs_total: 4, score_after: 5 }),
    ball({ over_no: 2, ball_in_over: 2, bowler: 'B', batter: 'Y', runs_bat: 6, runs_total: 6, score_after: 11 }),
    ball({ over_no: 2, ball_in_over: 3, bowler: 'B', batter: 'Y', runs_bat: 1, runs_total: 1, score_after: 12 }),
    ball({ over_no: 2, ball_in_over: 4, bowler: 'B', batter: 'Z', is_wicket: true, runs_bat: 1, runs_total: 1,
           outcome: '1 run, OUT Run out', dismissal_kind: 'Run out', dismissal_text: 'Y run out F2 / F3',
           dismissed_batter: 'Y', fielder: 'F2 / F3', score_after: 13, wickets_after: 2 }),
    ball({ over_no: 2, ball_in_over: 5, bowler: 'B', batter: 'Z', extra_type: 'bye', extras: 2, runs_total: 2, score_after: 15 }),
    ball({ over_no: 2, ball_in_over: 6, bowler: 'B', batter: 'Z' }),
  ]
}

describe('overs', () => {
  it('groups by over with runs, wickets, legal balls, bowlers and batters', () => {
    const overs = groupOvers(innings())
    expect(overs.map(o => o.over_no)).toEqual([1, 2])
    expect(overs[0]).toMatchObject({ runs: 0, wickets: 1, legalBalls: 6, bowlers: ['A'], batters: ['X', 'Y'] })
    expect(overs[1]).toMatchObject({ runs: 15, wickets: 1, legalBalls: 6, bowlers: ['B'] })
    expect(overs[1].balls).toHaveLength(7) // the wide is an extra delivery
  })
})

describe('phase split', () => {
  it('adds up to the innings', () => {
    const lines = phaseSplit(innings(), 20)
    expect(lines.reduce((s, l) => s + l.runs, 0)).toBe(15)
    expect(lines.reduce((s, l) => s + l.wickets, 0)).toBe(2)
    expect(lines[0]).toMatchObject({ phase: 'pp', runs: 15, wickets: 2, legalBalls: 12 })
    expect(lines[1].runRate).toBeNull()
  })
})

describe('batters', () => {
  const rows = innings().map(b => ({ ...b, batting_side: 'spartans' as const }))
  const lines = summariseBatters(rows, 20)
  it('balls faced exclude wides and are in batting order', () => {
    expect(lines.map(l => l.name)).toEqual(['X', 'Y', 'Z'])
    const y = lines.find(l => l.name === 'Y')!
    expect(y.balls).toBe(6)          // 3 legal in over 1 + (4, 6, 1) in over 2; the wide is not faced
    expect(y.runs).toBe(11)
    expect(y.fours).toBe(1)
    expect(y.sixes).toBe(1)
    expect(y.boundaryRuns).toBe(10)
    expect(y.dots).toBe(3)
    expect(y.strikeRate).toBeCloseTo((11 / 6) * 100, 5)
  })
  it('records how a batter was out, including a non-striker run out', () => {
    expect(lines.find(l => l.name === 'X')!.out).toEqual({ kind: 'Caught out', text: 'X c F1 b A' })
    expect(lines.find(l => l.name === 'Y')!.out?.kind).toBe('Run out')
    expect(lines.find(l => l.name === 'Z')!.out).toBeNull()
  })
  it('merges a batter seen with and without a Hub id into one row, keeping the id', () => {
    const x = lines.find(l => l.name === 'X')!
    expect(lines.filter(l => l.name === 'X')).toHaveLength(1)
    expect(x.playerId).toBe('px')   // only the dismissal row carries it in this fixture
  })
  it('splits runs by phase', () => {
    const y = lines.find(l => l.name === 'Y')!
    expect(y.byPhase.pp).toEqual({ runs: 11, balls: 6 })
    expect(y.byPhase.death).toEqual({ runs: 0, balls: 0 })
  })
  it('a batter dismissed without facing a ball still gets a row', () => {
    resetSeq()
    const only = [ball({ batting_side: 'spartans', batter: 'S', is_wicket: true, dismissed_batter: 'NS',
                         dismissal_kind: 'Run out', dismissal_text: 'NS run out' })]
    const l = summariseBatters(only, 20)
    expect(l.map(x => x.name).sort()).toEqual(['NS', 'S'])
    expect(l.find(x => x.name === 'NS')!.out?.kind).toBe('Run out')
  })
})

describe('bowlers', () => {
  const lines = summariseBowlers(innings(), 20)
  it('matches scorecard conventions', () => {
    const a = lines.find(l => l.name === 'A')!
    expect(a).toMatchObject({ legalBalls: 6, runs: 0, wickets: 1, dots: 6, maidens: 1 })
    expect(a.economy).toBe(0)
    const b = lines.find(l => l.name === 'B')!
    // bat runs 4+6+1+1, wide 1 charged, bye 2 not charged
    expect(b).toMatchObject({ legalBalls: 6, runs: 13, wickets: 0, wides: 1, fours: 1, sixes: 1, maidens: 0 })
    expect(b.dots).toBe(2)           // the final 0, and the bye: nothing was charged to the bowler
    expect(b.economy).toBeCloseTo(13, 5)
  })
  it('splits by phase and keeps first-bowled order', () => {
    expect(lines.map(l => l.name)).toEqual(['A', 'B'])
    expect(lines[0].byPhase.pp).toEqual({ legalBalls: 6, runs: 0, wickets: 1 })
  })
  it('a name containing a pipe or comma does not break maiden bookkeeping', () => {
    resetSeq()
    const odd = Array.from({ length: 6 }, (_, i) => ball({ bowler: 'A|B, C', over_no: 1, ball_in_over: i + 1 }))
    expect(summariseBowlers(odd, 20)[0].maidens).toBe(1)
  })
})

describe('fielding', () => {
  const lines = summariseFielders(innings())
  it('counts catches and credits both names on an assisted run-out', () => {
    const f1 = lines.find(l => l.name === 'F1')!
    expect(f1).toMatchObject({ catches: 1, total: 1, playerId: 'pf1' })
    expect(lines.find(l => l.name === 'F2')).toMatchObject({ runOuts: 1, total: 1, playerId: null })
    expect(lines.find(l => l.name === 'F3')).toMatchObject({ runOuts: 1, total: 1 })
  })
  it('separates catches, caught-behind and stumpings', () => {
    resetSeq()
    const rows = [
      ball({ is_wicket: true, dismissal_kind: 'Caught out', fielder: 'K' }),
      ball({ is_wicket: true, dismissal_kind: 'Caught behind', fielder: 'K' }),
      ball({ is_wicket: true, dismissal_kind: 'Stumped', fielder: 'K' }),
    ]
    expect(summariseFielders(rows)[0]).toMatchObject({ name: 'K', catches: 1, caughtBehind: 1, stumpings: 1, total: 3 })
  })
  it('ignores bowled/lbw (no fielder)', () => {
    resetSeq()
    expect(summariseFielders([ball({ is_wicket: true, dismissal_kind: 'Bowled', fielder: null })])).toEqual([])
  })
})

describe('wicket rows', () => {
  it('labels balls the way CricHeroes does and marks run-outs as not the bowler\'s', () => {
    const w = wicketRows(innings())
    expect(w).toHaveLength(2)
    expect(w[0]).toMatchObject({ overLabel: '0.3', batter: 'X', kind: 'Caught out', bowler: 'A', bowlerCredited: true, fielder: 'F1' })
    expect(w[1]).toMatchObject({ overLabel: '1.4', batter: 'Y', bowlerCredited: false })
    expect(wicketRows([ball({ over_no: 3, ball_in_over: 6, is_wicket: true })])[0].overLabel).toBe('3.0')
  })
})

describe('ballsForSide', () => {
  it('filters by batting side', () => {
    resetSeq()
    const rows = [ball({ batting_side: 'spartans' }), ball({ batting_side: 'opponent' }), ball({ batting_side: 'opponent' })]
    expect(ballsForSide(rows, 'opponent')).toHaveLength(2)
  })
})

describe('howOut', () => {
  it('strips the batter name and the trailing figures', () => {
    expect(howOut('Aashish Kumar', 'Aashish Kumar c Darshan Shetty b Shabarinath (12r 7b 1x4s 1x6s SR: 171.43)', 'Caught out'))
      .toBe('c Darshan Shetty b Shabarinath')
    expect(howOut('Vipul', 'Vipul c †Muthukumar R b Nagarjun H (17r 11b 3x4s 0x6s SR: 154.55)', 'Caught behind'))
      .toBe('c †Muthukumar R b Nagarjun H')
    expect(howOut('Siva', 'Siva run out Rahul Shetty / Ankur Gupta (27r 20b 2x4s 0x6s SR: 135.00)', 'Run out'))
      .toBe('run out Rahul Shetty / Ankur Gupta')
  })
  it('falls back to the kind, then to "out"', () => {
    expect(howOut('X', null, 'Bowled')).toBe('Bowled')
    expect(howOut('X', null, null)).toBe('out')
  })
})

describe('ballLabel', () => {
  it('uses CricHeroes labels: 0.1 is the first ball, 3.0 the sixth ball of over 3', () => {
    expect(ballLabel({ over_no: 1, ball_in_over: 1 })).toBe('0.1')
    expect(ballLabel({ over_no: 3, ball_in_over: 6 })).toBe('3.0')
    expect(ballLabel({ over_no: 14, ball_in_over: 4 })).toBe('13.4')
  })
})

describe('fielderFromText', () => {
  it('reads the fielder out of the dismissal line', () => {
    expect(fielderFromText('Abhishek (AB12) st †Muthukumar R b Shabarinath (1r 2b 0x4s 0x6s SR: 50.00)', 'Shabarinath')).toBe('Muthukumar R')
    expect(fielderFromText('Sagar M c †Muthukumar R b Nagarjun H (0r 1b 0x4s 0x6s SR: 0.00)', 'Nagarjun H')).toBe('Muthukumar R')
    expect(fielderFromText('Anil c Sagar b Uday (4r 5b 0x4s 0x6s SR: 80.00)', 'Uday')).toBe('Sagar')
    expect(fielderFromText('Rahul c & b Uday (1r 1b 0x4s 0x6s SR: 100)', 'Uday')).toBe('Uday')
    expect(fielderFromText('Siva run out Rahul Shetty / Ankur Gupta (27r 20b 2x4s 0x6s SR: 135.00)', 'X')).toBe('Rahul Shetty / Ankur Gupta')
  })
  it('is null for bowled / lbw / no line', () => {
    expect(fielderFromText('Sudarshan Bhat b Rahul Shetty (37r 28b 5x4s 0x6s SR: 132.14)', 'Rahul Shetty')).toBeNull()
    expect(fielderFromText('X lbw b Y (1r 1b 0x4s 0x6s SR: 100)', 'Y')).toBeNull()
    expect(fielderFromText(null, 'Y')).toBeNull()
  })
  it('counts a stumping for the keeper when the fielder field is empty (older uploads)', () => {
    resetSeq()
    const rows = [ball({ is_wicket: true, dismissal_kind: 'Stumped', fielder: null,
      dismissal_text: 'Abhishek st †Muthukumar R b Shabarinath (1r 2b 0x4s 0x6s SR: 50.00)' })]
    expect(summariseFielders(rows)[0]).toMatchObject({ name: 'Muthukumar R', stumpings: 1, total: 1 })
    expect(wicketRows(rows)[0].fielder).toBe('Muthukumar R')
  })
})

describe('maxWicketsInOver', () => {
  it('is the busiest over, and at least 1 so an over with no wickets still reserves a row', () => {
    expect(maxWicketsInOver([{ wickets: 0 }, { wickets: 2 }, { wickets: 1 }])).toBe(2)
    expect(maxWicketsInOver([{ wickets: 0 }])).toBe(1)
    expect(maxWicketsInOver([])).toBe(1)
  })
  it('matches what groupOvers reports for an over with two wickets', () => {
    resetSeq()
    const rows = [
      ball({ over_no: 5, ball_in_over: 5, is_wicket: true }),
      ball({ over_no: 5, ball_in_over: 6, is_wicket: true }),
      ball({ over_no: 6, ball_in_over: 1 }),
    ]
    expect(groupOvers(rows).map(o => o.wickets)).toEqual([2, 0])
    expect(maxWicketsInOver(groupOvers(rows))).toBe(2)
  })
})

describe('dot balls', () => {
  const bye = ball({ extra_type: 'bye', extras: 2, runs_total: 2 })
  const legBye = ball({ extra_type: 'legbye', extras: 1, runs_total: 1 })
  const wide = ball({ extra_type: 'wide', extras: 1, runs_total: 1, is_legal: false })
  const single = ball({ runs_bat: 1, runs_total: 1 })
  const dot = ball()

  it('a bye or leg-bye is a dot for the bowler (nothing charged) and for the batters (nothing off the bat)', () => {
    for (const b of [bye, legBye]) {
      expect(isDotForBowler(b)).toBe(true)
      expect(isDotForBatters(b)).toBe(true)
    }
  })
  it('a wide is never a dot, and runs off the bat are not', () => {
    expect(isDotForBowler(wide)).toBe(false)
    expect(isDotForBatters(wide)).toBe(false)
    expect(isDotForBowler(single)).toBe(false)
    expect(isDotForBatters(single)).toBe(false)
    expect(isDotForBowler(dot)).toBe(true)
  })
  it('the phase split counts dots from the perspective of the tab', () => {
    const rows = [bye, dot, single, wide]
    const pp = (perspective: 'bat' | 'bowl') => phaseSplit(rows, 20, perspective)[0]
    expect(pp('bowl')).toMatchObject({ legalBalls: 3, dots: 2 })
    expect(pp('bat')).toMatchObject({ legalBalls: 3, dots: 2 })
    // a no-ball with 2 off the bat: charged to the bowler, but it is not a legal ball either way
    expect(isDotForBowler(ball({ extra_type: 'noball', extras: 1, runs_bat: 2, runs_total: 3, is_legal: false }))).toBe(false)
  })
})

describe('derivePartnerships', () => {
  const b = (batter: string, runs: number, extra: Partial<BallRow> = {}) =>
    ball({ batting_side: 'spartans', batter, runs_bat: runs, runs_total: runs, ...extra })

  it('splits an innings into stands, carrying the survivor forward', () => {
    resetSeq()
    const rows = [
      b('A', 4), b('A', 1), b('B', 2), b('B', 0, { extras: 1, extra_type: 'wide', runs_total: 1, is_legal: false }),
      b('B', 0, { is_wicket: true, dismissed_batter: 'B', dismissal_kind: 'bowled' }),   // B out
      b('A', 6), b('C', 1), b('C', 0, { is_wicket: true, dismissed_batter: 'A', dismissal_kind: 'caught' }),  // A out
      b('C', 3), b('D', 1),
    ]
    const s = derivePartnerships(rows)
    expect(s).toHaveLength(3)
    expect(s[0]).toMatchObject({ wicket: 1, runs: 8, balls: 4, startScore: 0, endScore: 8, endWkts: 1, outBatter: 'B' })
    expect(s[0].batters.map(x => x && [x.name, x.runs, x.balls])).toEqual([['A', 5, 2], ['B', 2, 2]])
    expect(s[1].batters.map(x => x && x.name)).toEqual(['A', 'C'])
    expect(s[1]).toMatchObject({ runs: 7, startScore: 8, startWkts: 1, startBalls: 4, endScore: 15, endWkts: 2, outBatter: 'A' })
    // the survivor C leads the last stand and it is unbroken
    expect(s[2].batters.map(x => x && x.name)).toEqual(['C', 'D'])
    expect(s[2]).toMatchObject({ runs: 4, outBatter: null, endBalls: 9 })
    // every run is in exactly one stand
    expect(s.reduce((n, x) => n + x.runs, 0)).toBe(rows.reduce((n, r) => n + r.runs_total, 0))
  })

  it('names a partner who never faced from the rest of the order', () => {
    resetSeq()
    const rows = [b('A', 2), b('A', 1)]
    const s = derivePartnerships(rows, ['Z'])
    expect(s[0].batters[1]).toMatchObject({ name: 'Z', runs: 0, balls: 0 })
  })

  it('returns nothing for an empty innings', () => {
    expect(derivePartnerships([])).toEqual([])
  })
})
