// Cricket-ball icon — red/white/pink — used wherever a bowling stat needs
// an icon (MatchHistoryCard's top-bowler line, PerformerShareButton's
// wicket-taker row). Extracted out of MatchHistoryClient.tsx so both can
// import the same component instead of one falling back to a generic
// bowling-alley emoji that doesn't match the rest of the app.

export type BallType = 'red' | 'white' | 'pink' | 'gold'

function RedBall({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="mh-rb" cx="38%" cy="30%" r="62%">
          <stop offset="0%" stopColor="#E8553A"/><stop offset="35%" stopColor="#C0392B"/>
          <stop offset="75%" stopColor="#8B1A0F"/><stop offset="100%" stopColor="#5C0E08"/>
        </radialGradient>
        <clipPath id="mh-rc"><circle cx="30" cy="30" r="28"/></clipPath>
      </defs>
      <circle cx="30" cy="30" r="28" fill="url(#mh-rb)"/>
      <g transform="rotate(-30 30 30)" clipPath="url(#mh-rc)">
        <line x1="2" y1="30" x2="58" y2="30" stroke="#5C0E08" strokeWidth="3"/>
        <line x1="2" y1="24" x2="58" y2="24" stroke="#E8C49A" strokeWidth="1" strokeDasharray="3 2.5"/>
        <line x1="2" y1="36" x2="58" y2="36" stroke="#E8C49A" strokeWidth="1" strokeDasharray="3 2.5"/>
      </g>
      <ellipse cx="21" cy="17" rx="9" ry="5" fill="white" opacity="0.13" transform="rotate(-30 21 17)"/>
    </svg>
  )
}

function WhiteBall({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="mh-wb" cx="38%" cy="30%" r="62%">
          <stop offset="0%" stopColor="#FFFFFF"/><stop offset="45%" stopColor="#EDE9DF"/>
          <stop offset="80%" stopColor="#C8C2B0"/><stop offset="100%" stopColor="#A09880"/>
        </radialGradient>
        <clipPath id="mh-wc"><circle cx="30" cy="30" r="28"/></clipPath>
      </defs>
      <circle cx="30" cy="30" r="28" fill="url(#mh-wb)" stroke="#C0BAA8" strokeWidth="0.5"/>
      <g transform="rotate(-30 30 30)" clipPath="url(#mh-wc)">
        <line x1="2" y1="30" x2="58" y2="30" stroke="#9A9080" strokeWidth="3"/>
        <line x1="2" y1="24" x2="58" y2="24" stroke="#707060" strokeWidth="1" strokeDasharray="3 2.5"/>
        <line x1="2" y1="36" x2="58" y2="36" stroke="#707060" strokeWidth="1" strokeDasharray="3 2.5"/>
      </g>
      <ellipse cx="21" cy="17" rx="9" ry="5" fill="white" opacity="0.45" transform="rotate(-30 21 17)"/>
    </svg>
  )
}

function PinkBall({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="mh-pb" cx="38%" cy="30%" r="62%">
          <stop offset="0%" stopColor="#F780B8"/><stop offset="35%" stopColor="#EC4899"/>
          <stop offset="75%" stopColor="#9D1A5C"/><stop offset="100%" stopColor="#6B0D3A"/>
        </radialGradient>
        <clipPath id="mh-pc"><circle cx="30" cy="30" r="28"/></clipPath>
      </defs>
      <circle cx="30" cy="30" r="28" fill="url(#mh-pb)"/>
      <g transform="rotate(-30 30 30)" clipPath="url(#mh-pc)">
        <line x1="2" y1="30" x2="58" y2="30" stroke="#7A0A3C" strokeWidth="3"/>
        <line x1="2" y1="24" x2="58" y2="24" stroke="#C9956B" strokeWidth="1" strokeDasharray="3 2.5"/>
        <line x1="2" y1="36" x2="58" y2="36" stroke="#C9956B" strokeWidth="1" strokeDasharray="3 2.5"/>
      </g>
      <ellipse cx="21" cy="17" rx="9" ry="5" fill="white" opacity="0.16" transform="rotate(-30 21 17)"/>
    </svg>
  )
}

// Not a real cricket ball colour — repurposes the same seam/shading
// treatment as the red/white/pink balls, in the app's own gold accent
// (--gold / --gold-light / --gold-dim), for /leaderboard's 5-Wicket Hauls
// panel icon (a cricket-ball shape reads better there than the ten-pin
// bowling emoji it replaced, which isn't a cricket icon at all).
function GoldBall({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="mh-gb" cx="38%" cy="30%" r="62%">
          <stop offset="0%" stopColor="#F5D78E"/><stop offset="35%" stopColor="#C9A84C"/>
          <stop offset="75%" stopColor="#8A6A1F"/><stop offset="100%" stopColor="#4A3A12"/>
        </radialGradient>
        <clipPath id="mh-gc"><circle cx="30" cy="30" r="28"/></clipPath>
      </defs>
      <circle cx="30" cy="30" r="28" fill="url(#mh-gb)"/>
      <g transform="rotate(-30 30 30)" clipPath="url(#mh-gc)">
        <line x1="2" y1="30" x2="58" y2="30" stroke="#4A3A12" strokeWidth="3"/>
        <line x1="2" y1="24" x2="58" y2="24" stroke="#FBEFD2" strokeWidth="1" strokeDasharray="3 2.5"/>
        <line x1="2" y1="36" x2="58" y2="36" stroke="#FBEFD2" strokeWidth="1" strokeDasharray="3 2.5"/>
      </g>
      <ellipse cx="21" cy="17" rx="9" ry="5" fill="white" opacity="0.25" transform="rotate(-30 21 17)"/>
    </svg>
  )
}

export function BallIcon({ type, size = 20 }: { type: BallType; size?: number }) {
  if (type === 'white') return <WhiteBall size={size} />
  if (type === 'pink')  return <PinkBall size={size} />
  if (type === 'gold')  return <GoldBall size={size} />
  return <RedBall size={size} />
}
