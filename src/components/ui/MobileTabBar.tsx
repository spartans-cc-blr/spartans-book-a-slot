'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { signIn, signOut } from 'next-auth/react'
import { JerseyIcon } from '@/components/ui/JerseyIcon'
import { GenerateInviteItem } from '@/components/ui/GenerateInviteItem'
import { useTheme } from '@/components/ui/ThemeProvider'
import { ThemeToggleSheet } from '@/components/ui/ThemeToggle'

export type MobileTabBarTheme = 'dark' | 'light'

interface MobileTabBarProps {
  activePage?: string
  isLoggedIn: boolean
  isExpelled: boolean
  isAdmin: boolean
  isGC: boolean
  isCaptain: boolean
  isWrangler: boolean
  playerId?: string | null
  theme?: MobileTabBarTheme
}

// Colour tokens per theme. 'light' is the Warm Light palette introduced
// with the DateChipSlider (parchment surfaces, saturated #D97706 gold);
// 'dark' is the app's original ink/gold palette. As of the Light/Dark/System
// rollout (see ui-theme.md), whichever one renders is normally driven by the
// signed-in visitor's own theme preference (`useTheme()`'s `resolvedTheme`,
// below) rather than fixed per page — SiteNav's `mobileTabBarTheme` prop
// still exists as an explicit per-page override for a page that hasn't
// adopted the toggle for its own body content yet (e.g. /matches/history,
// which stays pinned 'light' regardless of the visitor's global choice).
function tokens(theme: MobileTabBarTheme) {
  return theme === 'light' ? {
    navBg: '#FFFFFF', navBorder: '#D4C9B0',
    accent: '#D97706', inactive: '#A8A29E',
    sheetBg: '#FFFFFF', handle: '#D4C9B0',
    rowIconBg: '#F8F4EE', rowText: '#1C1917', muted: '#78716C',
    sectionLabel: '#A8A29E', divider: '#E7E0D3', scrim: 'rgba(28,25,23,0.4)',
    dangerText: '#DC2626', dangerIconBg: 'rgba(220,38,38,0.08)',
    crimsonRowBg: 'rgba(220,38,38,0.06)', crimsonIconBg: 'rgba(220,38,38,0.12)', crimson: '#DC2626',
  } : {
    navBg: '#111111', navBorder: '#7A6030',
    accent: '#C9A84C', inactive: 'rgba(201,168,76,0.42)',
    sheetBg: '#111111', handle: '#2E2E2E',
    rowIconBg: '#1A1A1A', rowText: '#D4D4D8', muted: '#71717A',
    sectionLabel: '#3F3F46', divider: '#242424', scrim: 'rgba(0,0,0,0.5)',
    dangerText: '#F87171', dangerIconBg: 'rgba(220,38,38,0.1)',
    crimsonRowBg: 'rgba(220,38,38,0.1)', crimsonIconBg: 'rgba(220,38,38,0.15)', crimson: '#C0132C',
  }
}
type Tokens = ReturnType<typeof tokens>

// Toggles a body class so globals.css can reserve bottom space for the
// fixed tab bar on mobile — see the `.has-mobile-tabbar` rule there.
// Scoped to mount lifetime so a page that never renders this component
// (e.g. the /admin/* subtree using AdminLayout) never gets the padding.
function useReserveBottomSpace() {
  useEffect(() => {
    document.body.classList.add('has-mobile-tabbar')
    return () => document.body.classList.remove('has-mobile-tabbar')
  }, [])
}

