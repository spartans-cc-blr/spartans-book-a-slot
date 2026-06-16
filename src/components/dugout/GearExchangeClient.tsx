'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

type GearType = 'for_sale' | 'wanted'
type GearCondition = 'new' | 'good' | 'fair'

interface GearListing {
  id: string
  poster_id?: string
  type: GearType
  condition: GearCondition | null
  title: string
  description: string
  created_at: string
  poster_name: string                    // was: players.name
  poster_cricheroes_url: string | null   // was: players.cricheroes_url
}

interface Props {
  listings: GearListing[]
  playerId: string
  isExpelled: boolean
  isAdmin: boolean
}

function PlayerLink({ name, cricHeroesUrl }: { name: string; cricHeroesUrl: string | null }) {
  if (cricHeroesUrl) {
    return (
      <a
        href={cricHeroesUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="font-rajdhani text-sm text-amber-700 font-semibold hover:underline underline-offset-2"
      >
        {name}
      </a>
    )
  }
  return <span className="font-rajdhani text-sm text-stone-700 font-semibold">{name}</span>
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function TypeBadge({ type }: { type: GearType }) {
  if (type === 'for_sale') {
    return (
      <span className="font-rajdhani text-xs font-semibold px-2 py-0.5 rounded bg-stone-100 text-stone-700 border border-stone-200">
        For Sale
      </span>
    )
  }
  return (
    <span className="font-rajdhani text-xs font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200">
      Wanted
    </span>
  )
}

function ConditionBadge({ condition }: { condition: GearCondition }) {
  const styles: Record<GearCondition, string> = {
    new: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    good: 'bg-blue-50 text-blue-700 border border-blue-200',
    fair: 'bg-amber-50 text-amber-700 border border-amber-200',
  }
  return (
    <span className={`font-rajdhani text-xs font-semibold px-2 py-0.5 rounded ${styles[condition]}`}>
      {condition.charAt(0).toUpperCase() + condition.slice(1)}
    </span>
  )
}

function ShareButton({ listingId }: { listingId: string }) {
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
      className="border border-[#D4C9B0] text-stone-600 font-rajdhani text-xs px-3 py-1 rounded hover:bg-parchment-3"
    >
      {copied ? 'Copied!' : 'Copy Link'}
    </button>
  )
}

function GearCard({
  listing,
  playerId,
  isAdmin,
  onDeactivate,
}: {
  listing: GearListing
  playerId: string
  isAdmin: boolean
  onDeactivate: (id: string) => void
}) {
  const canRemove = isAdmin || (listing.poster_id != null && listing.poster_id === playerId)
  const poster = listing.players

  return (
    <div className="bg-parchment-2 border border-[#D4C9B0] rounded-lg p-4 flex flex-col gap-2">
      <div className="flex flex-wrap gap-2 items-center">
        <TypeBadge type={listing.type} />
        {listing.type === 'for_sale' && listing.condition && (
          <ConditionBadge condition={listing.condition} />
        )}
      </div>

      <h3 className="font-cinzel font-semibold text-stone-900 text-base leading-snug">
        {listing.title}
      </h3>

      <p className="font-rajdhani text-sm text-stone-700">{listing.description}</p>

      <div className="flex items-center gap-1 text-xs text-stone-500 font-rajdhani">
        <span>Posted by</span>
       <PlayerLink 
        name={listing.poster_name || 'Unknown'} 
        cricHeroesUrl={listing.poster_cricheroes_url} 
        />
        <span className="mx-1">·</span>
        <span className="text-stone-400">{formatDate(listing.created_at)}</span>
      </div>

      <div className="flex items-center gap-3 mt-1">
        <ShareButton listingId={listing.id} />
        {canRemove && (
          <button
            onClick={() => onDeactivate(listing.id)}
            className="text-red-600 font-rajdhani text-xs hover:underline"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  )
}

type FilterTab = 'all' | 'wanted' | 'for_sale'

export function GearExchangeClient({ listings, playerId, isExpelled, isAdmin }: Props) {
  const router = useRouter()

  const [showForm, setShowForm] = useState(false)
  const [formType, setFormType] = useState<GearType>('for_sale')
  const [formCondition, setFormCondition] = useState<GearCondition>('good')
  const [formTitle, setFormTitle] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [formSubmitting, setFormSubmitting] = useState(false)

  const [activeTab, setActiveTab] = useState<FilterTab>('all')

  const filteredListings =
    activeTab === 'all' ? listings : listings.filter((l) => l.type === activeTab)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setFormSubmitting(true)

    const body: Record<string, string> = {
      type: formType,
      title: formTitle,
      description: formDescription,
    }
    if (formType === 'for_sale') {
      body.condition = formCondition
    }

    try {
      const res = await fetch('/api/dugout/gear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) {
        setFormError(json.error ?? 'Something went wrong.')
        setFormSubmitting(false)
        return
      }
      setShowForm(false)
      setFormTitle('')
      setFormDescription('')
      setFormType('for_sale')
      setFormCondition('good')
      router.refresh()
    } catch {
      setFormError('Network error. Please try again.')
    } finally {
      setFormSubmitting(false)
    }
  }

  const handleDeactivate = async (id: string) => {
    try {
      const res = await fetch(`/api/dugout/gear/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: false }),
      })
      if (res.ok) {
        router.refresh()
      }
    } catch {
      // silent — server will reject if unauthorised
    }
  }

  const tabs: { label: string; value: FilterTab }[] = [
    { label: 'All', value: 'all' },
    { label: 'Wanted', value: 'wanted' },
    { label: 'For Sale', value: 'for_sale' },
  ]

  return (
    <div className="flex flex-col gap-6">
      {/* Section A — Post new listing */}
      {!isExpelled && (
        <div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="bg-amber-600 hover:bg-amber-700 text-white font-rajdhani font-bold px-5 py-2 rounded"
          >
            {showForm ? 'Cancel' : 'Post a Listing'}
          </button>

          {showForm && (
            <form
              onSubmit={handleSubmit}
              className="mt-4 bg-parchment-2 border border-[#D4C9B0] rounded-lg p-4 flex flex-col gap-4"
            >
              {/* Type */}
              <div>
                <p className="font-rajdhani text-xs font-bold tracking-widest uppercase text-stone-500 mb-2">
                  Type
                </p>
                <div className="flex gap-4">
                  {(['for_sale', 'wanted'] as GearType[]).map((t) => (
                    <label key={t} className="flex items-center gap-2 cursor-pointer font-rajdhani text-sm text-stone-700">
                      <input
                        type="radio"
                        name="type"
                        value={t}
                        checked={formType === t}
                        onChange={() => {
                          setFormType(t)
                          if (t === 'wanted') setFormCondition('good')
                        }}
                        className="accent-amber-600"
                      />
                      {t === 'for_sale' ? 'For Sale' : 'Wanted'}
                    </label>
                  ))}
                </div>
              </div>

              {/* Condition — only for for_sale */}
              {formType === 'for_sale' && (
                <div>
                  <label className="font-rajdhani text-xs font-bold tracking-widest uppercase text-stone-500 mb-1 block">
                    Condition
                  </label>
                  <select
                    value={formCondition}
                    onChange={(e) => setFormCondition(e.target.value as GearCondition)}
                    className="font-rajdhani text-sm text-stone-900 bg-parchment border border-[#D4C9B0] rounded px-3 py-2 w-full"
                  >
                    <option value="new">New</option>
                    <option value="good">Good</option>
                    <option value="fair">Fair</option>
                  </select>
                </div>
              )}

              {/* Title */}
              <div>
                <label className="font-rajdhani text-xs font-bold tracking-widest uppercase text-stone-500 mb-1 block">
                  Title
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  minLength={5}
                  maxLength={100}
                  required
                  placeholder="e.g. Kookaburra bat, size 6"
                  className="font-rajdhani text-sm text-stone-900 bg-parchment border border-[#D4C9B0] rounded px-3 py-2 w-full placeholder:text-stone-400"
                />
              </div>

              {/* Description */}
              <div>
                <label className="font-rajdhani text-xs font-bold tracking-widest uppercase text-stone-500 mb-1 block">
                  Description
                </label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  minLength={10}
                  maxLength={500}
                  required
                  rows={4}
                  placeholder="Add details — size, price, pickup location, etc."
                  className="font-rajdhani text-sm text-stone-900 bg-parchment border border-[#D4C9B0] rounded px-3 py-2 w-full resize-none placeholder:text-stone-400"
                />
              </div>

              {formError && (
                <p className="font-rajdhani text-sm text-red-600">{formError}</p>
              )}

              <button
                type="submit"
                disabled={formSubmitting}
                className="bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white font-rajdhani font-bold px-5 py-2 rounded self-start"
              >
                {formSubmitting ? 'Posting…' : 'Post Listing'}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Section B — Filter tabs */}
      <div className="flex gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`font-rajdhani font-semibold text-sm px-4 py-1.5 rounded transition-colors ${
              activeTab === tab.value
                ? 'bg-amber-600 text-white'
                : 'bg-parchment-3 text-stone-700 hover:bg-[#D4C9B0]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Section C — Listings grid */}
      {filteredListings.length === 0 ? (
        <p className="font-rajdhani text-stone-500 text-sm text-center py-8">
          No listings yet. Be the first to post one.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filteredListings.map((listing) => (
            <GearCard
              key={listing.id}
              listing={listing}
              playerId={playerId}
              isAdmin={isAdmin}
              onDeactivate={handleDeactivate}
            />
          ))}
        </div>
      )}
    </div>
  )
}
