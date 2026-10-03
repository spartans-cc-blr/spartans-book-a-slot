// Shared bits of the wrangler "Commentary" upload: types for the Python
// microservice's POST /parse-commentary response, and the pure validation the
// route and the client both use so they can't drift apart.
//
// Ball-by-ball commentary comes from a *printed* CricHeroes commentary page
// (one PDF per innings: Spartans batting, opponent batting). The microservice
// parses it, reconciles every over against the page's own summaries and the
// totals already stored for the match, and writes ball_by_ball in the
// analytics DB. See features/commentary-upload.md.

export const COMMENTARY_SIDES = ['spartans', 'opponent'] as const
export type CommentarySide = (typeof COMMENTARY_SIDES)[number]

export const SIDE_LABEL: Record<CommentarySide, string> = {
  spartans: 'Spartans batting',
  opponent: 'Opponent batting',
}

// Vercel Hobby rejects any request body over ~4.5MB before our code runs, and
// the multipart envelope adds a little. A phone-printed commentary PDF is
// ~0.7MB; a desktop print with background graphics can be 7MB+, so the client
// checks this up front and tells the wrangler how to shrink it.
export const MAX_COMMENTARY_BYTES = 4 * 1024 * 1024

export function isCommentarySide(value: unknown): value is CommentarySide {
  return typeof value === 'string' && (COMMENTARY_SIDES as readonly string[]).includes(value)
}

/** Returns an error message, or null when the file is acceptable. Checks the
 *  magic bytes (never the Content-Type header) and the size. */
export function validateCommentaryPdf(size: number, head: Uint8Array | Buffer): string | null {
  if (size <= 0) return 'The file is empty'
  if (size > MAX_COMMENTARY_BYTES) {
    return `File is ${(size / 1024 / 1024).toFixed(1)}MB; the limit is ${MAX_COMMENTARY_BYTES / 1024 / 1024}MB. ` +
      'Print from your phone, or untick "Background graphics" in the desktop print dialog.'
  }
  const magic = String.fromCharCode(...Array.from(head.subarray(0, 4)))
  if (magic !== '%PDF') return 'File must be a valid PDF'
  return null
}

export interface CommentaryIssue {
  level: 'error' | 'warning'
  over: number | null
  message: string
}

export interface CommentaryBall {
  seq: number
  label: string
  over_no: number
  ball_in_over: number
  is_legal: boolean
  bowler: string
  batter: string
  outcome: string
  runs_total: number
  is_wicket: boolean
  dismissed_batter: string | null
  fielder: string | null
  extra_type: string | null
}

export interface CommentaryResult {
  ok: boolean
  dry_run: boolean
  saved: boolean
  match_id: string
  side: CommentarySide
  batting_team: string
  innings: number | null
  deliveries: number
  total_runs: number
  total_wickets: number
  issues: CommentaryIssue[]
  replaces_existing: boolean
  balls?: CommentaryBall[]
  detail?: string
}

/** Ball-by-ball status of a match, from the analytics `match_coverage` view. */
export type BbbStatus = 'none' | 'partial' | 'complete' | 'mismatch'

export interface CommentaryMatchOption {
  booking_id: string
  match_id: string
  game_date: string
  format: string
  opponent_name: string | null
  cricheroes_url?: string | null
  /** Undefined when the analytics DB couldn't be read, so no status is shown. */
  bbb_status?: BbbStatus
}

/** Matches that still need commentary (anything but complete), newest first as given. */
export function matchesNeedingCommentary(matches: CommentaryMatchOption[]): CommentaryMatchOption[] {
  return matches.filter(m => m.bbb_status !== undefined && m.bbb_status !== 'complete')
}

