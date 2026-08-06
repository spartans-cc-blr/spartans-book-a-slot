'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import { ALL_PERSONAS, availablePersonas, personaHasPath, type Persona } from '@/lib/personas'

// SiteNav (and therefore this hook) is mounted fresh inside every page.tsx —
// it does not live in a shared root layout, so it fully unmounts and
// remounts on every client-side navigation, including the router.push()
// calls selectPersona() itself triggers. session.user.defaultPersona only
// reflects the DB as of your last sign-in, so re-seeding from it on every
// mount would silently snap the picked persona straight back to whatever
// was last saved the instant a switch caused a navigation — which, once
// "admin" was ever picked once, made every other option look permanently
// broken. sessionStorage is the actual live source of truth for "what this
// tab is viewing as right now"; the DB value is only used to seed a brand
// new tab that has never picked anything yet.
const STORAGE_KEY = 'hub:persona'

function readCached(): Persona | null {
  if (typeof window === 'undefined') return null
  const raw = window.sessionStorage.getItem(STORAGE_KEY)
  return raw && (ALL_PERSONAS as string[]).includes(raw) ? (raw as Persona) : null
}

// Single source of truth for "which persona is this session currently
// viewing the Hub as." Only ever call this once per page (SiteNav owns it
// on every normal page; AdminPersonaSwitcher owns it inside /admin — the
// two layouts never render at the same time, so there's no risk of two
// independent instances drifting apart on one page).
export function usePersonaState() {
  const { data: session } = useSession()
  const router   = useRouter()
  const pathname = usePathname() ?? '/'
  const user     = session?.user as any

  const available = useMemo(() => availablePersonas(user), [user?.isCaptain, user?.isGC, user?.isWrangler, user?.isAdmin])

  // Starts at 'player' on both server and client so hydration matches (the
  // cache read below only happens client-side, after mount) — then the
  // effect immediately corrects it, same as the DB-seed path always did.
  const [persona, setPersonaState] = useState<Persona>('player')
  const seeded = useRef(false)

  useEffect(() => {
    if (seeded.current) return

    const cached = readCached()
    if (cached) {
      setPersonaState(cached)
      seeded.current = true
      return
    }

    // No cache for this tab yet — this is a fresh sign-in / new tab. Wait
    // for the session to actually finish loading before seeding from the
    // DB (and locking `seeded`) — useSession() is often still 'loading' on
    // the very first render, and this effect re-runs once it resolves.
    if (!user) return
    const seed = user.defaultPersona as Persona | null
    if (seed && available.includes(seed)) {
      setPersonaState(seed)
      window.sessionStorage.setItem(STORAGE_KEY, seed)
    }
    seeded.current = true
  }, [user, available])

  // If a role was revoked mid-session (or the cached pick predates it),
  // don't strand the pill on a persona this account no longer qualifies for.
  useEffect(() => {
    if (available.length && !available.includes(persona)) {
      setPersonaState('player')
      window.sessionStorage.setItem(STORAGE_KEY, 'player')
    }
  }, [available, persona])

  function selectPersona(next: Persona) {
    setPersonaState(next)
    window.sessionStorage.setItem(STORAGE_KEY, next)

    fetch('/api/players/persona', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ persona: next }),
    }).catch(() => {})

    if (next === 'admin') {
      router.push('/admin')
      return
    }
    // Leaving /admin, or landing somewhere the new persona has no link to —
    // send them Home rather than strand them on a page the nav can no
    // longer get back to.
    if (pathname.startsWith('/admin') || !personaHasPath(next, pathname)) {
      router.push('/')
    }
  }

  return { persona, selectPersona, available }
}
