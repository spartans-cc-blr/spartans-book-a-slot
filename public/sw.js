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
