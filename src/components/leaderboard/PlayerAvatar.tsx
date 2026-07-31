// Shared avatar for /leaderboard's cards and list rows — Google photo when
// set on the player's profile, otherwise a two-letter initials badge
// (first letter of first name + first letter of last name, e.g.
// "Muthukumar Ramamoorthy" -> "MR") instead of a generic placeholder
// image. Same initials algorithm as GCPlayersGrid.tsx's initials(),
// re-themed here to this page's dark ink/gold palette instead of GC's
// slate-teal.

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

export function PlayerAvatar({ photoUrl, name }: { photoUrl: string | null; name: string }) {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className="w-8 h-8 rounded-full object-cover border border-gold-dim flex-shrink-0"
      />
    )
  }
  return (
    <div className="w-8 h-8 rounded-full border border-gold-dim bg-ink-4 flex items-center justify-center flex-shrink-0">
      <span className="font-rajdhani text-xs font-bold text-gold">{initials(name)}</span>
    </div>
  )
}
