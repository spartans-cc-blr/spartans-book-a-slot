// Shared cricket ball icon — same visual language as the red/white/pink
// ball selector in FixturesCard.tsx / MatchHistoryClient.tsx, but exported
// for inline use anywhere a small ball glyph is needed without match
// context (e.g. next to a bowling stat line, where ball_type isn't known).
// Deliberately red (the default/most common ball colour) rather than
// re-implementing the type selector for a single inline use.
export function CricketBallIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'inline-block', verticalAlign: '-2px' }}>
      <defs>
        <radialGradient id="cbi-rb" cx="38%" cy="30%" r="62%">
          <stop offset="0%" stopColor="#E8553A" />
          <stop offset="35%" stopColor="#C0392B" />
          <stop offset="75%" stopColor="#8B1A0F" />
          <stop offset="100%" stopColor="#5C0E08" />
        </radialGradient>
        <clipPath id="cbi-rc"><circle cx="30" cy="30" r="28" /></clipPath>
      </defs>
      <circle cx="30" cy="30" r="28" fill="url(#cbi-rb)" />
      <g transform="rotate(-30 30 30)" clipPath="url(#cbi-rc)">
        <line x1="2" y1="30" x2="58" y2="30" stroke="#5C0E08" strokeWidth="3" />
        <line x1="2" y1="24" x2="58" y2="24" stroke="#E8C49A" strokeWidth="1" strokeDasharray="3 2.5" />
        <line x1="2" y1="36" x2="58" y2="36" stroke="#E8C49A" strokeWidth="1" strokeDasharray="3 2.5" />
      </g>
      <ellipse cx="21" cy="17" rx="9" ry="5" fill="white" opacity="0.13" transform="rotate(-30 21 17)" />
    </svg>
  )
}
