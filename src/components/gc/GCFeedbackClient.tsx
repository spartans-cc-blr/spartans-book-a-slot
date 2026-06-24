'use client'

import { useState, useEffect, useCallback } from 'react'
import { PlayerNameLink } from '@/lib/playerLink'
import { SiteNav } from '@/components/ui/SiteNav'

interface Campaign {
  id: string
  title: string
  questions: string[]
  created_at: string
  closed_at: string | null
}

interface Player {
  id: string
  name: string
  cricheroes_url: string | null
  primary_skill: string | null
  secondary_skill: string | null
  photo_url: string | null
  status: string
}

interface GCFeedbackClientProps {
  campaigns: Campaign[]
  players: Player[]
  currentGcId: string
  currentGcName: string
}

const DEFAULT_QUESTIONS = [
  'Are you happy overall with the club?',
  'Are you happy with the Captains / Leaders, or do you have any concerns?',
  'What role are you currently performing, and what role do you aspire to?',
  'Are you getting enough opportunities to showcase yourself?',
  'Do you prefer T20 or T30 format?',
  'What preparations are you making to improve in your current or aspiring role?',
]

export function GCFeedbackClient({
  campaigns: initialCampaigns,
  players,
  currentGcId,
  currentGcName,
}: GCFeedbackClientProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>(initialCampaigns)
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(
    initialCampaigns.find(c => !c.closed_at) ?? initialCampaigns[0] ?? null
  )
  const [responses, setResponses] = useState<any[]>([])
  const [claims, setClaims] = useState<any[]>([])
  const [collectingFor, setCollectingFor] = useState<Player | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [gcNotes, setGcNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [editingQuestions, setEditingQuestions] = useState<string[]>([])
  const [showQuestionEditor, setShowQuestionEditor] = useState(false)
  const [qSaving, setQSaving] = useState(false)
  const [qError, setQError] = useState('')
  const [showNewCampaignForm, setShowNewCampaignForm] = useState(false)
  const [newCampaignTitle, setNewCampaignTitle] = useState('')
  const [creatingCampaign, setCreatingCampaign] = useState(false)

  const loadCampaignData = useCallback(async (campaign: Campaign) => {
    const [resRes, claimRes] = await Promise.all([
      fetch(`/api/gc/feedback/responses?campaign_id=${campaign.id}`),
      fetch(`/api/gc/feedback/claims?campaign_id=${campaign.id}`),
    ])
    if (resRes.ok) setResponses(await resRes.json())
    if (claimRes.ok) setClaims(await claimRes.json())
  }, [])

  useEffect(() => {
    if (selectedCampaign) {
      setResponses([])
      setClaims([])
      loadCampaignData(selectedCampaign)
    }
  }, [selectedCampaign, loadCampaignData])

  function openCollect(player: Player) {
    setCollectingFor(player)
    setAnswers({})
    setGcNotes('')
    setError('')
  }

  function closeCollect() {
    setCollectingFor(null)
    setAnswers({})
    setGcNotes('')
    setError('')
  }

  async function handleClaim(playerId: string) {
    if (!selectedCampaign) return
    await fetch('/api/gc/feedback/claims', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign_id: selectedCampaign.id, player_id: playerId }),
    })
    loadCampaignData(selectedCampaign)
  }

  async function handleUnclaim(playerId: string) {
    if (!selectedCampaign) return
    await fetch('/api/gc/feedback/claims', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign_id: selectedCampaign.id, player_id: playerId }),
    })
    loadCampaignData(selectedCampaign)
  }

  async function saveResponse() {
    if (!selectedCampaign || !collectingFor) return
    setSaving(true)
    setError('')
    const builtAnswers: Record<string, string> = {}
    selectedCampaign.questions.forEach((_, i) => {
      builtAnswers[String(i)] = answers[String(i)] ?? ''
    })
    const res = await fetch('/api/gc/feedback/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaign_id: selectedCampaign.id,
        player_id: collectingFor.id,
        answers: builtAnswers,
        notes: gcNotes,
      }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error ?? 'Failed to save'); return }
    closeCollect()
    loadCampaignData(selectedCampaign)
  }

  function openQuestionEditor() {
    setEditingQuestions(selectedCampaign?.questions ?? [])
    setShowQuestionEditor(true)
    setQError('')
  }

  async function saveQuestions() {
    if (!selectedCampaign) return
    setQSaving(true)
    setQError('')
    const res = await fetch(`/api/gc/feedback/campaigns/${selectedCampaign.id}/questions`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questions: editingQuestions }),
    })
    const data = await res.json()
    setQSaving(false)
    if (!res.ok) {
      setQError(data.error ?? 'Failed to save questions')
      return
    }
    const updated = { ...selectedCampaign, questions: editingQuestions.map(q => q.trim()) }
    setCampaigns(prev => prev.map(c => c.id === updated.id ? updated : c))
    setSelectedCampaign(updated)
    setShowQuestionEditor(false)
  }

  async function closeCampaign() {
    if (!selectedCampaign) return
    const res = await fetch(`/api/gc/feedback/campaigns/${selectedCampaign.id}/close`, { method: 'PATCH' })
    if (res.ok) {
      const updated = { ...selectedCampaign, closed_at: new Date().toISOString() }
      setCampaigns(prev => prev.map(c => c.id === updated.id ? updated : c))
      setSelectedCampaign(updated)
    }
  }

  async function createCampaign() {
    if (!newCampaignTitle.trim()) return
    setCreatingCampaign(true)
    const res = await fetch('/api/gc/feedback/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newCampaignTitle.trim(), questions: DEFAULT_QUESTIONS }),
    })
    const data = await res.json()
    setCreatingCampaign(false)
    if (!res.ok) return
    const campaignsRes = await fetch('/api/gc/feedback/campaigns')
    if (campaignsRes.ok) {
      const fresh = await campaignsRes.json()
      setCampaigns(fresh)
      const created = fresh.find((c: Campaign) => c.id === data.id)
      if (created) setSelectedCampaign(created)
    }
    setShowNewCampaignForm(false)
    setNewCampaignTitle('')
  }

  function getPlayerStatus(playerId: string) {
    const response = responses.find((r: any) => r.player?.id === playerId)
    if (response) return { type: 'collected' as const, response }
    const claim = claims.find((c: any) => c.player_id === playerId)
    if (claim) {
      if (claim.claimer?.id === currentGcId) return { type: 'claimed-you' as const, claim }
      return { type: 'claimed-other' as const, claim }
    }
    return { type: 'uncollected' as const }
  }

  const collectedCount = responses.length
  const totalCount = players.length
  const byCollector: Record<string, { name: string; count: number }> = {}
  for (const r of responses) {
    const id = r.collector?.id
    const name = r.collector?.name ?? 'Unknown'
    if (!byCollector[id]) byCollector[id] = { name, count: 0 }
    byCollector[id].count++
  }

  function renderInput(qIndex: number, question: string) {
    const key = String(qIndex)
    if (qIndex === 3) {
      return (
        <div className="flex gap-3">
          {['Yes', 'No', 'Somewhat'].map(opt => (
            <label key={opt} className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name={`q-${qIndex}`}
                value={opt}
                checked={answers[key] === opt}
                onChange={() => setAnswers(prev => ({ ...prev, [key]: opt }))}
                className="accent-[#1D9E75]"
              />
              <span className="font-rajdhani text-sm text-[#1C1917]">{opt}</span>
            </label>
          ))}
        </div>
      )
    }
    if (qIndex === 4) {
      return (
        <div className="flex gap-3">
          {['T20', 'T30', 'No preference'].map(opt => (
            <label key={opt} className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name={`q-${qIndex}`}
                value={opt}
                checked={answers[key] === opt}
                onChange={() => setAnswers(prev => ({ ...prev, [key]: opt }))}
                className="accent-[#1D9E75]"
              />
              <span className="font-rajdhani text-sm text-[#1C1917]">{opt}</span>
            </label>
          ))}
        </div>
      )
    }
    return (
      <textarea
        rows={3}
        value={answers[key] ?? ''}
        onChange={e => setAnswers(prev => ({ ...prev, [key]: e.target.value }))}
        className="w-full border border-[#D4C9B0] rounded px-3 py-2 font-rajdhani text-sm text-[#1C1917] bg-white resize-none focus:outline-none focus:border-[#1D9E75]"
        placeholder="Enter response…"
      />
    )
  }

  return (
    <div className="min-h-screen bg-[#F8F4EE] flex flex-col">
      <SiteNav activePage="gc" />

      <main className="flex-1 px-4 md:px-8 lg:px-10 py-8 max-w-4xl mx-auto w-full">
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="font-rajdhani text-xs font-bold tracking-widest uppercase text-stone-500 mb-1">
              Governing Council · Internal
            </p>
            <h1 className="font-cinzel text-xl font-bold text-[#1C1917]">GC Feedback Campaign</h1>
          </div>
          <button
            onClick={() => setShowNewCampaignForm(v => !v)}
            className="font-rajdhani text-xs font-bold tracking-widest uppercase bg-[#1D9E75] hover:bg-[#178a64] text-white px-4 py-2 rounded transition-colors"
          >
            + New Campaign
          </button>
        </div>

        {showNewCampaignForm && (
          <div className="mb-6 bg-white border border-[#D4C9B0] rounded-lg p-5">
            <p className="font-rajdhani text-xs font-bold tracking-widest uppercase text-stone-500 mb-3">
              New Campaign
            </p>
            <input
              type="text"
              value={newCampaignTitle}
              onChange={e => setNewCampaignTitle(e.target.value)}
              placeholder="Campaign title (e.g. June 2026 – Club Health Check)"
              className="w-full border border-[#D4C9B0] rounded px-3 py-2 font-rajdhani text-sm text-[#1C1917] bg-white focus:outline-none focus:border-[#1D9E75] mb-3"
            />
            <p className="font-rajdhani text-xs text-stone-500 mb-3">
              Will be pre-filled with the 6 standard questions.
            </p>
            <div className="flex gap-3">
              <button
                onClick={createCampaign}
                disabled={creatingCampaign || newCampaignTitle.trim().length < 3}
                className="font-rajdhani text-xs font-bold tracking-widest uppercase bg-[#1D9E75] hover:bg-[#178a64] text-white px-4 py-2 rounded disabled:opacity-40 transition-colors"
              >
                {creatingCampaign ? 'Creating…' : 'Create Campaign'}
              </button>
              <button
                onClick={() => { setShowNewCampaignForm(false); setNewCampaignTitle('') }}
                className="font-rajdhani text-xs font-bold tracking-widest uppercase text-stone-500 hover:text-[#1C1917] px-4 py-2 rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {campaigns.length > 0 && (
          <div className="mb-5">
            <p className="font-rajdhani text-xs font-bold tracking-widest uppercase text-stone-500 mb-2">
              Campaign
            </p>
            <div className="flex flex-wrap gap-2">
              {campaigns.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCampaign(c)}
                  className={`font-rajdhani text-xs font-semibold tracking-wide px-3 py-1.5 rounded border transition-colors
                    ${selectedCampaign?.id === c.id
                      ? 'bg-[#1D9E75] text-white border-[#1D9E75]'
                      : 'bg-white text-stone-600 border-[#D4C9B0] hover:border-[#1D9E75]'}`}
                >
                  {c.title}
                  {c.closed_at && <span className="ml-1.5 text-[10px] opacity-60">CLOSED</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {!selectedCampaign && (
          <div className="text-center py-20 text-stone-400 font-rajdhani text-sm">
            No campaigns yet. Create one above.
          </div>
        )}

        {selectedCampaign && (
          <>
            <div className="flex items-center gap-3 mb-5 flex-wrap">
              {!selectedCampaign.closed_at && (
                <>
                  <button
                    onClick={openQuestionEditor}
                    className="font-rajdhani text-xs font-semibold text-[#D97706] hover:text-[#b45309] transition-colors"
                  >
                    ✏ Edit questions
                  </button>
                  <button
                    onClick={closeCampaign}
                    className="font-rajdhani text-xs font-semibold text-stone-400 hover:text-red-500 transition-colors"
                  >
                    🔒 Close campaign
                  </button>
                </>
              )}
              {selectedCampaign.closed_at && (
                <span className="font-rajdhani text-xs text-stone-400">
                  Closed {new Date(selectedCampaign.closed_at).toLocaleDateString()}
                </span>
              )}
            </div>

            {showQuestionEditor && !selectedCampaign.closed_at && (
              <div className="mb-6 bg-white border border-[#D4C9B0] rounded-lg p-5">
                <p className="font-rajdhani text-xs font-bold tracking-widest uppercase text-stone-500 mb-3">
                  Edit Questions
                </p>
                {qError && (
                  <p className="font-rajdhani text-xs text-red-500 mb-3">{qError}</p>
                )}
                <div className="flex flex-col gap-2 mb-3">
                  {editingQuestions.map((q, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <span className="font-rajdhani text-xs text-stone-400 mt-2 w-5 shrink-0">{i + 1}.</span>
                      <textarea
                        rows={1}
                        value={q}
                        onChange={e => {
                          const updated = [...editingQuestions]
                          updated[i] = e.target.value
                          setEditingQuestions(updated)
                        }}
                        className="flex-1 border border-[#D4C9B0] rounded px-3 py-1.5 font-rajdhani text-sm text-[#1C1917] bg-white resize-none focus:outline-none focus:border-[#1D9E75]"
                      />
                      {responses.length === 0 && (
                        <button
                          onClick={() => setEditingQuestions(prev => prev.filter((_, idx) => idx !== i))}
                          className="font-rajdhani text-xs text-stone-400 hover:text-red-500 mt-2 px-1 transition-colors"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex gap-3 flex-wrap">
                  <button
                    onClick={() => setEditingQuestions(prev => [...prev, ''])}
                    className="font-rajdhani text-xs font-semibold text-[#D97706] hover:text-[#b45309] transition-colors"
                  >
                    + Add question
                  </button>
                  <button
                    onClick={saveQuestions}
                    disabled={qSaving}
                    className="font-rajdhani text-xs font-bold tracking-widest uppercase bg-[#1D9E75] hover:bg-[#178a64] text-white px-4 py-1.5 rounded disabled:opacity-40 transition-colors"
                  >
                    {qSaving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={() => { setShowQuestionEditor(false); setQError('') }}
                    className="font-rajdhani text-xs font-semibold text-stone-400 hover:text-[#1C1917] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="mb-5 bg-white border border-[#D4C9B0] rounded-lg px-5 py-3">
              <div className="flex items-center gap-3 mb-2">
                <div className="flex-1 h-2 bg-[#EEEAE2] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#1D9E75] rounded-full transition-all"
                    style={{ width: totalCount > 0 ? `${(collectedCount / totalCount) * 100}%` : '0%' }}
                  />
                </div>
                <span className="font-rajdhani text-xs font-bold text-[#1D9E75] whitespace-nowrap">
                  {collectedCount} / {totalCount} collected
                </span>
              </div>
              {Object.keys(byCollector).length > 0 && (
                <p className="font-rajdhani text-xs text-stone-500">
                  {Object.values(byCollector).map((v, i) => (
                    <span key={i}>
                      {i > 0 && ' · '}
                      <span className={v.name === currentGcName ? 'text-[#D97706] font-bold' : ''}>
                        {v.name}: {v.count}
                      </span>
                    </span>
                  ))}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              {players.map(player => {
                const status = getPlayerStatus(player.id)
                const isCollected = status.type === 'collected'
                const isClaimedByMe = status.type === 'claimed-you'
                const isClaimedByOther = status.type === 'claimed-other'
                const borderColor = isCollected
                  ? 'border-l-[#1D9E75]'
                  : isClaimedByMe
                  ? 'border-l-[#C9A84C]'
                  : 'border-l-[#CBD5DC]'
                return (
                  <div
                    key={player.id}
                    className={`bg-white border border-[#D4C9B0] border-l-4 ${borderColor} rounded-lg px-4 py-3 flex items-center gap-3 ${!isCollected && !selectedCampaign.closed_at ? 'cursor-pointer hover:bg-[#EEEAE2]' : ''} transition-colors`}
                    onClick={() => {
                      if (!isCollected && !selectedCampaign.closed_at) openCollect(player)
                    }}
                  >
                    {player.photo_url && (
                      <img
                        src={player.photo_url}
                        alt=""
                        className="w-8 h-8 rounded-full object-cover border border-[#D4C9B0] shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-rajdhani text-sm font-semibold text-[#1C1917]">
                        <PlayerNameLink name={player.name} cricHeroesUrl={player.cricheroes_url} />
                      </div>
                      {player.primary_skill && (
                        <p className="font-rajdhani text-xs text-stone-400">{player.primary_skill}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      {isCollected && (
                        <span className="font-rajdhani text-xs text-[#1D9E75] font-semibold">
                          ✓ Collected by {(status as any).response.collector?.name}
                        </span>
                      )}
                      {isClaimedByMe && !selectedCampaign.closed_at && (
                        <div className="flex items-center gap-2">
                          <span className="font-rajdhani text-xs text-[#C9A84C]">You claimed this</span>
                          <button
                            onClick={e => { e.stopPropagation(); handleUnclaim(player.id) }}
                            className="font-rajdhani text-xs text-stone-400 hover:text-red-500 transition-colors"
                          >
                            Release
                          </button>
                        </div>
                      )}
                      {isClaimedByOther && (
                        <span className="font-rajdhani text-xs text-stone-400">
                          Claimed by {(status as any).claim.claimer?.name}
                        </span>
                      )}
                      {status.type === 'uncollected' && !selectedCampaign.closed_at && (
                        <button
                          onClick={e => { e.stopPropagation(); handleClaim(player.id) }}
                          className="font-rajdhani text-xs text-stone-400 hover:text-[#C9A84C] transition-colors"
                        >
                          Claim
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </main>

      {collectingFor && selectedCampaign && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto py-8 px-4">
          <div className="bg-[#F8F4EE] border border-[#D4C9B0] rounded-xl w-full max-w-xl shadow-2xl">
            <div className="px-6 py-4 border-b border-[#D4C9B0] flex items-start justify-between gap-4">
              <div>
                <p className="font-rajdhani text-xs font-bold tracking-widest uppercase text-stone-500 mb-0.5">
                  Collecting Feedback
                </p>
                <h2 className="font-cinzel text-base font-bold text-[#1C1917]">
                  <PlayerNameLink name={collectingFor.name} cricHeroesUrl={collectingFor.cricheroes_url} />
                </h2>
                {collectingFor.primary_skill && (
                  <p className="font-rajdhani text-xs text-stone-400">{collectingFor.primary_skill}</p>
                )}
              </div>
              <button
                onClick={closeCollect}
                className="font-rajdhani text-stone-400 hover:text-[#1C1917] transition-colors text-xl leading-none mt-0.5"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-5 flex flex-col gap-5">
              {selectedCampaign.questions.map((question, i) => (
                <div key={i}>
                  <label className="block font-rajdhani text-xs font-bold tracking-wide text-stone-600 mb-1.5">
                    {i + 1}. {question}
                  </label>
                  {renderInput(i, question)}
                </div>
              ))}
              <div className="border-t border-[#D4C9B0] pt-4">
                <label className="block font-rajdhani text-xs font-bold tracking-wide text-stone-500 mb-1.5">
                  GC Notes <span className="font-normal">(private — not visible to player)</span>
                </label>
                <textarea
                  rows={2}
                  value={gcNotes}
                  onChange={e => setGcNotes(e.target.value)}
                  className="w-full border border-[#D4C9B0] rounded px-3 py-2 font-rajdhani text-sm text-[#1C1917] bg-white resize-none focus:outline-none focus:border-[#1D9E75]"
                  placeholder="Any internal notes for the GC…"
                />
              </div>
              {error && (
                <p className="font-rajdhani text-xs text-red-500">{error}</p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={saveResponse}
                  disabled={saving}
                  className="font-rajdhani text-xs font-bold tracking-widest uppercase bg-[#1D9E75] hover:bg-[#178a64] text-white px-5 py-2 rounded disabled:opacity-40 transition-colors"
                >
                  {saving ? 'Saving…' : 'Save Response'}
                </button>
                <button
                  onClick={closeCollect}
                  className="font-rajdhani text-xs font-semibold text-stone-400 hover:text-[#1C1917] px-4 py-2 rounded transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}