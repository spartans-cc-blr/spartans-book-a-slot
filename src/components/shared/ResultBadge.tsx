// No 'use client' — plain, stateless component safe to render from both
// server components (e.g. TournamentShareCard) and client components (e.g.
// TournamentPlannerClient), so the match-result styling can't drift between
// the two surfaces the way the underlying "won"/"lost" matching once did.
//
// Win gets a solid green pill (celebratory); a loss is plain red text, no
// pill — same asymmetric-weight convention MatchHistoryCard uses elsewhere
// (a bordered badge on every outcome made a loss read as "achieved" as a
// win).
//
// Stored match_result values are literally "WON"/"LOST" (confirmed against
// live data) — matched via .includes() rather than exact equality so a more
// descriptive value (e.g. "won by 5 runs") still resolves correctly.
export function ResultBadge({ result }: { result: string }) {
  const r = result.toLowerCase()
  if (r.includes('won')) {
    return <span className="inline-block bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">WON</span>
  }
  if (r.includes('lost')) {
    return <span className="text-red-700 text-[10px] font-bold">LOST</span>
  }
  if (r.includes('tie')) {
    return <span className="text-amber-700 text-[10px] font-bold">TIED</span>
  }
  return <span className="text-stone-400 text-[10px] font-bold">{result.toUpperCase()}</span>
}
