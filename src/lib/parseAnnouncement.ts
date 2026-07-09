// src/lib/parseAnnouncement.ts
// Shared parser for the WhatsApp squad-announcement text format used by
// buildAnnouncementText() (CaptainsCornerGrid) / buildSquadAnnouncement()
// (src/lib/announcement.ts). Pure text-in, structured-data-out — no DB
// access here so it stays independently testable.

export type SquadRole = 'C' | 'VC' | 'WK'

export interface ParsedPlayerEntry {
  raw:  string            // original numbered line content, before stripping
  name: string            // cleaned player name — asterisks and role tag removed
  role: SquadRole | null
}

export interface ParsedAnnouncement {
  booking_id: string | null
  date_raw:   string | null   // display/cross-check only — not authoritative
  players:    ParsedPlayerEntry[]
}

const BOOKING_ID_RE = /\/fixtures\/([a-f0-9-]{36})/
const DATE_RAW_RE    = /\*?(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+)\s*\(/
const TEAM_HEADER_RE = /^\*?Team\*?$/i
const OPPONENT_RE    = /^\*?Opponent/i
const NUMBERED_RE    = /^\s*(\d+)\.\s*(.+?)\s*$/
const ROLE_TAG_RE    = /\(\s*(C|VC|WK)\s*\)/i

export function parseAnnouncement(text: string): ParsedAnnouncement {
  const bookingMatch = text.match(BOOKING_ID_RE)
  const booking_id   = bookingMatch ? bookingMatch[1] : null

  const dateMatch = text.match(DATE_RAW_RE)
  const date_raw  = dateMatch ? dateMatch[1] : null

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

      let role: SquadRole | null = null
      let name = raw

      const roleMatch = raw.match(ROLE_TAG_RE)
      if (roleMatch) {
        role = roleMatch[1].toUpperCase() as SquadRole
        name = name.replace(roleMatch[0], '')
      }

      name = name.replace(/\*/g, '').trim()

      players.push({ raw, name, role })
    }
  }

  return { booking_id, date_raw, players }
}
