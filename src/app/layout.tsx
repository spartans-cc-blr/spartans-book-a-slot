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
  title: 'Spartans CC — Fixture Availability',
  description: 'Book a game slot with Spartans Cricket Club, Bengaluru.',
  openGraph: {
    title: 'Spartans CC — Fixture Availability',
    description: 'Live slot availability for tournament organisers.',
    siteName: 'Spartans Cricket Club',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${cinzel.variable} ${rajdhani.variable}`}>
      <body className="bg-ink text-parchment font-rajdhani antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
