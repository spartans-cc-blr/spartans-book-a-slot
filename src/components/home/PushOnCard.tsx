'use client'

// Home dashboard nudge to turn on push notifications, shown only to players
// with no push subscription on any device (decided server-side, passed in as
// `hasPush`). Without push, availability reminders and squad announcements
// only reach a player when they open the Hub. Reuses the shared subscribe
// flow in src/lib/pushSubscription.ts. See
// .claude/rules/features/push-notifications.md §13.

import { useEffect, useState } from 'react'
import { hasLocalPushSubscription, subscribeToPush } from '@/lib/pushSubscription'

const DISMISS_KEY = 'hub-push-card-dismissed-at'
const DISMISS_DAYS = 14

type Mode = 'hidden' | 'enable' | 'ios_install' | 'blocked' | 'done'

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true
}

function isIOS(): boolean {
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && navigator.maxTouchPoints > 1)
}

export function PushOnCard({ hasPush }: { hasPush: boolean }) {
  const [mode, setMode] = useState<Mode>('hidden')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (hasPush) return
    let cancelled = false
    async function decide() {
      try {
        const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) ?? 0)
        if (dismissedAt && Date.now() - dismissedAt < DISMISS_DAYS * 86400000) return
      } catch {
        return // storage blocked: stay quiet rather than show it on every load
      }
      // iPhone/iPad: web push only works in the installed app (iOS 16.4+).
      if (isIOS() && !isStandalone()) { if (!cancelled) setMode('ios_install'); return }
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
      if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
        if (!cancelled) setMode('blocked')
        return
      }
      // A subscription on this device the server doesn't know about yet: say nothing.
      if (await hasLocalPushSubscription()) return
      if (!cancelled) setMode('enable')
    }
    void decide()
    return () => { cancelled = true }
  }, [hasPush])

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch {}
    setMode('hidden')
  }

  async function enable() {
    setLoading(true)
    setError('')
    const result = await subscribeToPush()
    setLoading(false)
    if (result.ok) setMode('done')
    else setError(result.error)
  }

  if (mode === 'hidden') return null

  return (
    <div
      className="mb-5 rounded-xl p-4"
      style={{ background: 'var(--home-nudge-bg)', border: '1px solid var(--home-nudge-border)' }}
      role="region"
      aria-label="Turn on notifications"
    >
      {mode === 'done' ? (
        <p className="font-rajdhani text-sm font-semibold" style={{ color: 'var(--home-nudge-title)' }}>
          🔔 Notifications are on. You&apos;ll hear about reminders and squad announcements on this device.
        </p>
      ) : (
        <div className="flex items-start gap-3">
          <span className="text-xl flex-shrink-0">🔔</span>
          <div className="min-w-0 flex-1">
            <p className="font-cinzel text-xs font-semibold" style={{ color: 'var(--home-nudge-title)' }}>
              Turn on notifications
            </p>
            <p className="font-rajdhani text-xs mt-0.5" style={{ color: 'var(--home-nudge-body)' }}>
              {mode === 'ios_install' && <>Get availability reminders and know the moment you&apos;re picked. On iPhone, tap <strong>Share</strong> then <strong>Add to Home Screen</strong>, open the Hub from that icon and turn notifications on there.</>}
              {mode === 'blocked' && <>Notifications are blocked for the Hub in this browser. Allow them in your browser or phone settings to get availability reminders and squad announcements.</>}
              {mode === 'enable' && <>Get availability reminders and know the moment you&apos;re picked, without opening the Hub.</>}
            </p>
            {error && <p className="font-rajdhani text-xs mt-1 text-red-700 dark:text-red-400">{error}</p>}
            <div className="flex gap-3 items-center mt-2.5">
              {mode === 'enable' && (
                <button
                  onClick={enable}
                  disabled={loading}
                  className="font-rajdhani text-xs font-bold tracking-widest uppercase px-3 py-1.5 rounded bg-[var(--fx-selected-bg)] text-[var(--fx-selected-text)] disabled:opacity-50"
                >
                  {loading ? 'Enabling…' : 'Turn on'}
                </button>
              )}
              <button
                onClick={dismiss}
                disabled={loading}
                className="font-rajdhani text-xs font-bold disabled:opacity-50"
                style={{ color: 'var(--home-nudge-body)' }}
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
