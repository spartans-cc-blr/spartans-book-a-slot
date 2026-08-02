// Shared slot-target math — a tournament's total league games split evenly
// across every slot valid for its format(s), e.g. 10 games / 3 valid slots
// -> 4/3/3. The remainder goes to the earliest slots in display order
// (Sat 07:30 -> Sun 14:30), an arbitrary but stable tie-break, not a
// scheduling preference.
//
// TournamentPlannerClient.tsx has its own historical copy of this exact
// formula (added in "Show per-slot game targets in tournament planner slot
// balance") — left untouched there to avoid any risk to that already-shipped
// display. This copy is for the newer consumers that need the identical
// formula to stay honest with the planner: the public share card's slot
// balance section, and the slot-level organiser self-service suggestion
// engine (src/lib/suggestedSlots.ts).

import type { SlotTime, GameFormat } from '@/types'

export const ALL_SLOTS = [
  { day: 'Sat', time: '07:30', validFor: ['T20', 'T30'] },
  { day: 'Sat', time: '10:30', validFor: ['T20']        },
  { day: 'Sat', time: '12:30', validFor: ['T30']        },
  { day: 'Sat', time: '14:30', validFor: ['T20']        },
  { day: 'Sun', time: '07:30', validFor: ['T20', 'T30'] },
  { day: 'Sun', time: '10:30', validFor: ['T20']        },
  { day: 'Sun', time: '12:30', validFor: ['T30']        },
  { day: 'Sun', time: '14:30', validFor: ['T20']        },
] as const satisfies readonly { day: 'Sat' | 'Sun'; time: SlotTime; validFor: GameFormat[] }[]

export type SlotKey = `${'Sat' | 'Sun'}-${SlotTime}`

export function distributeSlotTargets(validKeys: SlotKey[], totalLeague: number): Record<SlotKey, number> {
  const n = validKeys.length
  const targets = {} as Record<SlotKey, number>
  if (n === 0) return targets
  const base      = Math.floor(totalLeague / n)
  const remainder = totalLeague % n
  validKeys.forEach((k, i) => {
    targets[k] = base + (i < remainder ? 1 : 0)
  })
  return targets
}
