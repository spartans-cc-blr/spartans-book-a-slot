import { describe, it, expect } from 'vitest'
import { computePartnerships } from './partnerships'

// Minimal batting_stats-shaped rows — batting_order 1..N, everyone batted.
function battingOrder(names: string[]) {
  return names.map((player_name, i) => ({
    player_name,
    batting_order: i + 1,
    player_id: null,
    batted: true,
    dismissal_method: 'out',
  }))
}

describe('computePartnerships — retired hurt and return', () => {
  // Real match 25465218 (4 Jul 2026, Spartans CC Bengaluru vs Bangalore
  // Bolsters, Lakedew Green Park Champions Trophy 2026) — 282/9. Anurag T
  // retired hurt at 118 (partnership 20 with Siva), Tushar Shankar and Siva
  // added 128, then Anurag T returned to bat with Tushar, and was later
  // properly dismissed. Verified against the real CricHeroes PDF. See
  // features/partnerships.md §4.4.
  const order = battingOrder([
    'Loki', 'Saurav Kalsoor', 'Shivashankara GS', 'Anurag T', 'Siva',
    'Tushar Shankar', 'Darshan Shetty', 'Ramesh Shanmugamoorthy',
    'Manohar B Reddy', 'Preetam Patil',
  ])
  const fow = [
    { wicket_number: 1, team_score: 76, over: 6.3, player_name: 'Loki' },
    { wicket_number: 2, team_score: 76, over: 6.4, player_name: 'Shivashankara GS' },
    { wicket_number: 3, team_score: 98, over: 8.4, player_name: 'Saurav Kalsoor' },
    { wicket_number: 4, team_score: 118, over: 10.3, player_name: 'Anurag T', is_retirement: true },
    { wicket_number: 5, team_score: 246, over: 24.2, player_name: 'Siva', returning_player_name: 'Anurag T' },
    { wicket_number: 6, team_score: 261, over: 26.2, player_name: 'Tushar Shankar' },
    { wicket_number: 7, team_score: 262, over: 27, player_name: 'Anurag T' },
    { wicket_number: 8, team_score: 262, over: 27.1, player_name: 'Darshan Shetty' },
    { wicket_number: 9, team_score: 266, over: 28, player_name: 'Ramesh Shanmugamoorthy' },
    { wicket_number: 10, team_score: 282, over: 30, player_name: 'Preetam Patil' },
  ]
  const finalScore = { total: 282, overs: 30, wickets: 9 }

  it('produces all 10 rows (9 real wickets + 1 retirement), summing to the real total', () => {
    const partnerships = computePartnerships(order, fow, finalScore)
    expect(partnerships).not.toBeNull()
    expect(partnerships).toHaveLength(10)
    expect(partnerships!.reduce((sum, p) => sum + p.runs, 0)).toBe(282)
  })

  it('the retirement row is flagged and does not end the innings', () => {
    const partnerships = computePartnerships(order, fow, finalScore)!
    const retirement = partnerships.find(p => p.wicketNumber === 4)!
    expect(retirement.isRetirement).toBe(true)
    expect(retirement.runs).toBe(20)
    expect(retirement.players.map(p => p.playerName).sort()).toEqual(['Anurag T', 'Siva'].sort())
    expect(retirement.outPlayer?.playerName).toBe('Anurag T')
  })

  it('brings in the next batting-order player (Tushar Shankar) immediately after the retirement', () => {
    const partnerships = computePartnerships(order, fow, finalScore)!
    const p5 = partnerships.find(p => p.wicketNumber === 5)!
    expect(p5.runs).toBe(128)
    expect(p5.isRetirement).toBe(false)
    expect(p5.players.map(p => p.playerName).sort()).toEqual(['Siva', 'Tushar Shankar'].sort())
    expect(p5.outPlayer?.playerName).toBe('Siva')
  })

  it('re-seats the returning player instead of the next fresh batter, and their later real dismissal resolves normally', () => {
    const partnerships = computePartnerships(order, fow, finalScore)!

    // Wicket 6: Tushar Shankar out, partnered with the *returned* Anurag T
    // — not Darshan Shetty, who hasn't entered yet at this point.
    const p6 = partnerships.find(p => p.wicketNumber === 6)!
    expect(p6.runs).toBe(15)
    expect(p6.players.map(p => p.playerName).sort()).toEqual(['Anurag T', 'Tushar Shankar'].sort())
    expect(p6.outPlayer?.playerName).toBe('Tushar Shankar')

    // Wicket 7: Anurag T's real, final dismissal — not a second retirement.
    const p7 = partnerships.find(p => p.wicketNumber === 7)!
    expect(p7.runs).toBe(1)
    expect(p7.isRetirement).toBe(false)
    expect(p7.players.map(p => p.playerName).sort()).toEqual(['Anurag T', 'Darshan Shetty'].sort())
    expect(p7.outPlayer?.playerName).toBe('Anurag T')
  })

  it('no unbroken partnership is synthesized — last man (Manohar B Reddy) is stranded with no partner left', () => {
    const partnerships = computePartnerships(order, fow, finalScore)!
    expect(partnerships).toHaveLength(10) // no 11th synthesized row
    const last = partnerships[partnerships.length - 1]
    expect(last.wicketNumber).toBe(10)
    expect(last.outPlayer?.playerName).toBe('Preetam Patil')
  })

  it('returns null (never guesses) when returning_player_name does not match anyone in the batting order', () => {
    const badFow = fow.map(e => e.wicket_number === 5 ? { ...e, returning_player_name: 'Someone Else' } : e)
    expect(computePartnerships(order, badFow, finalScore)).toBeNull()
  })

  it('the completeness check uses the real-wicket count, not the total row count, so a retirement never blocks the unbroken synthesis', () => {
    // A team that finishes not-all-out mid-stand, having also had one
    // retirement earlier — 3 real wickets down (not 4, since one of the
    // 4 fall_of_wickets rows is a retirement), 2 batters unseparated at
    // the close. 6 batters total so the crease still holds 2 (not 1) once
    // every fall_of_wickets row has been processed.
    const smallOrder = battingOrder(['A', 'B', 'C', 'D', 'E', 'F'])
    const smallFow = [
      { wicket_number: 1, team_score: 40, over: 5, player_name: 'A' },
      { wicket_number: 2, team_score: 60, over: 8, player_name: 'B', is_retirement: true },
      { wicket_number: 3, team_score: 100, over: 12, player_name: 'C' },
      { wicket_number: 4, team_score: 130, over: 16, player_name: 'D' },
    ]
    const closeScore = { total: 180, overs: 20, wickets: 3 } // 3 real wickets, matching realWicketCount
    const partnerships = computePartnerships(smallOrder, smallFow, closeScore)
    expect(partnerships).not.toBeNull()
    const unbroken = partnerships!.find(p => p.outPlayer === null)
    expect(unbroken).toBeDefined()
    expect(unbroken!.runs).toBe(50) // 180 - 130
    expect(unbroken!.isRetirement).toBe(false)
    expect(unbroken!.players.map(p => p.playerName).sort()).toEqual(['E', 'F'])
  })
})

describe('computePartnerships — unaffected by retirement support when absent', () => {
  it('behaves exactly as before for fall_of_wickets rows with no is_retirement/returning_player_name fields', () => {
    const order = battingOrder(['A', 'B', 'C', 'D'])
    const fow = [
      { wicket_number: 1, team_score: 30, over: 5, player_name: 'A' },
      { wicket_number: 2, team_score: 60, over: 10, player_name: 'B' },
    ]
    const partnerships = computePartnerships(order, fow, { total: 100, overs: 20, wickets: 2 })!
    expect(partnerships).toHaveLength(3) // 2 real + 1 unbroken close
    expect(partnerships.every(p => p.isRetirement === false)).toBe(true)
  })
})
