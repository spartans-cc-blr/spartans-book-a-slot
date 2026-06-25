const CACHE = 'spartans-v1'
const OFFLINE_URL = '/offline'

// Cache the app shell on install
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      cache.addAll(['/', '/fixtures', '/offline', '/icons/icon-192.png'])
    )
  )
  self.skipWaiting()
})

// Clean old caches on activate
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Network-first for API and auth routes, cache-first for shell
self.addEventListener('fetch', e => {
  const { request } = e
  const url = new URL(request.url)

  // Never intercept auth, API, or Supabase calls
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/api/auth') ||
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('googleapis.com')
  ) {
    return // Let it go to network untouched
  }

  // Cache-first for static shell
  e.respondWith(
    caches.match(request).then(cached => {
      return cached ?? fetch(request).catch(() =>
        caches.match(OFFLINE_URL)
      )
    })
  )
})

// ── Push notifications ──────────────────────────────────────────────
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}
  const title = data.title ?? 'Spartans CC'
  const options = {
    body: data.body ?? '',
    icon: '/favicon.ico',
    data: { url: data.url ?? '/fixtures' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/fixtures'
  event.waitUntil(clients.openWindow(url))
})
