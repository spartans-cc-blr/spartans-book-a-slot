'use client'
import { useState } from 'react'

export function GenerateInviteItem({ mobile, onClose }: { mobile?: boolean, onClose?: () => void }) {
  const [loading,   setLoading]   = useState(false)
  const [inviteUrl, setInviteUrl] = useState('')
  const [copied,    setCopied]    = useState(false)
  const [error,     setError]     = useState('')

  async function generate() {
    setLoading(true); setError(''); setInviteUrl(''); setCopied(false)
    try {
      const res  = await fetch('/api/invite-tokens', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed'); return }
      setInviteUrl(data.url)
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }

  async function copy() {
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true); setTimeout(() => setCopied(false), 2500)
  }

  const waText = encodeURIComponent(`Hi! Here's your invite link to join Spartans Hub:\n${inviteUrl}\n\n(Valid 72 hrs)`)

  if (mobile) {
    return (
      <div className="py-2.5 border-b border-[#E7E0D3] dark:border-ink-4">
        <button onClick={generate} disabled={loading}
          className="font-rajdhani text-sm font-bold tracking-wide uppercase text-gold disabled:opacity-40">
          {loading ? 'Generating…' : '🔗 Generate Invite Link'}
        </button>
        {inviteUrl && (
          <div className="mt-2 flex gap-2">
            <button onClick={copy}
              className="font-rajdhani text-xs text-[#78716C] dark:text-zinc-400 border border-[#D4C9B0] dark:border-zinc-700 px-2 py-1 rounded">
              {copied ? '✓ Copied' : 'Copy'}
            </button>
            <a href={`https://wa.me/?text=${waText}`} target="_blank" rel="noopener noreferrer"
              className="font-rajdhani text-xs text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700 px-2 py-1 rounded">
              WhatsApp
            </a>
          </div>
        )}
        {error && <p className="font-rajdhani text-[10px] text-[#B91C1C] dark:text-red-400 mt-1">{error}</p>}
      </div>
    )
  }

  return (
    <div className="px-4 py-3">
      <button onClick={generate} disabled={loading}
        className="w-full font-rajdhani text-xs font-semibold tracking-wide uppercase text-left text-[#44403C] dark:text-zinc-400 hover:text-gold transition-colors flex items-center gap-2 disabled:opacity-40">
        🔗 {loading ? 'Generating…' : 'Generate Invite Link'}
      </button>
      {inviteUrl && (
        <div className="mt-2 flex gap-2">
          <button onClick={copy}
            className="font-rajdhani text-[10px] text-[#78716C] dark:text-zinc-500 border border-[#D4C9B0] dark:border-ink-5 px-2 py-1 rounded hover:text-[#44403C] dark:hover:text-zinc-300">
            {copied ? '✓ Copied' : 'Copy link'}
          </button>
          <a href={`https://wa.me/?text=${waText}`} target="_blank" rel="noopener noreferrer"
            className="font-rajdhani text-[10px] text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700 px-2 py-1 rounded hover:bg-emerald-50 dark:hover:bg-emerald-950/40">
            WhatsApp
          </a>
        </div>
      )}
      {error && <p className="font-rajdhani text-[10px] text-[#B91C1C] dark:text-red-400 mt-1">{error}</p>}
    </div>
  )
}
