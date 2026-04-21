import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Spartans Hub',
    short_name: 'Spartans',
    description: 'Spartans CC BLR — Fixtures, Availability & Squad Hub',
    start_url: '/fixtures',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0D0F14',
    theme_color: '#C9A84C',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  }
}
