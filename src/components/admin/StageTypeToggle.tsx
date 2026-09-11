'use client'
// League / Knockout toggle for the admin booking forms — writes
// bookings.stage_type (migration 076), the structured counterpart to the
// free-text "Match Stage" input directly above it. Feeds the Team Record
// page's League/Knockout split only (features/team-stats.md §4); never read
// by the booking rules engine. Leaving it unset means "unclassified",
// which the Team Record page treats as a league game.

export type StageTypeValue = '' | 'league' | 'knockout'

const OPTIONS: { value: StageTypeValue; label: string }[] = [
  { value: '',         label: 'Not set' },
  { value: 'league',   label: '🎖️ League' },
  { value: 'knockout', label: '🏆 Knockout' },
]

export function StageTypeToggle({ value, onChange, disabled }: {
  value: StageTypeValue
  onChange: (v: StageTypeValue) => void
  disabled?: boolean
}) {
  return (
    <div>
      <label className="form-label">Game Type <span className="text-zinc-600">(for team stats)</span></label>
      <div className="flex gap-2 flex-wrap">
        {OPTIONS.map(o => (
          <button key={o.value} type="button" disabled={disabled}
            onClick={() => onChange(o.value)}
            className={`font-rajdhani text-xs font-bold tracking-widest uppercase px-3 py-1.5 rounded border transition-colors disabled:opacity-50 disabled:cursor-not-allowed
              ${value === o.value
                ? 'bg-gold/20 border-gold-dim text-gold'
                : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'}`}>
            {o.label}
          </button>
        ))}
      </div>
      <p className="font-rajdhani text-xs text-zinc-600 mt-1">Knockout = quarter/semi/final, qualifier, eliminator. Drives the League vs Knockout split on Team Record.</p>
    </div>
  )
}
