'use client'
// Shared back affordance — see features/back-navigation.md §2.
//
//   in-app history exists → router.back()  (label "← Back")
//   landed here cold      → <Link href={fallbackHref}>  (label "← {fallbackLabel}")
//
// The fallback is each page's natural parent — the destinations the old
// hardcoded "← …" links already used — so a WhatsApp share link, a push
// notification tap or a bookmark still has a working exit in a standalone
// PWA where router.back() would otherwise leave the app or do nothing.
// fallbackHref is always a hardcoded page constant, never read from the
// URL — a crafted ?back=https://… can never redirect anyone.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCanGoBack } from '@/components/ui/NavHistoryProvider'

interface BackButtonProps {
  fallbackHref:  string
  fallbackLabel: string
  className?:    string
  // 'nav' — compact chevron for SiteNav's mobile top row; 'inline' — the
  // text-link style used inside page bodies (default).
  variant?:      'inline' | 'nav'
}

export function BackButton({ fallbackHref, fallbackLabel, className, variant = 'inline' }: BackButtonProps) {
  const router = useRouter()
  const canBack = useCanGoBack()

  const label = canBack ? 'Back' : fallbackLabel
  const base = variant === 'nav'
    ? 'inline-flex items-center gap-1 font-rajdhani text-xs font-bold text-gold hover:text-gold-light transition-colors -ml-1 pr-1 py-1'
    : 'inline-flex items-center gap-1 font-rajdhani text-xs font-bold text-gold hover:text-gold-light transition-colors'
  const cls = `${base} ${className ?? ''}`.trim()
  const glyph = variant === 'nav' ? <span className="text-lg leading-none">‹</span> : <span>←</span>
  const text = variant === 'nav' ? (canBack ? 'Back' : label) : label

  if (canBack) {
    return (
      <button type="button" onClick={() => router.back()} className={cls} aria-label="Go back">
        {glyph}<span>{text}</span>
      </button>
    )
  }
  return (
    <Link href={fallbackHref} className={cls}>
      {glyph}<span>{text}</span>
    </Link>
  )
}
