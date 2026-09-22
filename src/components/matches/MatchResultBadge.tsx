// No 'use client' — plain, stateless component, safe to render from both
// a Server Component (the standalone /matches/history/[bookingId] page)
// and a Client Component (MatchHistoryClient.tsx's MatchHistoryCard).
//
// Sibling of src/components/shared/ResultBadge.tsx, not a replacement for
// it — ResultBadge's other callers (TournamentPlannerClient,
// TournamentShareCard, the admin booking-backfill preview) just want a
// bare WON/LOST/TIED indicator with no margin, and stay on ResultBadge.
// This component exists specifically for the match-history result strip,
// which also needs the margin ("by 30 runs") sitting next to that word —
// see features/post-match-scorecard.md §17.6. Only the result *word*
// itself gets the pill/coloured-text badge treatment (same asymmetric
// weighting ResultBadge documents: a win is a solid, celebratory pill; a
// loss, tie, or anything else renders as plain coloured text, never a
// pill); the margin renders separately, in the original plain, muted
// margin-line style — never inside the pill.

import type { ResultLine } from '@/lib/matchResultDisplay'

function ResultWord({ kind, word }: { kind: ResultLine['kind']; word: string }) {
  if (kind === 'won') {
    return (
      <span className="inline-block bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
        {word}
      </span>
    )
  }
  if (kind === 'lost') {
    return <span className="text-red-700 text-[10px] font-bold">{word}</span>
  }
  if (kind === 'tied') {
    return <span className="text-amber-700 text-[10px] font-bold">{word}</span>
  }
  return <span className="text-stone-400 text-[10px] font-bold">{word}</span>
}

export function MatchResultBadge({ line }: { line: ResultLine | null }) {
  if (!line) return null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
      <ResultWord kind={line.kind} word={line.word} />
      {line.marginText && (
        <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--scorecard-text-muted)' }}>
          {line.marginText}
        </span>
      )}
    </span>
  )
}
