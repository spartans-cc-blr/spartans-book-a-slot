'use client'

import { useEffect, useRef, useState } from 'react'

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

// The server streams newline-delimited JSON progress events once past its
// fast validation checks, so a slow upload shows exactly which stage it's
// in (recording the row vs. waiting on the microservice vs. finalizing)
// instead of one opaque "Uploading…" for the whole duration.
async function uploadWithProgress(
  bookingId: string,
  file: File,
  onStep: (message: string) => void
): Promise<{ ok: true; status: ScorecardStatus } | { ok: false; error: string }> {
  const fd = new FormData()
  fd.append('file', file)

  let res: Response
  try {
    res = await fetch(`/api/matches/${bookingId}/scorecard`, { method: 'POST', body: fd })
  } catch {
    return { ok: false, error: 'Network error' }
  }

  if (!res.ok) {
    // Fast validation failure (auth/booking/file checks) — plain JSON error,
    // never entered the streaming path.
    const data = await res.json().catch(() => ({}))
    return { ok: false, error: data.error ?? 'Upload failed' }
  }

  if (!res.body) return { ok: false, error: 'Upload failed — empty response' }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  // The route sets status: 'parsed' on its terminal `done` event — reading
  // it here (rather than assuming) is what fixes the local badge getting
  // stuck showing "Processing…" after the upload already finished server-side.
  let doneStatus: ScorecardStatus | null = null
  let failure: string | null = null

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      let event: any
      try { event = JSON.parse(line) } catch { continue }
      if (event.step === 'error') {
        failure = event.message ?? 'Upload failed'
      } else if (event.step === 'done') {
        doneStatus = event.status ?? 'pending_parse'
      } else if (event.message) {
        onStep(event.message)
      }
    }
  }

  if (failure) return { ok: false, error: failure }
  if (!doneStatus) return { ok: false, error: 'Upload ended unexpectedly — please retry' }
  return { ok: true, status: doneStatus }
}

export function ScorecardUploadButton({
  bookingId, uploadStatus, canUpload, onStatusChange,
}: {
  bookingId: string
  uploadStatus: ScorecardStatus | null
  canUpload: boolean
  onStatusChange: (bookingId: string, status: ScorecardStatus) => void
}) {
  const [status, setStatus]       = useState<ScorecardStatus | null>(uploadStatus)
  const [uploading, setUploading] = useState(false)
  const [stepMessage, setStepMessage] = useState('')
  const [error, setError]         = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // uploadStatus can change from elsewhere (e.g. the admin "Sync Stats"
  // action updates the parent's status independently of this component's
  // own upload flow) — without this, status only ever reflected whatever
  // uploadStatus was at mount, so the badge got stuck on a stale value.
  useEffect(() => {
    setStatus(uploadStatus)
  }, [uploadStatus])

  if (!canUpload) return null

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setUploading(true)
    setError('')
    setStepMessage('Uploading file…')

    const result = await uploadWithProgress(bookingId, file, setStepMessage)

    if (!result.ok) {
      setError(result.error)
    } else {
      setStatus(result.status)
      onStatusChange(bookingId, result.status)
    }
    setUploading(false)
    setStepMessage('')
  }

  const input = <input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={handleFile} />
  const progress = uploading && stepMessage && (
    <p className="font-rajdhani text-[10px] text-zinc-500 mt-1 max-w-[220px]">{stepMessage}</p>
  )

  // parsed/synced/fees_applied are server-confirmed checkpoints — re-uploading
  // over one of those is an admin-only override (Post-Match panel), not a
  // casual retry, so no self-service action is offered here.
  if (status && status !== 'pending_parse') {
    const cfg = SCORECARD_STATUS_CONFIG[status]
    return (
      <div className={`font-rajdhani text-[11px] font-bold tracking-wide px-2.5 py-1 rounded border inline-flex items-center gap-1.5 w-fit ${cfg.className}`}>
        {cfg.label}
      </div>
    )
  }

  // pending_parse is the only state that can genuinely get stuck (a killed
  // or timed-out parse request) — a retry here just re-upserts the row and
  // tries again, which is safe to repeat.
  if (status === 'pending_parse') {
    const cfg = SCORECARD_STATUS_CONFIG.pending_parse
    return (
      <div className="space-y-1">
        {input}
        <div className={`font-rajdhani text-[11px] font-bold tracking-wide px-2.5 py-1 rounded border inline-flex items-center gap-1.5 w-fit ${cfg.className}`}>
          <Spinner />
          {uploading ? 'Uploading…' : cfg.label}
        </div>
        {progress}
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="font-rajdhani text-[10px] font-semibold text-zinc-500 hover:text-gold disabled:opacity-40 underline underline-offset-2 transition-colors block">
          Stuck? Retry upload
        </button>
        {error && <p className="font-rajdhani text-[10px] text-red-400">{error}</p>}
      </div>
    )
  }

  return (
    <div>
      {input}
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="font-rajdhani text-[11px] font-bold tracking-wide bg-gold/10 border border-gold-dim text-gold hover:bg-gold/20 disabled:opacity-40 px-2.5 py-1 rounded transition-colors">
        {uploading ? 'Uploading…' : 'Upload Scorecard'}
      </button>
      {progress}
      {error && <p className="font-rajdhani text-[10px] text-red-400 mt-1">{error}</p>}
    </div>
  )
}
