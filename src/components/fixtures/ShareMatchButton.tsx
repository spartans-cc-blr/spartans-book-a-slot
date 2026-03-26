'use client'
import { useState } from 'react'

export function ShareMatchButton({ bookingId }: { bookingId: string }) {
  const [copied, setCopied] = useState(false)

  const url = `${typeof window !== 'undefined' ? window.location.origin : 'https://hub.spartanscricketclub.in'}/fixtures/${bookingId}`

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Spartans Match', url })
        return
      } catch {}
    }
    // Fallback — copy to clipboard
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <button onClick={handleShare} style={{
      width: '100%', padding: '10px',
      background: copied ? '#1a3d1a' : '#1a2235',
      border: `1px solid ${copied ? '#166534' : '#2D3748'}`,
      borderRadius: '8px', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
      color: copied ? '#4ade80' : '#9CA3AF',
      fontSize: '12px', fontWeight: 600, letterSpacing: '0.05em',
      transition: 'all 0.2s',
    }}>
      {copied ? '✅ Link copied!' : '🔗 Share this match'}
    </button>
  )
}