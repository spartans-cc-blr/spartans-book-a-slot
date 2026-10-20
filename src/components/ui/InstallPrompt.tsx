'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'

// "Install the app" nudge. Android/Chrome: captures beforeinstallprompt and
// offers a one-tap install. iOS: no install API exists, so shows how to use
// Share → Add to Home Screen (also what unlocks web push there). Shown only
// to signed-in members, only outside the installed app, from the second
// visit onward, and not again for 30 days after dismissal.
// See .claude/rules/features/pwa.md.

const VISITS_KEY = 'hub-visit-count'
const DISMISS_KEY = 'hub-install-dismissed-at'
const INSTALLED_KEY = 'hub-installed'
const DISMISS_DAYS = 30
const MIN_VISITS = 2

type DeferredPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true
}

function isIOS(): boolean {
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && navigator.maxTouchPoints > 1)
}

export function InstallPrompt() {
  const { data: session, status } = useSession()
  const user = session?.user as any
  const eligible = status === 'authenticated' && user?.playerStatus !== 'expelled'

  const [deferred, setDeferred] = useState<DeferredPrompt | null>(null)
  const [ios, setIos] = useState(false)
  const [ready, setReady] = useState(false)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    if (!eligible) return
    try {
      if (isStandalone() || localStorage.getItem(INSTALLED_KEY)) return
      const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) ?? 0)
      if (dismissedAt && Date.now() - dismissedAt < DISMISS_DAYS * 86400000) return

      // Count one visit per browser session.
      if (!sessionStorage.getItem('hub-visit-counted')) {
        sessionStorage.setItem('hub-visit-counted', '1')
        localStorage.setItem(VISITS_KEY, String(Number(localStorage.getItem(VISITS_KEY) ?? 0) + 1))
      }
      if (Number(localStorage.getItem(VISITS_KEY) ?? 0) < MIN_VISITS) return
    } catch {
      return // storage blocked: stay quiet rather than nag every load
    }

    const onBeforeInstall = (e: Event) => { e.preventDefault(); setDeferred(e as DeferredPrompt); setReady(true) }
    const onInstalled = () => {
      try { localStorage.setItem(INSTALLED_KEY, '1') } catch {}
      setHidden(true)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    if (isIOS()) { setIos(true); setReady(true) }
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [eligible])

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch {}
    setHidden(true)
  }

  async function install() {
    if (!deferred) return
    await deferred.prompt()
    const choice = await deferred.userChoice
    if (choice.outcome === 'accepted') setHidden(true)
    else dismiss()
    setDeferred(null)
  }

  if (!eligible || !ready || hidden || (!deferred && !ios)) return null

  return (
    <div
      className="fixed inset-x-3 bottom-20 md:bottom-4 md:left-auto md:right-4 md:max-w-sm z-40 rounded-xl border border-[#D4C9B0] dark:border-ink-5 bg-white dark:bg-ink-2 shadow-xl p-4"
      role="dialog"
      aria-label="Install Spartans Hub"
    >
      <div className="flex gap-3">
        <img src="/images/logo-64.png" alt="" width={40} height={40} className="w-10 h-10 object-contain shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-cinzel text-sm font-bold text-[#1C1917] dark:text-parchment">Add Spartans Hub to your home screen</p>
          {deferred ? (
            <p className="font-rajdhani text-sm text-[#57534E] dark:text-zinc-400 mt-0.5">Opens full-screen, loads faster, and lets us notify you when squads are announced.</p>
          ) : (
            <p className="font-rajdhani text-sm text-[#57534E] dark:text-zinc-400 mt-0.5">
              Tap <span aria-label="Share" className="font-bold">Share ⎋</span> in Safari, then <b>Add to Home Screen</b>. Needed for squad notifications on iPhone.
            </p>
          )}
          <div className="flex gap-2 justify-end mt-3">
            <button onClick={dismiss} className="font-rajdhani text-sm px-3 py-1.5 text-[#78716C] dark:text-zinc-400">Not now</button>
            {deferred && (
              <button onClick={install} className="font-rajdhani text-sm font-bold px-4 py-1.5 rounded bg-amber-600 text-white">Install</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
