'use client'

import { useEffect, useState } from 'react'
import { hasLocalPushSubscription, subscribeToPush } from '@/lib/pushSubscription'

const DISMISS_KEY = 'push-prompt-dismissed-at'
const DISMISS_DAYS = 14

// Prompts a signed-in player to subscribe to push notifications if this
// device has never subscribed (or lost its subscription — see
// features/push-notifications.md). Never shown if the browser doesn't
// support push, permission is already denied, or the player dismissed it
// within the last DISMISS_DAYS.
export function PushSubscribePrompt() {
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function check() {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
      if (typeof Notification !== 'undefined' && Notification.permission === 'denied') return
      const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) ?? 0)
      if (dismissedAt && Date.now() - dismissedAt < DISMISS_DAYS * 24 * 60 * 60 * 1000) return
      const already = await hasLocalPushSubscription()
      if (!already && !cancelled) setShow(true)
    }
    check()
    return () => { cancelled = true }
  }, [])

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setShow(false)
  }

  async function handleSubscribe() {
    setLoading(true)
    setError('')
    const result = await subscribeToPush()
    setLoading(false)
    if (result.ok) {
      setShow(false)
    } else {
      setError(result.error)
    }
  }

  if (!show) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-label="Subscribe to notifications"
    >
      <div className="bg-ink-2 border border-ink-4 rounded-lg max-w-sm w-full p-5 shadow-xl">
        <p className="text-2xl mb-2">🔔</p>
        <h2 className="font-cinzel text-base font-bold text-parchment mb-1.5">
          Never miss a squad announcement
        </h2>
        <p className="font-rajdhani text-sm text-zinc-400 mb-4">
          Turn on notifications and we'll ping you the moment you're picked for a match.
        </p>
        {error && <p className="font-rajdhani text-xs text-crimson mb-3">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button
            onClick={dismiss}
            disabled={loading}
            className="font-rajdhani text-xs font-bold text-zinc-500 hover:text-zinc-300 px-3 py-2 disabled:opacity-50"
          >
            Maybe later
          </button>
          <button
            onClick={handleSubscribe}
            disabled={loading}
            className="font-rajdhani text-xs font-bold tracking-widest uppercase bg-gold hover:bg-gold/90 text-ink-1 px-4 py-2 rounded transition-colors disabled:opacity-50"
          >
            {loading ? 'Enabling...' : 'Subscribe'}
          </button>
        </div>
      </div>
    </div>
  )
}
