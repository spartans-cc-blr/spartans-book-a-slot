// IPL-style recognition caps shown next to the player leading the Detailed →
// Bat table (Orange Cap, most runs) or Bowl table (Purple Cap, most wickets).
// Inline SVG so it needs no asset and can't 404; the fill is a deliberate
// literal (brand-style orange/purple that read on both light and dark rows),
// same call as the other small status icons in this app.

import type { CapKind } from '@/lib/capHolders'

export type { CapKind }

const CAP_META: Record<CapKind, { fill: string; label: string; name: string; role: string }> = {
  orange: { fill: '#F97316', label: 'Orange Cap — leading run-scorer', name: 'Orange Cap', role: 'Leading run-scorer' },
  purple: { fill: '#8B5CF6', label: 'Purple Cap — leading wicket-taker', name: 'Purple Cap', role: 'Leading wicket-taker' },
}

export function CapIcon({ kind, size = 16, className = 'ml-1.5' }: { kind: CapKind; size?: number; className?: string }) {
  const { fill, label } = CAP_META[kind]
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      role="img" aria-label={label}
      className={`inline-block align-[-3px] flex-shrink-0 ${className}`}
    >
      <title>{label}</title>
      {/* dome */}
      <path d="M4 16C4 9 7.5 5.5 12 5.5S20 9 20 16Z" fill={fill} />
      {/* peak */}
      <path d="M11 16h12c0 2.4-2.8 3.5-6 3.5h-6Z" fill={fill} opacity="0.85" />
      {/* button */}
      <circle cx="12" cy="4.6" r="1.3" fill={fill} />
      {/* seam */}
      <path d="M12 5.8V16" stroke="#fff" strokeOpacity="0.35" strokeWidth="1" />
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
      <CapIcon kind={kind} size={13} className="mr-1 -ml-0.5" />
      {name} {year}
    </span>
  )
}
