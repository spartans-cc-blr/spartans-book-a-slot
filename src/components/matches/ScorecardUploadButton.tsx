'use client'

import { useRef, useState } from 'react'

export type ScorecardStatus = 'pending_parse' | 'parsed' | 'synced' | 'fees_applied'

export const SCORECARD_STATUS_CONFIG: Record<ScorecardStatus, { label: string; className: string }> = {
  pending_parse: { label: 'Processing…',        className: 'bg-ink-4 border-ink-5 text-zinc-400' },
  parsed:        { label: 'Awaiting Admin Sync', className: 'bg-amber-950/40 border-amber-800 text-amber-400' },
  synced:        { label: 'Stats Synced ✓',      className: 'bg-emerald-950/40 border-emerald-800 text-emerald-400' },
  fees_applied:  { label: 'Fees Applied ✓',      className: 'bg-emerald-950/40 border-emerald-800 text-emerald-400' },
}

function Spinner() {
  return <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
}

export function ScorecardUploadButton({
  bookingId, uploadStatus, canUpload, onStatusChange,
}: {
  bookingId: string
  uploadStatus: ScorecardStatus | null
  canUpload: boolean
  onStatusChange: (bookingId: string, status: ScorecardStatus) => void
}) {
  const [status, setStatus]     = useState<ScorecardStatus | null>(uploadStatus)
  const [uploading, setUploading] = useState(false)
  const [error, setError]       = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  if (!canUpload) return null

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setUploading(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/matches/${bookingId}/scorecard`, { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Upload failed'); return }
      setStatus('pending_parse')
      onStatusChange(bookingId, 'pending_parse')
    } catch {
      setError('Network error')
    } finally {
      setUploading(false)
    }
  }

  if (status) {
    const cfg = SCORECARD_STATUS_CONFIG[status]
    return (
      <div className={`font-rajdhani text-[11px] font-bold tracking-wide px-2.5 py-1 rounded border inline-flex items-center gap-1.5 w-fit ${cfg.className}`}>
        {status === 'pending_parse' && <Spinner />}
        {cfg.label}
      </div>
    )
  }

  return (
    <div>
      <input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={handleFile} />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="font-rajdhani text-[11px] font-bold tracking-wide bg-gold/10 border border-gold-dim text-gold hover:bg-gold/20 disabled:opacity-40 px-2.5 py-1 rounded transition-colors">
        {uploading ? 'Uploading…' : 'Upload Scorecard'}
      </button>
      {error && <p className="font-rajdhani text-[10px] text-red-400 mt-1">{error}</p>}
    </div>
  )
}
