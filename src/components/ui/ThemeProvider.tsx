'use client'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'hub-theme'

// Inline, synchronous — must run in <head>, before <body> paints, to avoid a
// flash of the wrong theme. Mirrors ThemeProvider's own resolution logic
// below; kept intentionally duplicated (a real script string, not a shared
// function) since it has to survive being serialised into the HTML.
export const themeInitScript = `(function(){try{var p=localStorage.getItem('${STORAGE_KEY}')||'system';var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light')}catch(e){}})();`

interface ThemeContextValue {
  preference: ThemePreference
  resolvedTheme: ResolvedTheme
  setPreference: (pref: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function resolveSystem(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Seeded from the DOM attribute the inline head script already set, so the
  // first client render matches what was actually painted — no mismatch flash.
  const [preference, setPreferenceState] = useState<ThemePreference>('system')
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    if (typeof document === 'undefined') return 'dark'
    return (document.documentElement.getAttribute('data-theme') as ResolvedTheme | null) ?? 'dark'
  })

  useEffect(() => {
    let stored: ThemePreference = 'system'
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw === 'light' || raw === 'dark' || raw === 'system') stored = raw
    } catch {}
    setPreferenceState(stored)
  }, [])

  useEffect(() => {
    const apply = () => {
      const resolved = preference === 'system' ? resolveSystem() : preference
      setResolvedTheme(resolved)
      document.documentElement.setAttribute('data-theme', resolved)
    }
    apply()
    if (preference !== 'system') return
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    mql.addEventListener('change', apply)
    return () => mql.removeEventListener('change', apply)
  }, [preference])

  const setPreference = useCallback((pref: ThemePreference) => {
    setPreferenceState(pref)
    try { localStorage.setItem(STORAGE_KEY, pref) } catch {}
  }, [])

  return (
    <ThemeContext.Provider value={{ preference, resolvedTheme, setPreference }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  // Defensive fallback rather than throwing — ThemeProvider is mounted once
  // in the root layout, but a component rendered in isolation (Storybook-like
  // use, a future test) shouldn't hard-crash over a missing provider.
  if (!ctx) return { preference: 'system', resolvedTheme: 'dark', setPreference: () => {} }
  return ctx
}
