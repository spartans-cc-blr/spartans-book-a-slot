// IPL-style recognition caps shown next to the player leading the Detailed →
// Bat table (Orange Cap, most runs) or Bowl table (Purple Cap, most wickets).
// Inline SVG so it needs no asset and can't 404; the fill is a deliberate
// literal (brand-style orange/purple that read on both light and dark rows),
// same call as the other small status icons in this app.

export type CapKind = 'orange' | 'purple'

const CAP_META: Record<CapKind, { fill: string; label: string }> = {
  orange: { fill: '#F97316', label: 'Orange Cap — leading run-scorer' },
  purple: { fill: '#8B5CF6', label: 'Purple Cap — leading wicket-taker' },
}

export function CapIcon({ kind, size = 16 }: { kind: CapKind; size?: number }) {
  const { fill, label } = CAP_META[kind]
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      role="img" aria-label={label}
      className="inline-block align-[-3px] ml-1.5 flex-shrink-0"
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
