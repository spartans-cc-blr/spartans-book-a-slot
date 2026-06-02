'use client'
// src/components/ui/InviteLinkButton.tsx
// "Generate Invite Link" button — used in /admin/players and /gc-review.
// Calls POST /api/invite-tokens, shows the resulting URL with copy + WhatsApp share.

import { useState } from 'react'

export function InviteLinkButton() {
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')
  const [inviteUrl,  setInviteUrl]  = useState('')
  const [expiresAt,  setExpiresAt]  = useState('')
  const [copied,     setCopied]     = useState(false)

  async function generate() {
    setLoading(true)
    setError('')
    setInviteUrl('')
    setCopied(false)

    try {
      const res  = await fetch('/api/invite-tokens', { method: 'POST' })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Failed to generate link.')
        return
      }

      setInviteUrl(data.url)
      setExpiresAt(data.expires_at)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Fallback: select the text manually
    }
  }

  const waText = encodeURIComponent(
    `Hi! Here's your invite link to join Spartans Hub. Click to register:\n${inviteUrl}\n\n(Link valid for 72 hours)`
  )
  const waLink = `https://wa.me/?text=${waText}`

  const expiryLabel = expiresAt
    ? new Date(expiresAt).toLocaleString('en-IN', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    : ''

  return (
    <div className="flex flex-col gap-2">
      {/* Generate button */}
      <button
        onClick={generate}
        disabled={loading}
        className="font-rajdhani text-xs font-bold tracking-wide px-4 py-2 rounded-sm bg-gold/10 border border-gold-dim text-gold hover:bg-gold/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
      >
        {loading ? 'Generating…' : '🔗 Generate Invite Link'}
      </button>

      {/* Error */}
      {error && (
        <p className="font-rajdhani text-[10px] text-red-400">{error}</p>
      )}

      {/* Result panel */}
      {inviteUrl && (
        <div className="bg-ink-3 border border-ink-5 rounded p-3 space-y-2 min-w-0">
          {/* URL display */}
          <p className="font-rajdhani text-[10px] text-zinc-500 break-all leading-relaxed">
            {inviteUrl}
          </p>

          {/* Expiry */}
          <p className="font-rajdhani text-[9px] text-zinc-600">
            Expires: {expiryLabel} · Single use
          </p>

          {/* Action buttons */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={copy}
              className="flex items-center gap-1.5 font-rajdhani text-[10px] font-bold px-3 py-1.5 rounded-sm border border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500 transition-colors"
            >
              <CopyIcon />
              {copied ? '✓ Copied' : 'Copy link'}
            </button>

            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 font-rajdhani text-[10px] font-bold px-3 py-1.5 rounded-sm bg-emerald-950/40 border border-emerald-700 text-emerald-400 hover:bg-emerald-950/70 transition-colors"
            >
              <WAIcon />
              Share on WhatsApp
            </a>
          </div>

          {/* Regenerate note */}
          <p className="font-rajdhani text-[9px] text-zinc-700">
            Each click generates a new link. One link = one player.
          </p>
        </div>
      )}
    </div>
  )
}

function CopyIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2"/>
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
    </svg>
  )
}

function WAIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
    </svg>
  )
}
