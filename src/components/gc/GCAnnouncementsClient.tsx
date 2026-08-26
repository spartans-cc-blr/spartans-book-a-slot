'use client'

import { useEffect, useState } from 'react'
import { SiteNav } from '@/components/ui/SiteNav'

interface HistoryItem {
  id:              string
  title:           string
  body:            string
  original_body:   string | null
  recipient_count: number
  created_at:      string
  sent_by_name:    string
}

export function GCAnnouncementsClient({ currentGcName }: { currentGcName: string }) {
  const [title, setTitle] = useState('')
  const [body, setBody]   = useState('')

  // Snapshot of the sender's own words right before a polish request, so
  // "Revert to my draft" and the send route's original_body audit field
  // both have something to compare against.
  const [draftSnapshot, setDraftSnapshot] = useState<{ title: string; body: string } | null>(null)
  const [wasPolished, setWasPolished] = useState(false)
  const [polishing, setPolishing]     = useState(false)
  const [polishError, setPolishError] = useState('')

  const [sending, setSending]         = useState(false)
  const [sendError, setSendError]     = useState('')
  const [sendSuccess, setSendSuccess] = useState<{ recipient_count: number } | null>(null)

  const [history, setHistory]               = useState<HistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)

  function loadHistory() {
    setHistoryLoading(true)
    fetch('/api/gc/announcements')
      .then(res => res.json())
      .then(d => setHistory(d.announcements ?? []))
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
  }

  useEffect(loadHistory, [])

  async function handlePolish() {
    if (!title.trim() || !body.trim()) return
    setPolishing(true)
    setPolishError('')
    const snapshot = { title, body }
    try {
      const res = await fetch('/api/gc/announcements/polish', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(snapshot),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed to polish')
      setDraftSnapshot(snapshot)
      setTitle(d.title)
      setBody(d.body)
      setWasPolished(true)
    } catch (e: any) {
      setPolishError(e.message)
    } finally {
      setPolishing(false)
    }
  }

  function revertToDraft() {
    if (!draftSnapshot) return
    setTitle(draftSnapshot.title)
    setBody(draftSnapshot.body)
    setWasPolished(false)
    setDraftSnapshot(null)
  }

  async function handleSend() {
    if (!title.trim() || !body.trim()) return
    const confirmed = window.confirm(
      `Send this to every player with push notifications enabled?\n\n"${title}"\n\n${body}`
    )
    if (!confirmed) return

    setSending(true)
    setSendError('')
    setSendSuccess(null)
    try {
      const res = await fetch('/api/gc/announcements', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          body,
          original_body: wasPolished && draftSnapshot ? draftSnapshot.body : undefined,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed to send')
      setSendSuccess({ recipient_count: d.recipient_count })
      setTitle('')
      setBody('')
      setDraftSnapshot(null)
      setWasPolished(false)
      loadHistory()
    } catch (e: any) {
      setSendError(e.message)
    } finally {
      setSending(false)
    }
  }

  const inputClass = 'w-full border border-[#D4C9B0] rounded px-3 py-2 font-rajdhani text-sm text-[#1C1917] bg-white focus:outline-none focus:border-[#D97706]'

  return (
    <div className="min-h-screen bg-[#F8F4EE] flex flex-col">
      <SiteNav activePage="gc" />

      <main className="flex-1 px-4 md:px-8 lg:px-10 py-8 max-w-2xl mx-auto w-full">
        <p className="font-rajdhani text-xs font-bold tracking-widest uppercase text-stone-500 mb-1">
          Governing Council · Sending as {currentGcName}
        </p>
        <h1 className="font-cinzel text-xl font-bold text-[#1C1917] mb-1">Announcements</h1>
        <p className="font-rajdhani text-sm text-stone-500 mb-6">
          Push notification to every player with notifications enabled. AI polish is optional — you always see
          and can edit the final wording before anything sends.
        </p>

        <div className="bg-white border border-[#D4C9B0] rounded-lg p-5 mb-6 space-y-4">
          <div>
            <label className="font-rajdhani text-xs font-bold tracking-widest uppercase text-stone-500 block mb-1.5">Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={80}
              placeholder="e.g. Ground change for Saturday's match"
              className={inputClass}
            />
            <p className="font-rajdhani text-[10px] text-stone-400 mt-1">{title.length}/80</p>
          </div>
          <div>
            <label className="font-rajdhani text-xs font-bold tracking-widest uppercase text-stone-500 block mb-1.5">Message</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              maxLength={500}
              rows={4}
              placeholder="What do you want to tell everyone?"
              className={`${inputClass} resize-none`}
            />
            <p className="font-rajdhani text-[10px] text-stone-400 mt-1">{body.length}/500</p>
          </div>

          {wasPolished && (
            <div className="bg-[#E1F5EE] border border-[#5DCAA5] rounded px-3 py-2 flex items-center justify-between gap-3 flex-wrap">
              <p className="font-rajdhani text-xs text-[#085041]">
                ✨ Cleaned up by AI — review above, edit anything, then send.
              </p>
              <button onClick={revertToDraft} className="font-rajdhani text-xs font-semibold text-stone-500 hover:text-[#1C1917] flex-shrink-0">
                Revert to my draft
              </button>
            </div>
          )}
          {polishError && <p className="font-rajdhani text-xs text-red-600">{polishError}</p>}
          {sendError && <p className="font-rajdhani text-xs text-red-600">{sendError}</p>}
          {sendSuccess && (
            <p className="font-rajdhani text-xs font-semibold text-[#1D9E75]">
              Sent to {sendSuccess.recipient_count} player{sendSuccess.recipient_count === 1 ? '' : 's'}.
            </p>
          )}

          <div className="flex items-center gap-3 pt-1 flex-wrap">
            <button
              onClick={handlePolish}
              disabled={polishing || sending || !title.trim() || !body.trim()}
              className="font-rajdhani text-xs font-bold tracking-widest uppercase bg-[#EEEAE2] border border-[#D4C9B0] text-stone-600 hover:border-[#D97706] hover:text-[#D97706] disabled:opacity-40 px-4 py-2.5 rounded transition-colors">
              {polishing ? 'Polishing…' : '✨ Polish with AI'}
            </button>
            <button
              onClick={handleSend}
              disabled={sending || polishing || !title.trim() || !body.trim()}
              className="font-rajdhani text-xs font-bold tracking-widest uppercase bg-[#D97706] hover:bg-[#B45309] text-white disabled:opacity-40 px-4 py-2.5 rounded transition-colors ml-auto">
              {sending ? 'Sending…' : 'Send to All Players'}
            </button>
          </div>
        </div>

        <h2 className="font-rajdhani text-xs font-bold tracking-widest uppercase text-stone-500 mb-2">Recent Announcements</h2>
        {historyLoading && <p className="font-rajdhani text-sm text-stone-400">Loading…</p>}
        {!historyLoading && history.length === 0 && (
          <p className="font-rajdhani text-sm text-stone-400">No announcements sent yet.</p>
        )}
        <div className="space-y-2">
          {history.map(a => (
            <div key={a.id} className="bg-white border border-[#D4C9B0] rounded-lg px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <p className="font-rajdhani text-sm font-semibold text-[#1C1917]">{a.title}</p>
                <span className="font-rajdhani text-[10px] text-stone-400 flex-shrink-0 whitespace-nowrap">
                  {new Date(a.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="font-rajdhani text-xs text-stone-600 mt-0.5">{a.body}</p>
              <p className="font-rajdhani text-[10px] text-stone-400 mt-1.5">
                {a.sent_by_name} · {a.recipient_count} recipient{a.recipient_count === 1 ? '' : 's'}
                {a.original_body && ' · AI-polished'}
              </p>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
