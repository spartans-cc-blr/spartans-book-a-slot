// No 'use client' — plain, stateless component, safe to render from both
// a Server Component (the standalone /matches/history/[bookingId] page)
// and a Client Component (MatchHistoryClient.tsx's MatchHistoryCard).
//
// Sibling of src/components/shared/ResultBadge.tsx, not a replacement for
// it — ResultBadge's other callers (TournamentPlannerClient,
// TournamentShareCard, the admin booking-backfill preview) just want a
// bare WON/LOST/TIED indicator with no margin, and stay on ResultBadge.
// This component exists specifically for the match-history result strip,
// where a separate "WON" pill next to the score line and a "Won by 30
// runs" line below it were saying the same thing twice — folded into one
// line here instead: the pill/text itself now carries the margin ("WON BY
// 30 RUNS"), so there's nothing left for a second, redundant badge to say.
// Same asymmetric weighting ResultBadge documents: a win is a solid,
// celebratory pill; a loss, tie, or anything else renders as plain
// coloured text, never a pill, so a loss never reads as visually
// "achieved" the way a win does. See features/post-match-scorecard.md §17.

import type { ResultLine } from '@/lib/matchResultDisplay'

export function MatchResultBadge({ line }: { line: ResultLine | null }) {
  if (!line) return null
  if (line.kind === 'won') {
    return (
      <span className="inline-block bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
        {line.label}
      </span>
    )
  }
  if (line.kind === 'lost') {
    return <span className="text-red-700 text-[10px] font-bold">{line.label}</span>
  }
  if (line.kind === 'tied') {
    return <span className="text-amber-700 text-[10px] font-bold">{line.label}</span>
  }
  return <span className="text-stone-400 text-[10px] font-bold">{line.label}</span>
}
