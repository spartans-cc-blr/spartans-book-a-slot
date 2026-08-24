'use client'

// Admin-only control on /captains-corner/unavailable-dates — lets an admin
// switch which captain's marked-unavailable dates the page below is
// showing. Navigates via a plain ?captainId= query param so the page stays
// a server component and the selection is bookmarkable/shareable, rather
// than holding the selection in client state.

import { useRouter, useSearchParams } from 'next/navigation'

interface CaptainOption {
  id: string
  name: string
}

interface Props {
  captains: CaptainOption[]
  selectedId: string
  ownPlayerId: string | null
}

export function CaptainPicker({ captains, selectedId, ownPlayerId }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString())
    if (e.target.value) params.set('captainId', e.target.value)
    else params.delete('captainId')
    router.push(`/captains-corner/unavailable-dates?${params.toString()}`)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
      <label style={{ fontFamily: 'var(--font-rajdhani), sans-serif', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#A8A29E' }}>
        Viewing
      </label>
      <select
        value={selectedId}
        onChange={handleChange}
        style={{
          fontFamily: 'var(--font-rajdhani), sans-serif', fontSize: '13px', fontWeight: 700, color: '#1C1917',
          background: '#FFFFFF', border: '1px solid #D4C9B0', borderRadius: '6px', padding: '5px 10px', cursor: 'pointer',
        }}
      >
        {captains.map(c => (
          <option key={c.id} value={c.id}>
            {c.name}{c.id === ownPlayerId ? ' (you)' : ''}
          </option>
        ))}
      </select>
    </div>
  )
}
