'use client'
// Per-booking practice-game override — writes bookings.is_practice
// (migration 078), additive to the tournament-level tournaments.is_practice
// flag (the "Practice games" umbrella tournament). Lets a single game under
// any real tournament be excluded from leaderboard/team-stats/milestones/
// the quarterly membership fee without needing to route it through that
// umbrella tournament. See features/practice-games.md.

export function PracticeToggle({ checked, onChange, disabled }: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <div>
      <label className={`flex items-center gap-2 select-none ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={e => onChange(e.target.checked)}
          className="w-4 h-4 accent-gold"
        />
        <span className="font-rajdhani text-xs font-bold tracking-widest uppercase text-zinc-400">
          🎯 Practice Game
        </span>
      </label>
      <p className="font-rajdhani text-xs text-zinc-600 mt-1">
        Marks just this game as practice — excluded from the leaderboard, Team Record, milestone
        recognition, and the quarterly membership fee, same as a game under the &quot;Practice games&quot;
        tournament. Use this for a one-off scrimmage under a real tournament, without rebooking it
        under that umbrella tournament.
      </p>
    </div>
  )
}
