'use client'
import { useTheme, type ThemePreference } from '@/components/ui/ThemeProvider'

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </svg>
  )
}
function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
    </svg>
  )
}
function SystemIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  )
}
const ICONS: Record<ThemePreference, () => React.ReactElement> = { light: SunIcon, dark: MoonIcon, system: SystemIcon }

/** Desktop/mobile nav profile dropdown — Tailwind `dark:`-aware, matches the surrounding row styling. */
export function ThemeToggleNav({ onSelect }: { onSelect?: () => void }) {
  const { preference, setPreference } = useTheme()
  return (
    <div className="px-4 py-2.5 border-t border-[#D4C9B0] dark:border-ink-5">
      <p className="font-rajdhani text-[10px] font-bold tracking-widest uppercase text-[#78716C] dark:text-zinc-500 mb-1.5">
        Appearance
      </p>
      <div className="flex gap-1">
        {OPTIONS.map(opt => {
          const Icon = ICONS[opt.value]
          const active = preference === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => { setPreference(opt.value); onSelect?.() }}
              className={`flex-1 flex flex-col items-center gap-1 py-1.5 rounded font-rajdhani text-[10px] font-semibold uppercase tracking-wide transition-colors
                ${active
                  ? 'bg-[#FEF3C7] text-gold dark:bg-ink-3 dark:text-gold'
                  : 'text-[#78716C] hover:bg-[#F8F4EE] dark:text-zinc-500 dark:hover:bg-ink-3'}`}
            >
              <Icon />
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Mobile bottom-tab-bar "More" sheet — styled from the same inline colour tokens every other sheet row uses. */
export function ThemeToggleSheet({ t, onSelect }: { t: { rowText: string; muted: string; accent: string; divider: string; rowIconBg: string }; onSelect?: () => void }) {
  const { preference, setPreference } = useTheme()
  return (
    <div className="py-3" style={{ borderBottom: `1px solid ${t.divider}` }}>
      <p className="font-rajdhani text-[10px] font-bold tracking-[3px] uppercase mb-2" style={{ color: t.muted }}>
        Appearance
      </p>
      <div className="flex gap-1.5">
        {OPTIONS.map(opt => {
          const Icon = ICONS[opt.value]
          const active = preference === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => { setPreference(opt.value); onSelect?.() }}
              className="flex-1 flex flex-col items-center gap-1 py-2 rounded-lg font-rajdhani text-[10px] font-semibold uppercase tracking-wide"
              style={{ background: active ? `${t.accent}1A` : t.rowIconBg, color: active ? t.accent : t.rowText }}
            >
              <Icon />
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
