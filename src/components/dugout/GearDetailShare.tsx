'use client'

import { useState, useCallback } from 'react'

export function GearDetailShare({ listingId }: { listingId: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    const url = `${window.location.origin}/dugout/gear/${listingId}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [listingId])

  return (
    <button
      onClick={handleCopy}
      className="border border-[#D4C9B0] text-stone-600 font-rajdhani text-xs px-3 py-1 rounded hover:bg-parchment-3 self-start"
    >
      {copied ? 'Copied!' : 'Copy Link'}
    </button>
  )
}
