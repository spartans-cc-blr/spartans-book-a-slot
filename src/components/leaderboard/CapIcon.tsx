// IPL-style recognition caps shown next to the player leading the Detailed →
// Bat table (Orange Cap, most runs) or Bowl table (Purple Cap, most wickets),
// the Honor Board cards, the /players directory and the profile/stats headers.
//
// Drawn in the same style as the cricket-ball icons (src/components/matches/
// BallIcon.tsx): inline SVG on a 60×60 canvas with a radial-gradient body that
// shades to a dark edge, dashed stitching and a soft highlight. Inline SVG so
// it needs no asset and can't 404. The peak points LEFT (flipped from the first
// cut, which had it on the right).
//
// Gradient ids are per-kind and shared by every instance of that kind on a page
// — same pattern BallIcon uses; identical defs, so duplicates are harmless.

import type { CapKind } from '@/lib/capHolders'

export type { CapKind }

const CAP_META: Record<CapKind, {
  label: string; name: string; role: string
  light: string; mid: string; dark: string; darkest: string; stitch: string
}> = {
  orange: {
    label: 'Orange Cap — leading run-scorer', name: 'Orange Cap', role: 'Leading run-scorer',
    light: '#FDBA74', mid: '#F97316', dark: '#C2410C', darkest: '#7C2D12', stitch: '#FFE4C7',
  },
  purple: {
    label: 'Purple Cap — leading wicket-taker', name: 'Purple Cap', role: 'Leading wicket-taker',
    light: '#C4B5FD', mid: '#8B5CF6', dark: '#5B21B6', darkest: '#2E1065', stitch: '#EDE9FE',
  },
}

export function CapIcon({ kind, size = 16, className = 'ml-1.5' }: { kind: CapKind; size?: number; className?: string }) {
  const m = CAP_META[kind]
  const body = `cap-${kind}-body`
  const visor = `cap-${kind}-visor`
  const clip = `cap-${kind}-clip`
  return (
    <svg
      width={size} height={size} viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg"
      role="img" aria-label={m.label}
      className={`inline-block align-[-3px] flex-shrink-0 ${className}`}
    >
      <title>{m.label}</title>
      <defs>
        <radialGradient id={body} cx="62%" cy="30%" r="70%">
          <stop offset="0%" stopColor={m.light} /><stop offset="38%" stopColor={m.mid} />
          <stop offset="78%" stopColor={m.dark} /><stop offset="100%" stopColor={m.darkest} />
        </radialGradient>
        <linearGradient id={visor} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={m.dark} /><stop offset="100%" stopColor={m.darkest} />
        </linearGradient>
        <clipPath id={clip}>
          <path d="M12 38C12 19 24 10 36 10C49 10 57 21 57 38Z" />
        </clipPath>
      </defs>

      {/* crown */}
      <path d="M12 38C12 19 24 10 36 10C49 10 57 21 57 38Z" fill={`url(#${body})`} />

      {/* panel seams — dashed stitching, clipped to the crown like the ball seams */}
      <g clipPath={`url(#${clip})`} stroke={m.stitch} strokeWidth="1.2" strokeDasharray="3 2.5" strokeLinecap="round">
        <path d="M36 10C36 19 36 29 36 38" />
        <path d="M36 10C29 16 25 26 24 38" />
        <path d="M36 10C43 16 47 26 48 38" />
      </g>

      {/* peak (points left) */}
      <path d="M13 37C6 37.5 1 41 1 45C1 46.6 3 47 6 47L28 47C33 44.5 36 41.5 36 37Z" fill={`url(#${visor})`} />
      {/* sweatband line where the crown meets the peak */}
      <path d="M12 38H57" stroke={m.darkest} strokeWidth="1.8" strokeLinecap="round" />

      {/* button */}
      <circle cx="36" cy="10" r="2.8" fill={m.darkest} />
      <circle cx="35.2" cy="9.2" r="1" fill="#fff" opacity="0.35" />

      {/* soft highlight, as on the balls */}
      <ellipse cx="42" cy="19" rx="7" ry="4" fill="#fff" opacity="0.22" transform="rotate(-25 42 19)" />
    </svg>
  )
}

// Pill for a player's own profile hero — "you hold the cap".
const BADGE_CLASS: Record<CapKind, string> = {
  orange: 'bg-orange-50 border-orange-300 text-orange-700 dark:bg-orange-950/40 dark:border-orange-800 dark:text-orange-400',
  purple: 'bg-violet-50 border-violet-300 text-violet-700 dark:bg-violet-950/40 dark:border-violet-800 dark:text-violet-400',
}

export function CapBadge({ kind, year }: { kind: CapKind; year: number }) {
  const { name, role } = CAP_META[kind]
  return (
    <span
      title={`${role} in ${year}`}
      className={`inline-flex items-center font-rajdhani text-[10px] font-bold uppercase tracking-wide border px-2 py-0.5 rounded ${BADGE_CLASS[kind]}`}
    >
      <CapIcon kind={kind} size={15} className="mr-1 -ml-0.5" />
      {name} {year}
    </span>
  )
}
