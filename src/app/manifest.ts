import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Spartans Hub',
    short_name: 'Spartans',
    description: 'Spartans CC BLR — Fixtures, Availability & Squad Hub',
    id: '/',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F8F4EE',
    theme_color: '#FFFFFF',
    categories: ['sports', 'lifestyle'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Mark availability', short_name: 'Availability', url: '/fixtures', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'My wallet', short_name: 'Wallet', url: '/wallet', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Leaderboard', short_name: 'Stats', url: '/leaderboard', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  }
}