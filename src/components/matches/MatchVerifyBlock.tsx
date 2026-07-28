'use client'

// Client-side state holder for the standalone /matches/history/[bookingId]
// page's verify/reconciliation block — the page itself is a server
// component, so this is the thin bit that needs useState to swap between
// VerifiedStatusLine and ReconciliationControls after an action succeeds,
// without a full page reload. Mirrors MatchHistoryCard's onMatchPatch
// pattern from ScorecardVerifyPanel, just scoped to one booking's own
// local state instead of a list.

import { useState } from 'react'
import { VerifiedStatusLine, ReconciliationControls, type VerifyPatch } from '@/components/matches/ScorecardVerifyPanel'

// Caller only mounts this while the match is eligible and not yet
// verified (see showVerifyBlock in the page) — verified starts false and
// flips true locally the moment markVerified() succeeds inside
// ReconciliationControls, swapping this block over to VerifiedStatusLine
// without a page reload.
export function MatchVerifyBlock({
  bookingId, cricheroesUrl, initialNeedsReconciliation, initialReconciliationNote,
}: {
  bookingId:                  string
  cricheroesUrl:              string | null
  initialNeedsReconciliation: boolean
  initialReconciliationNote:  string | null
}) {
  const [verified, setVerified] = useState(false)
  const [flagged, setFlagged]   = useState(initialNeedsReconciliation)
  const [note, setNote]         = useState(initialReconciliationNote)

  if (verified) {
    return <VerifiedStatusLine cricheroesUrl={cricheroesUrl} />
  }

  function handlePatch(patch: VerifyPatch) {
    if (patch.verified !== undefined) setVerified(patch.verified)
    if (patch.needs_reconciliation !== undefined) setFlagged(patch.needs_reconciliation)
    if (patch.reconciliation_note !== undefined) setNote(patch.reconciliation_note)
  }

  return (
    <ReconciliationControls
      match={{
        booking_id:           bookingId,
        cricheroes_url:       cricheroesUrl,
        needs_reconciliation: flagged,
        reconciliation_note:  note,
      }}
      onPatch={handlePatch}
    />
  )
}
