'use client'
import { SessionProvider } from 'next-auth/react'
import { NavHistoryProvider } from '@/components/ui/NavHistoryProvider'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <NavHistoryProvider>{children}</NavHistoryProvider>
    </SessionProvider>
  )
}
