'use client'

// Club-wide birthday wishes modal — celebrates any player whose
// players.dob falls on today's IST calendar date, shown to every
// signed-in, non-expelled member the next time they open the Hub that
// day. Same broadcast posture as MilestoneCelebrationModal
// (src/components/milestones/MilestoneCelebrationModal.tsx) — this is
// recognition from the club to everyone, not a targeted notification to
// just the birthday player. Mounted once via GlobalBirthdayModal in the
// root layout so it fires regardless of which page a player lands on
// first, and exactly once per day (not once per navigation).

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Dialog } from '@/components/ui/Dialog'
import { PlayerAvatar } from '@/components/leaderboard/PlayerAvatar'

interface BirthdayPlayer {
  id: string
  name: string
  photo_url: string | null
}

// Destination-free wa.me/?text=... link — no phone number embedded. Same
// convention as every other WhatsApp nudge in this app apart from the
// wrangler-only top-performer share button (PerformerShareButton.tsx),
// which deliberately targets one specific number for a role-gated
// audience. A player's WhatsApp number isn't otherwise surfaced to
// ordinary peers (see matchcard_call_consent, planned U-25), so birthday
// wishes stay opt-in-recipient too — whoever taps the name picks who to
// actually send it to.
function buildWishUrl(name: string): string {
  const text = encodeURIComponent(`Wishing ${name} a very happy birthday, today! 🎉🎂🎈`)
  return `https://wa.me/?text=${text}`
}

export function BirthdayWishesModal() {
  const { status } = useSession()
  const [birthdays, setBirthdays] = useState<BirthdayPlayer[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (status !== 'authenticated') return
    let cancelled = false
    fetch('/api/birthdays/today')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (cancelled || !data?.birthdays?.length) return
        setBirthdays(data.birthdays)
        setOpen(true)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [status])

  function dismiss() {
    setOpen(false)
    fetch('/api/birthdays/mark-seen', { method: 'POST' }).catch(() => {})
  }

  if (!open || birthdays.length === 0) return null

  const title = birthdays.length === 1 ? '🎉 Happy Birthday! 🎂' : '🎉 Happy Birthdays! 🎂'

  return (
    <Dialog
      open={open}
      onClose={dismiss}
      title={title}
      actions={
        <button
          onClick={dismiss}
          className="font-rajdhani text-xs font-bold uppercase tracking-wide bg-gold text-ink px-4 py-2 rounded hover:bg-gold-light transition-colors"
        >
          Got it
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-center text-2xl leading-none select-none" aria-hidden="true">
          🎉 🎈 🎂 🎈 🎉
        </p>
        {birthdays.map(p => (
          <div key={p.id} className="flex items-center gap-3">
            <PlayerAvatar photoUrl={p.photo_url} name={p.name} />
            <div>
              <p className="font-rajdhani text-sm text-parchment leading-snug">
                <a
                  href={buildWishUrl(p.name)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-gold underline decoration-dotted underline-offset-2 hover:text-gold-light transition-colors"
                >
                  {p.name}
                </a>{' '}
                is celebrating a birthday today! 🎂
              </p>
              <p className="font-rajdhani text-[11px] text-emerald-400 mt-0.5">
                🎈 Tap the name to send wishes on WhatsApp
              </p>
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  )
}
