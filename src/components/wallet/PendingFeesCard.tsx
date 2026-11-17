import type { PlayerPendingFee } from '@/lib/pendingPlayerFees'

// "Pending match fees" card on /wallet — see features/fee-reminders.md §9.
// Server component, display only. Estimates, not ledger rows: the admin
// still applies the fee, at which point the real debit appears in the
// statement below and the entry disappears from here.
const inr = (n: number) => `${n < 0 ? '-' : ''}₹${Math.abs(n).toLocaleString('en-IN')}`

export function PendingFeesCard({ fees, balance }: { fees: PlayerPendingFee[]; balance: number }) {
  if (!fees.length) return null
  const total = fees.reduce((s, f) => s + f.share, 0)
  const after = balance - total

  return (
    <section className="mb-6 rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-800/60 dark:bg-amber-950/30 p-4">
      <h2 className="font-cinzel text-sm font-bold text-amber-800 dark:text-amber-300">Match fees yet to be debited</h2>
      <p className="font-rajdhani text-xs text-[#44403C] dark:text-zinc-300 mt-0.5 mb-3">
        You don&apos;t owe this yet. Your balance is unchanged until the club applies these fees,
        which happens after the scorecard is checked. Amounts are estimates and can change slightly.
      </p>
      <ul className="divide-y divide-amber-200 dark:divide-amber-900/50">
        {fees.map(f => (
          <li key={f.booking_id} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="font-rajdhani text-sm font-semibold text-[#1C1917] dark:text-parchment truncate">
                {f.opponent_name ? `vs ${f.opponent_name}` : 'Match'}
              </p>
              <p className="font-rajdhani text-xs text-[#78716C] dark:text-zinc-500">
                {new Date(f.game_date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                {f.tournament_name ? ` · ${f.tournament_name}` : ''}
              </p>
            </div>
            <span className="font-cinzel text-sm font-bold text-red-700 dark:text-red-400 flex-shrink-0">
              -{inr(f.share)}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between border-t border-amber-300 dark:border-amber-800/60 pt-3 mt-1">
        <span className="font-rajdhani text-xs font-bold uppercase tracking-wide text-[#44403C] dark:text-zinc-300">
          Balance after these are debited
        </span>
        <span className={`font-cinzel text-base font-bold ${after < 0 ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
          {inr(after)}
        </span>
      </div>
      {after < 0 ? (
        <p className="font-rajdhani text-xs text-red-700 dark:text-red-400 mt-2">
          Your balance won&apos;t cover this. Top up {inr(-after)} or more to avoid dues.
        </p>
      ) : (
        <p className="font-rajdhani text-xs text-emerald-700 dark:text-emerald-400 mt-2">
          Your balance covers this. Nothing to do.
        </p>
      )}
    </section>
  )
}
