import type { Metadata } from 'next'
import { Cinzel, Rajdhani } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

const cinzel = Cinzel({
  subsets: ['latin'],
  variable: '--font-cinzel',
  display: 'swap',
})

const rajdhani = Rajdhani({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-rajdhani',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Spartans Hub',
  description: 'Spartans CC BLR — Fixtures, Availability & Squad Hub.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Spartans Hub',
  },
  openGraph: {
    title: 'Spartans Hub',
    description: 'Spartans CC BLR — Fixtures, Availability & Squad Hub.',
    siteName: 'Spartans Cricket Club',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${cinzel.variable} ${rajdhani.variable}`}>
      <body className="bg-ink text-parchment font-rajdhani antialiased">
        <Providers>{children}</Providers>
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
              navigator.serviceWorker.register('/sw.js')
                .catch(function(e) { console.warn('SW failed:', e); });
            });
          }
        `}} />
      </body>
    </html>
  )
}
