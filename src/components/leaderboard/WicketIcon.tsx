// Three stumps with both bails dislodged — a "wicket taken" icon for
// /leaderboard's 3-Wicket Hauls panel (🎯 read as a dartboard/target,
// which isn't cricket-specific and was already reused elsewhere on the
// same page for Top Wicket Taker). Same gold/wood palette as the rest of
// the app's icon set.

export function WicketIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* ground */}
      <line x1="8" y1="52" x2="52" y2="52" stroke="#7A6030" strokeWidth="2" strokeLinecap="round" opacity="0.5" />

      {/* three stumps, wood-gold */}
      <rect x="14" y="16" width="6" height="36" rx="3" fill="#C9A84C" stroke="#7A6030" strokeWidth="1" />
      <rect x="27" y="12" width="6" height="40" rx="3" fill="#C9A84C" stroke="#7A6030" strokeWidth="1" />
      <rect x="40" y="16" width="6" height="36" rx="3" fill="#C9A84C" stroke="#7A6030" strokeWidth="1" />

      {/* bails, knocked off and airborne above the stumps */}
      <g transform="rotate(-32 44 10)">
        <rect x="33" y="7" width="18" height="4.5" rx="2.25" fill="#F5D78E" stroke="#7A6030" strokeWidth="0.75" />
      </g>
      <g transform="rotate(20 48 20)">
        <rect x="39" y="17" width="15" height="4" rx="2" fill="#E8C97A" stroke="#7A6030" strokeWidth="0.75" />
      </g>
    </svg>
  )
}
