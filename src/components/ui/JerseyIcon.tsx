export function JerseyIcon({ colour = 'gold', size = 20 }: { colour?: 'gold' | 'white'; size?: number }) {
  const fill   = colour === 'gold' ? '#C9A84C' : '#F8FAFC'
  const stroke = colour === 'gold' ? '#9A7A2E' : '#CBD5E1'
  const shadow = colour === 'gold' ? '#7A5E1A' : '#94A3B8'
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M 14 6 Q 20 11 26 6" stroke={stroke} strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      <path d="M 8 10 L 14 6 Q 20 11 26 6 L 32 10 L 29 16 L 26 14 L 26 34 L 14 34 L 14 14 L 11 16 Z"
        fill={fill} stroke={stroke} strokeWidth="1" strokeLinejoin="round"/>
      <path d="M 8 10 L 11 16 L 14 14 L 14 10 Z" fill={shadow} opacity="0.3"/>
      <path d="M 32 10 L 29 16 L 26 14 L 26 10 Z" fill={shadow} opacity="0.3"/>
    </svg>
  )
}