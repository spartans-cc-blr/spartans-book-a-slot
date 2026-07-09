// src/lib/parseAnnouncement.ts
// Shared parser for the WhatsApp squad-announcement text format used by
// buildAnnouncementText() (CaptainsCornerGrid) / buildSquadAnnouncement()
// (src/lib/announcement.ts). Pure text-in, structured-data-out — no DB
// access here so it stays independently testable. Booking resolution that
// requires a DB lookup (CricHeroes match_id / date+format fallback) lives
// in the API route, using the raw signals extracted here.

export type SquadRole = 'C' | 'VC' | 'WK'

export interface ParsedPlayerEntry {
  raw:   string            // original numbered line content, before stripping
  name:  string             // cleaned player name — strikethrough, asterisks and role tag(s) removed
  roles: SquadRole[]        // zero, one, or more of C/VC/WK — order not significant
}

export interface ParsedAnnouncement {
  booking_id_from_link: string | null   // extracted directly from a /fixtures/<uuid> link
  match_id:             string | null   // CricHeroes scorecard id extracted from the Match Link
  date_raw:             string | null   // e.g. "5th July" — day + month only, no year; display/cross-check only
  format_raw:           string | null   // e.g. "T20" — from the "Format:" line
  players:              ParsedPlayerEntry[]
}

const BOOKING_ID_RE  = /\/fixtures\/([a-f0-9-]{36})/
const MATCH_ID_RE    = /\/scorecard\/(\d+)\//
const DATE_RAW_RE    = /\*?(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+)\s*\(/
const FORMAT_RAW_RE  = /^Format:\s*(\S+)/mi
const TEAM_HEADER_RE = /^\*?Team\*?$/i
const OPPONENT_RE    = /^\*?Opponent/i
const NUMBERED_RE    = /^\s*(\d+)\.\s*(.+?)\s*$/
const STRIKETHROUGH_RE = /\s*~[^~]*~\s*/g
const ROLE_PAREN_RE  = /\(([^)]+)\)/

export function parseAnnouncement(text: string): ParsedAnnouncement {
  const bookingMatch = text.match(BOOKING_ID_RE)
  const booking_id_from_link = bookingMatch ? bookingMatch[1] : null

  const matchIdMatch = text.match(MATCH_ID_RE)
  const match_id = matchIdMatch ? matchIdMatch[1] : null

  const dateMatch = text.match(DATE_RAW_RE)
  const date_raw = dateMatch ? dateMatch[1] : null

  const formatMatch = text.match(FORMAT_RAW_RE)
  const format_raw = formatMatch ? formatMatch[1].toUpperCase() : null

  const lines = text.split(/\r?\n/)

  let teamStart = -1
  for (let i = 0; i < lines.length; i++) {
    if (TEAM_HEADER_RE.test(lines[i].trim())) {
      teamStart = i + 1
      break
    }
  }

  const players: ParsedPlayerEntry[] = []

  if (teamStart !== -1) {
    for (let i = teamStart; i < lines.length; i++) {
      const trimmed = lines[i].trim()

      // Blank line or the Opponent section ends the Team block
      if (trimmed === '' || OPPONENT_RE.test(trimmed)) break

      const numbered = trimmed.match(NUMBERED_RE)
      if (!numbered) continue

      const raw = numbered[2]
      if (/open/i.test(raw)) continue

      // Strikethrough (~Name~) marks a player swapped out — drop that
      // segment (and its surrounding whitespace) before anything else,
      // so only the replacement name that follows survives.
      let working = raw.replace(STRIKETHROUGH_RE, ' ').trim()

      // Role tag(s) — e.g. "(C)" or "(WK, VC)". Only strip the parenthetical
      // if it actually contains at least one recognised role token; an
      // unrelated "(...)" in a name is left alone.
      const roles: SquadRole[] = []
      const roleMatch = working.match(ROLE_PAREN_RE)
      if (roleMatch) {
        const tokens = roleMatch[1].split(',').map(t => t.trim().toUpperCase())
        for (const t of tokens) {
          if ((t === 'C' || t === 'VC' || t === 'WK') && !roles.includes(t as SquadRole)) {
            roles.push(t as SquadRole)
          }
        }
        if (roles.length > 0) {
          working = working.replace(roleMatch[0], '')
        }
      }

      const name = working.replace(/\*/g, '').trim()

      players.push({ raw, name, roles })
    }
  }

  return { booking_id_from_link, match_id, date_raw, format_raw, players }
}
