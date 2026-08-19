// Points toward whichever slot is actually causing a 'clash'/'blocked'
// status — shared between the admin schedule grid (ScheduleGrid.tsx) and
// the Unavailable Dates page (captains/UnavailableDatesPanel.tsx) so both
// render the same "play in progress, here's why" convention instead of two
// independently-drifting copies.

import type { SlotTime } from '@/types'

const SLOT_INDEX: Record<SlotTime, number> = {
  '07:30': 0,
  '10:30': 1,
  '12:30': 2,
  '14:30': 3,
}

export type ArrowDirection = 'left' | 'right' | 'up' | 'down'

export function getArrowDirection(
  slotTime: SlotTime,
  clashSource: SlotTime | null,
  mobile: boolean
): ArrowDirection | null {
  if (!clashSource) return null
  const clashIdx = SLOT_INDEX[clashSource]
  const thisIdx  = SLOT_INDEX[slotTime]
  if (mobile) {
    return clashIdx < thisIdx ? 'up' : 'down'
  }
  return clashIdx < thisIdx ? 'left' : 'right'
}

const ARROW_PATHS: Record<ArrowDirection, string> = {
  left:  'M15 18l-6-6 6-6',
  right: 'M9 18l6-6-6-6',
  up:    'M18 15l-6-6-6 6',
  down:  'M6 9l6 6 6-6',
}

export function ArrowIcon({ direction }: { direction: ArrowDirection }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={ARROW_PATHS[direction]} />
    </svg>
  )
}
