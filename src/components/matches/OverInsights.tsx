import type { BallRow } from '@/lib/ballByBall'
import { overInsights } from '@/lib/matchInsights'

/** Rule-based pointers for the selected over (wickets, boundaries, a new bowler, maiden, extras, ...). */
export function OverInsights({ balls, over }: { balls: BallRow[]; over: number }) {
  const notes = overInsights(balls, over)
  if (notes.length === 0) return null
  return (
    <ul className="mt-1 space-y-0.5 text-xs text-[var(--scorecard-text-2)] list-disc pl-4">
      {notes.map(n => <li key={n}>{n}</li>)}
    </ul>
  )
}
