// Shared WhatsApp pre-fill message builders for the admin booking pages —
// currently only /admin/bookings/[id] (confirming a reservation or editing
// an already-confirmed booking), kept here rather than inline so the
// organiser/captain message wording has one source of truth instead of
// drifting if a second surface ever needs the same buttons.
//
// Both return a `wa.me` deep link the admin taps to review and send —
// nothing here sends anything itself. See push_notifications.md for the
// separate, actually-automatic web-push channel (squad announcements only).

export interface OrganiserMessageInput {
  gameDate: string
  slotTime: string
  organiserPhone: string | null
  isConfirmed: boolean
  tournamentId: string | null
  origin: string
}

// Empty string means "no phone on file" — callers should treat that as
// "notify button disabled", same as before this was extracted.
export function buildOrganiserWhatsAppUrl({
  gameDate, slotTime, organiserPhone, isConfirmed, tournamentId, origin,
}: OrganiserMessageInput): string {
  const phone = organiserPhone?.replace(/\D/g, '') ?? ''
  if (!phone) return ''

  // The share page reflects this tournament's live schedule/slot-balance
  // regardless of this one booking's status, so it's worth including even
  // for a still-pending reservation — an organiser waiting on confirmation
  // can already see where things stand.
  const shareLine = tournamentId
    ? `\n\nYou can track ${isConfirmed ? 'your tournament' : 'this reservation'}'s schedule and next open slots anytime on the Hub:\n${origin}/tournament-planner/share/${tournamentId}`
    : ''

  const msg = isConfirmed
    ? `Hi! Your slot for *${gameDate} at ${slotTime}* is now confirmed with Spartans CC. 🏏\n\nPlease create the match in CricHeroes and share the Match ID with us.${shareLine}\n\nThanks!`
    : `Hi! Your slot reservation for *${gameDate} at ${slotTime}* is held with Spartans CC — please confirm within 48 hours.${shareLine}\n\nThanks!`

  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
}

export interface CaptainMessageInput {
  captainName: string
  captainPhone: string | null
  gameDate: string
  slotTime: string
  opponentName: string | null
  venue: string | null
  cricheroesUrl: string | null
}

// Falls back to a destination-free wa.me link (sender picks the recipient)
// when the captain has no WhatsApp number on file, same as every other
// no-recipient WhatsApp nudge in this app — the button still does
// something rather than being dead.
export function buildCaptainWhatsAppUrl({
  captainName, captainPhone, gameDate, slotTime, opponentName, venue, cricheroesUrl,
}: CaptainMessageInput): string {
  const phone    = captainPhone?.replace(/\D/g, '') ?? ''
  const opponent = opponentName || 'TBD'
  const venueStr = venue || 'TBD'
  const msg = encodeURIComponent(
    `Hi ${captainName}! A new game has been booked — you're captain for *${gameDate} at ${slotTime}*.\n\nOpponent: ${opponent}\nVenue: ${venueStr}${cricheroesUrl ? `\nCricHeroes: ${cricheroesUrl}` : ''}\n\nPlease confirm your availability.`
  )
  return phone ? `https://wa.me/${phone}?text=${msg}` : `https://wa.me/?text=${msg}`
}
