'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import { availablePersonas, personaHasPath, type Persona } from '@/lib/personas'

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

  const [persona, setPersonaState] = useState<Persona>('player')
  const seeded = useRef(false)

  useEffect(() => {
    if (seeded.current || !user) return
    const seed = user.defaultPersona as Persona | null
    if (seed && available.includes(seed)) setPersonaState(seed)
    seeded.current = true
  }, [user, available])

  function selectPersona(next: Persona) {
    setPersonaState(next)

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
