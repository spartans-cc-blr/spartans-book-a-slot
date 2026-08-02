// "What do these numbers mean?" — collapsed by default, at the bottom of
// /leaderboard. A native <details>/<summary> element rather than a
// useState toggle, so this stays a plain server component (the entries
// themselves are already resolved server-side per the current selection —
// see src/lib/leaderboardGlossary.ts — no client interactivity needed
// beyond expand/collapse, which <details> gives for free).

import type { GlossaryEntry } from '@/lib/leaderboardGlossary'

export function LeaderboardGlossary({ title, entries }: { title: string; entries: GlossaryEntry[] }) {
  if (entries.length === 0) return null
  return (
    <details className="mt-6 bg-ink-3 border border-ink-5 rounded-lg overflow-hidden group">
      <summary className="cursor-pointer select-none list-none px-4 py-3 font-rajdhani text-xs font-bold tracking-widest uppercase text-zinc-400 hover:text-gold transition-colors flex items-center justify-between gap-2">
        <span>What do these numbers mean? <span className="text-zinc-600 normal-case tracking-normal font-semibold">— {title}</span></span>
        <span className="text-zinc-600 flex-shrink-0 transition-transform group-open:rotate-180">▾</span>
      </summary>
      <dl className="px-4 pb-4 pt-3 border-t border-ink-5 space-y-2.5">
        {entries.map(e => (
          <div key={e.term}>
            <dt className="font-rajdhani text-xs font-bold text-gold">{e.term}</dt>
            <dd className="font-rajdhani text-xs text-zinc-400 mt-0.5">{e.definition}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}
