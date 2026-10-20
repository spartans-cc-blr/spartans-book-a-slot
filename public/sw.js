// Bump VERSION to invalidate every cache on the next deploy.
const VERSION = 'v3'
const STATIC_CACHE = `spartans-static-${VERSION}`
const OFFLINE_URL = '/offline.html'
const PRECACHE = [OFFLINE_URL, '/images/logo-64.png', '/icons/icon-192.png']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(STATIC_CACHE).then(c => c.addAll(PRECACHE)))
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== STATIC_CACHE).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  const { request } = e
  if (request.method !== 'GET') return
  const url = new URL(request.url)

  // Never intercept API, auth or third-party calls.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  // Page loads are session-bound: always network, offline page as fallback only.
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request, { cache: 'no-store' }).catch(() => caches.match(OFFLINE_URL))
    )
    return
  }

  // Hashed build assets and icons never change for a given URL: cache-first.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/images/')) {
    e.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached
        return fetch(request).then(res => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(STATIC_CACHE).then(c => c.put(request, copy))
          }
          return res
        })
      })
    )
  }
  // Everything else goes straight to the network.
})

// ── Push notifications ──────────────────────────────────────────────
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {}
  const url = data.url ?? '/fixtures'
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Spartans CC', {
      body: data.body ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      // Same destination replaces the previous notification instead of stacking.
      tag: data.tag ?? url,
      renotify: true,
      data: { url },
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const target = new URL(event.notification.data?.url ?? '/fixtures', self.location.origin).href
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(wins => {
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin && 'focus' in w) {
          return w.focus().then(f => ('navigate' in f ? f.navigate(target) : f))
        }
      }
      return clients.openWindow(target)
    })
  )
})
