'use client'

// Fetches /api/modals/pending once per session and shares it with the three
// global modals (milestones, birthdays, admin fee reminders), replacing three
// separate on-load requests. Mounted in the root layout next to them.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useSession } from 'next-auth/react'

export interface ModalFeed {
  achievements?: any[]
  birthdays?: any[]
  bookings?: any[]
}

const ModalFeedContext = createContext<ModalFeed | null>(null)

export function ModalFeedProvider({ children }: { children: ReactNode }) {
  const { status, data: session } = useSession()
  const user = session?.user as any
  const eligible = status === 'authenticated' && user?.playerStatus !== 'expelled'
  const [feed, setFeed] = useState<ModalFeed | null>(null)

  useEffect(() => {
    if (!eligible) return
    let cancelled = false
    fetch('/api/modals/pending')
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (!cancelled) setFeed(data ?? {}) })
      .catch(() => { if (!cancelled) setFeed({}) })
    return () => { cancelled = true }
  }, [eligible])

  return <ModalFeedContext.Provider value={feed}>{children}</ModalFeedContext.Provider>
}

// null until the single request resolves.
export function useModalFeed(): ModalFeed | null {
  return useContext(ModalFeedContext)
}