export function MobileTabBar(props: MobileTabBarProps) {
  const { activePage, isLoggedIn, isExpelled, isAdmin, isGC, isCaptain, isWrangler, playerId, theme: themeOverride } = props
  const [moreOpen, setMoreOpen] = useState(false)
  useReserveBottomSpace()
  const { resolvedTheme } = useTheme()
  const theme = themeOverride ?? resolvedTheme
  const t = tokens(theme)

  return (
    <>
      {moreOpen && (
        <div
          onClick={() => setMoreOpen(false)}
          className="md:hidden fixed inset-0 top-14 z-40"
          style={{ background: t.scrim }}
        />
      )}

      {moreOpen && (
        <div
          className="md:hidden fixed inset-x-0 bottom-16 z-50 rounded-t-2xl shadow-2xl max-h-[70vh] flex flex-col"
          style={{ background: t.sheetBg, borderTop: `1px solid ${t.navBorder}`, borderLeft: `1px solid ${t.navBorder}`, borderRight: `1px solid ${t.navBorder}` }}
        >
          <div className="w-9 h-1 rounded-full mx-auto mt-2.5 mb-1 flex-none" style={{ background: t.handle }} />
          <div className="overflow-y-auto px-5 pb-6 pt-2">

            {isExpelled ? (
              <>
                <div className="py-3" style={{ borderBottom: `1px solid ${t.divider}` }}>
                  <p className="font-rajdhani text-sm font-semibold" style={{ color: t.dangerText }}>Account suspended</p>
                  <p className="font-rajdhani text-xs mt-1" style={{ color: t.muted }}>Contact the coordinator if you think this is a mistake.</p>
                </div>
                <ThemeToggleSheet t={t} />
              </>
            ) : isLoggedIn ? (
              <>
                <SheetLink t={t} href="/dugout" icon={<ShieldIcon size={16} />} label="The Dugout" active={activePage === 'dugout'} onNavigate={() => setMoreOpen(false)} />
                <SheetLink t={t} href="/leaderboard" icon={<TrophyIcon />} label="Leaderboard" active={activePage === 'leaderboard'} onNavigate={() => setMoreOpen(false)} />
                {playerId ? (
                  <>
                    <SheetLink t={t} href="/profile" icon={<PersonIcon />} label="My Profile" active={activePage === 'profile'} onNavigate={() => setMoreOpen(false)} />
                    <SheetLink t={t} href="/wallet" icon={<RupeeIcon />} label="My Wallet" active={activePage === 'wallet'} onNavigate={() => setMoreOpen(false)} />
                  </>
                ) : (
                  <SheetLink t={t} href="/join" icon={<PersonIcon />} label="Complete Registration" active={false} onNavigate={() => setMoreOpen(false)} />
                )}
                {(isCaptain || isGC || isAdmin) && (
                  <SheetLink t={t} href="/tournament-planner" icon={<FlagIcon />} label="Tournament Planner" active={activePage === 'planner'} onNavigate={() => setMoreOpen(false)} />
                )}

                {(isCaptain || isAdmin) && (
                  <>
                    <SectionLabel t={t}>Captains&rsquo; Corner</SectionLabel>
                    <SheetLink t={t} href="/captains-corner" icon={<ClipboardIcon />} label="Squad Selection" active={activePage === 'captains'} onNavigate={() => setMoreOpen(false)} />
                    <SheetLink t={t} href="/captains-corner/unavailable-dates" icon={<CalendarXIcon />} label="Unavailable Dates" active={activePage === 'captains-unavailable'} onNavigate={() => setMoreOpen(false)} />
                  </>
                )}

                {isGC && (
                  <>
                    <SectionLabel t={t}>Council</SectionLabel>
                    <SheetLink t={t} href="/gc-review" icon={<ScalesIcon />} label="Squad Review" active={activePage === 'gc'} onNavigate={() => setMoreOpen(false)} />
                    <SheetLink t={t} href="/gc/feedback" icon={<ClipboardIcon />} label="Feedback" active={false} onNavigate={() => setMoreOpen(false)} />
                    <SheetLink t={t} href="/gc-players" icon={<PersonIcon />} label="Players" active={activePage === 'gc-players'} onNavigate={() => setMoreOpen(false)} />
                    <SheetLink t={t} href="/dugout/store-orders" icon={<JerseyIcon colour="gold" size={16} />} label="Store Orders" active={false} onNavigate={() => setMoreOpen(false)} />
                    <SheetLink t={t} href="/wrangler/grounds" icon={<PinIcon />} label="Grounds" active={activePage === 'wrangler'} onNavigate={() => setMoreOpen(false)} />
                    <GenerateInviteItem mobile onClose={() => setMoreOpen(false)} />
                  </>
                )}

                {isWrangler && (
                  <>
                    <SectionLabel t={t}>Wrangler</SectionLabel>
                    <SheetLink t={t} href="/wrangler/backfill-squad" icon={<WrenchIcon />} label="Squad Backfill" active={false} onNavigate={() => setMoreOpen(false)} />
                    <SheetLink t={t} href="/wrangler/grounds" icon={<PinIcon />} label="Grounds" active={activePage === 'wrangler'} onNavigate={() => setMoreOpen(false)} />
                  </>
                )}

                {isAdmin && (
                  <>
                    <SectionLabel t={t}>Admin</SectionLabel>
                    <SheetLink t={t} href="/schedule" icon={<CalendarIcon />} label="Schedule" active={activePage === 'schedule'} onNavigate={() => setMoreOpen(false)} />
                    <Link href="/admin" onClick={() => setMoreOpen(false)}
                      className="flex items-center gap-3 py-2.5 px-2.5 -mx-2.5 rounded-lg"
                      style={{ background: t.crimsonRowBg }}>
                      <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-none" style={{ background: t.crimsonIconBg, color: t.crimson }}>
                        <ShieldCheckIcon />
                      </span>
                      <span className="font-rajdhani text-sm font-bold" style={{ color: t.crimson }}>Admin Panel</span>
                    </Link>
                  </>
                )}

                <ThemeToggleSheet t={t} />
                <SheetLink t={t} href="https://spartanscricketclub.vercel.app" icon={<ExternalLinkIcon />} label="Club Site" active={false} onNavigate={() => setMoreOpen(false)} muted />

                <button
                  onClick={() => { setMoreOpen(false); signOut() }}
                  className="w-full flex items-center gap-3 py-2.5 mt-1"
                >
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-none" style={{ background: t.dangerIconBg, color: t.dangerText }}>
                    <DoorIcon />
                  </span>
                  <span className="font-rajdhani text-sm font-semibold" style={{ color: t.dangerText }}>Sign Out</span>
                </button>
              </>
            ) : (
              <>
                <ThemeToggleSheet t={t} />
                <SheetLink t={t} href="https://spartanscricketclub.vercel.app" icon={<ExternalLinkIcon />} label="Club Site" active={false} onNavigate={() => setMoreOpen(false)} muted />
                <button
                  onClick={() => { setMoreOpen(false); signIn('google') }}
                  className="w-full flex items-center gap-3 py-2.5 mt-1"
                >
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-none" style={{ background: `${t.accent}1A`, color: t.accent }}>
                    <PersonIcon />
                  </span>
                  <span className="font-rajdhani text-sm font-semibold" style={{ color: t.accent }}>Sign In</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <nav
        className="md:hidden fixed inset-x-0 bottom-0 z-50 pb-[env(safe-area-inset-bottom)]"
        style={{ background: t.navBg, borderTop: `1px solid ${t.navBorder}` }}
      >
        <div className="h-16 flex items-stretch">
          {isExpelled ? (
            <Tab t={t} href="/" icon={<HomeIcon />} label="Home" active={activePage === 'home'} />
          ) : !isLoggedIn ? (
            <>
              <Tab t={t} href="/" icon={<HomeIcon />} label="Home" active={activePage === 'home'} />
              <Tab t={t} href="/schedule" icon={<CalendarIcon />} label="Schedule" active={activePage === 'schedule'} />
            </>
          ) : (
            <>
              <Tab t={t} href="/" icon={<HomeIcon />} label="Home" active={activePage === 'home'} />
              <Tab t={t} href="/fixtures" icon={<BatBallIcon />} label="Matches" active={activePage === 'fixtures' || activePage === 'matches'} />
              <Tab t={t} href={playerId ? `/players/${playerId}/stats` : '/join'} icon={<TrophyIcon size={21} />} label="My Stats" active={activePage === 'my-stats'} />
            </>
          )}

          <button
            onClick={() => setMoreOpen(v => !v)}
            className="flex-1 flex flex-col items-center justify-center gap-1 relative"
            style={{ color: (moreOpen || isAdminOrGcHighlighted(activePage)) ? t.accent : t.inactive }}
          >
            {(moreOpen || isAdminOrGcHighlighted(activePage)) && (
              <span className="absolute top-1.5 w-[18px] h-[3px] rounded-full" style={{ background: t.accent }} />
            )}
            <DotsIcon />
            <span className="font-rajdhani text-[9.5px] font-bold tracking-wide uppercase">
              More
            </span>
          </button>
        </div>
      </nav>
    </>
  )
}

// activePage values that live inside the More sheet (not their own tab) should
// still show the tab bar's "More" entry point as the active one. 'matches'
// is deliberately not listed here — it's covered by the merged Matches tab's
// own `active` check (activePage === 'fixtures' || 'matches'). 'my-stats' is
// also excluded — it's the My Stats tab's own `active` check (this player's
// personal /players/[id]/stats page), which is a different destination from
// the club-wide 'leaderboard' page below. 'dugout' and 'leaderboard' both
// live in the sheet only (Dugout lost its tab slot to My Stats; Leaderboard
// never had one — see navigation.md §4.1), so both are listed here.
function isAdminOrGcHighlighted(activePage?: string) {
  return ['dugout', 'leaderboard', 'profile', 'wallet', 'planner', 'captains', 'captains-unavailable', 'gc', 'gc-players', 'wrangler', 'schedule'].includes(activePage ?? '')
}

function Tab({ t, href, icon, label, active }: { t: Tokens; href: string; icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <Link href={href} className="flex-1 flex flex-col items-center justify-center gap-1 relative" style={{ color: active ? t.accent : t.inactive }}>
      {active && <span className="absolute top-1.5 w-[18px] h-[3px] rounded-full" style={{ background: t.accent }} />}
      {icon}
      <span className="font-rajdhani text-[9.5px] font-bold tracking-wide uppercase">{label}</span>
    </Link>
  )
}

function SheetLink({ t, href, icon, label, active, onNavigate, muted }: {
  t: Tokens; href: string; icon: React.ReactNode; label: string; active?: boolean; onNavigate: () => void; muted?: boolean
}) {
  const external = href.startsWith('http')
  return (
    <Link
      href={href}
      onClick={onNavigate}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      className="flex items-center gap-3 py-2.5 last:border-b-0"
      style={{ borderBottom: `1px solid ${t.divider}` }}
    >
      <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-none"
        style={{ background: active ? `${t.accent}1A` : t.rowIconBg, color: active ? t.accent : t.muted }}>
        {icon}
      </span>
      <span className="font-rajdhani text-sm font-semibold" style={{ color: muted ? t.muted : active ? t.accent : t.rowText }}>
        {label}
      </span>
    </Link>
  )
}

function SectionLabel({ t, children }: { t: Tokens; children: React.ReactNode }) {
  return (
    <p className="font-rajdhani text-[10px] font-bold tracking-[3px] uppercase pt-4 pb-1" style={{ color: t.sectionLabel }}>
      {children}
    </p>
  )
}

// --- icons — 20px stroke set, currentColor throughout so the wrapping
// element's `color` (set from the theme tokens above) drives the tint ---

function HomeIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 11.5L12 4l8 7.5" /><path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9" />
    </svg>
  )
}
function BatBallIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 16 L16 8" /><rect x="14.2" y="3.2" width="4" height="8" rx="1.6" transform="rotate(45 16.2 7.2)" /><circle cx="6.5" cy="17.5" r="2.1" />
    </svg>
  )
}
function CalendarIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="5" width="17" height="15" rx="2" /><line x1="3.5" y1="9.5" x2="20.5" y2="9.5" /><line x1="8" y1="3" x2="8" y2="7" /><line x1="16" y1="3" x2="16" y2="7" />
    </svg>
  )
}
function ShieldIcon({ size = 21 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
    </svg>
  )
}
function DotsIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
    </svg>
  )
}
function TrophyIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4z" /><path d="M7 5H4.5A2.5 2.5 0 0 0 4 9.9c.4 1.3 1.6 2.1 3 2.1" /><path d="M17 5h2.5A2.5 2.5 0 0 1 20 9.9c-.4 1.3-1.6 2.1-3 2.1" /><line x1="12" y1="13" x2="12" y2="17" /><path d="M9 20h6" /><path d="M10 17h4v3h-4z" />
    </svg>
  )
}
function RupeeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="4" x2="18" y2="4" /><line x1="6" y1="8" x2="18" y2="8" /><path d="M6 8a6 6 0 0 1 0 0h6a4 4 0 0 1 0 8H9l9 8" />
    </svg>
  )
}
function PersonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="3.5" /><path d="M4.5 20c1.2-4 4-6 7.5-6s6.3 2 7.5 6" />
    </svg>
  )
}
function DoorIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h8" /><line x1="10" y1="12" x2="20" y2="12" /><polyline points="17 8.5 20.5 12 17 15.5" />
    </svg>
  )
}
function ClipboardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="4.5" width="12" height="16" rx="1.6" /><path d="M9 4.5V3.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" /><polyline points="8.5 12.5 10.5 14.5 15 10" />
    </svg>
  )
}
function CalendarXIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="5" width="17" height="15" rx="2" /><line x1="3.5" y1="9.5" x2="20.5" y2="9.5" /><line x1="8" y1="3" x2="8" y2="7" /><line x1="16" y1="3" x2="16" y2="7" /><line x1="9.5" y1="13" x2="14.5" y2="17.5" /><line x1="14.5" y1="13" x2="9.5" y2="17.5" />
    </svg>
  )
}
function ScalesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="3" x2="12" y2="19" /><line x1="5" y1="7" x2="19" y2="7" /><path d="M5 7l-3 6a3 3 0 0 0 6 0l-3-6z" /><path d="M19 7l-3 6a3 3 0 0 0 6 0l-3-6z" /><path d="M8 21h8" />
    </svg>
  )
}
function WrenchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a4 4 0 0 0-5.4 4.9L4 16.5V20h3.5l5.3-5.3a4 4 0 0 0 4.9-5.4l-2.8 2.8-2.1-2.1 2.9-2.8z" />
    </svg>
  )
}
function FlagIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="21" x2="5" y2="3.5" /><path d="M5 4.5h13l-3 4 3 4H5" />
    </svg>
  )
}
function ShieldCheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" /><polyline points="9 12 11 14 15 9.5" />
    </svg>
  )
}
function PinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s-7-6.5-7-11.5A7 7 0 0 1 19 9.5C19 14.5 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.2" />
    </svg>
  )
}
function ExternalLinkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 15 20 4" /><path d="M13 4h7v7" /><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" />
    </svg>
  )
}
