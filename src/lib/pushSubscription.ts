'use client'

// Shared browser-side push subscribe/unsubscribe helpers — client-only,
// used by both the /profile subscribe button and the fixtures subscribe
// prompt so the two surfaces can't drift on the actual subscribe flow.

type PushResult = { ok: true } | { ok: false; error: string }

export async function hasLocalPushSubscription(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  return !!sub
}

export async function subscribeToPush(): Promise<PushResult> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, error: 'Push notifications are not supported in this browser.' }
  }
  if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
    return { ok: false, error: 'Notifications are blocked for this site — enable them in your browser/device settings, then try again.' }
  }
  try {
    const reg = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    })
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub.toJSON()),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      return { ok: false, error: d.error ?? 'Could not save your subscription. Please try again.' }
    }
    return { ok: true }
  } catch (err: any) {
    return {
      ok: false,
      error:
        err?.name === 'NotAllowedError'
          ? 'Notification permission was not granted — allow notifications for this site and try again.'
          : 'Could not enable notifications on this device. Please try again.',
    }
  }
}

export async function unsubscribeFromPush(): Promise<PushResult> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, error: 'Push notifications are not supported in this browser.' }
  }
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return { ok: true }
    const endpoint = sub.endpoint
    await sub.unsubscribe()
    const res = await fetch('/api/push/subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      return { ok: false, error: d.error ?? 'Could not remove your subscription. Please try again.' }
    }
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: 'Could not disable notifications on this device. Please try again.' }
  }
}
