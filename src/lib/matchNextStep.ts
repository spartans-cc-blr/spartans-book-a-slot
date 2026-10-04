// "What does this past match need next?" — one rule shared by the admin
// Matches list's row chips (past rows) and its "Needs action" tab, so the
// two can never disagree. Pure and client-safe.
//
// Fees stay a deliberate, manual admin action (post-match-scorecard.md §6);
// this only points at the next step, it never performs one.

export type NextStepKind = 'no_match_id' | 'no_scorecard' | 'awaiting_sync' | 'flagged' | 'fee_due'

export interface NextStep {
  kind:  NextStepKind
  label: string
}

export interface NextStepInput {
  status:                     string
  match_id:                   string | null
  is_practice:                boolean
  scorecard_status:           string | null   // scorecard_uploads.status, null = no row
  fees_reconciled_externally: boolean
  needs_reconciliation:       boolean
}

export function computeNextStep(b: NextStepInput): NextStep | null {
  // Only a confirmed game has a scorecard/fee to chase; a reservation or
  // soft block never does.
  if (b.status !== 'confirmed') return null
  if (b.needs_reconciliation) return { kind: 'flagged', label: 'Stats flagged' }
  if (b.scorecard_status === 'fees_applied') return null
  if (b.scorecard_status === 'synced') {
    // Practice games and matches whose fee was collected outside the Hub
    // never owe an Apply Fee step.
    if (b.is_practice || b.fees_reconciled_externally) return null
    return { kind: 'fee_due', label: 'Apply fee' }
  }
  if (b.scorecard_status === 'parsed') return { kind: 'awaiting_sync', label: 'Sync stats' }
  if (!b.match_id) return { kind: 'no_match_id', label: 'Add match ID' }
  return { kind: 'no_scorecard', label: 'Scorecard missing' }
}

// How far back "Needs action" looks. Older history is the scorecard-backfill
// page's job; listing months of backlog here would bury what's recent.
export const NEEDS_ACTION_DAYS = 60
