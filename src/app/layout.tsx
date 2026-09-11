import type { Metadata } from 'next'
import { Cinzel, Rajdhani } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { ChunkErrorBoundary } from '@/components/ui/ChunkErrorBoundary'
import { GlobalMilestoneModal } from '@/components/ui/GlobalMilestoneModal'
import { GlobalBirthdayModal } from '@/components/ui/GlobalBirthdayModal'
import { GlobalFeeReminderModal } from '@/components/ui/GlobalFeeReminderModal'
import { ThemeProvider, themeInitScript } from '@/components/ui/ThemeProvider'

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
    // suppressHydrationWarning: the inline script below sets data-theme on
    // this element before React hydrates, which would otherwise trip a
    // server/client mismatch warning for this one attribute — same pattern
    // every hand-rolled (and next-themes-based) light/dark toggle uses.
    <html lang="en" className={`${cinzel.variable} ${rajdhani.variable}`} suppressHydrationWarning>
      <head>
        {/* Must run before <body> paints — reads the stored Light/Dark/System
            preference (or the OS's prefers-color-scheme when 'system') and
            stamps data-theme synchronously, so the first frame is already
            correct instead of flashing dark-then-light or vice versa. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="bg-ink text-parchment font-rajdhani antialiased">
        <Providers>
          <ThemeProvider>
            <ChunkErrorBoundary>
              <GlobalBirthdayModal />
              <GlobalMilestoneModal />
              <GlobalFeeReminderModal />
              {children}
            </ChunkErrorBoundary>
          </ThemeProvider>
        </Providers>
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
