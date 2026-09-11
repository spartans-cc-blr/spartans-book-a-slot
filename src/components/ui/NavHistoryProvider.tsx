'use client'
// Per-tab in-app navigation history — the "does the player have somewhere
// to go back to?" signal BackButton needs. See features/back-navigation.md.
//
// Mounted once in src/app/providers.tsx. Every pathname/search change is
// fed through recordNavigation() (src/lib/navHistory.ts) and the resulting
// stack persisted to sessionStorage — per-tab, cleared when the tab or the
// standalone PWA closes, which is exactly the lifetime of the browser
// history it mirrors. useSearchParams() needs a Suspense boundary during
// static rendering, hence the inner <NavTracker/> wrapped in <Suspense>.

import { createContext, useContext, useEffect, useState, Suspense } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { recordNavigation, canGoBack, EMPTY_NAV_HISTORY, type NavHistoryState } from '@/lib/navHistory'

const STORAGE_KEY = 'hub-nav-history'

const NavHistoryContext = createContext<boolean>(false)

function load(): NavHistoryState {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY_NAV_HISTORY
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed?.stack) && typeof parsed?.pointer === 'number') return parsed
  } catch { /* private mode / disabled storage — fall through */ }
  return EMPTY_NAV_HISTORY
}

function save(state: NavHistoryState) {
  try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* ignore */ }
}

function NavTracker({ onChange }: { onChange: (canBack: boolean) => void }) {
  const pathname = usePathname()
  const search = useSearchParams()
  const url = search?.toString() ? `${pathname}?${search.toString()}` : pathname
  useEffect(() => {
    const next = recordNavigation(load(), url)
    save(next)
    onChange(canGoBack(next))
  }, [url, onChange])
  return null
}

export function NavHistoryProvider({ children }: { children: React.ReactNode }) {
  const [canBack, setCanBack] = useState(false)
  return (
    <NavHistoryContext.Provider value={canBack}>
      <Suspense fallback={null}>
        <NavTracker onChange={setCanBack} />
      </Suspense>
      {children}
    </NavHistoryContext.Provider>
  )
}

// True once this tab has navigated at least one page inside the Hub, so
// router.back() lands on another Hub page rather than leaving the app.
export function useCanGoBack(): boolean {
  return useContext(NavHistoryContext)
}
