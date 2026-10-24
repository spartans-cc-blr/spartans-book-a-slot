// Organiser contact visibility for the match card.
//
// The organiser's name/phone is only meant for this match's captain, vice
// captain and GC/admin. Everyone else must never receive it in the page
// payload, so the raw fields are stripped from the booking whenever the
// viewer isn't entitled to them — never just hidden in the UI.
// See features/player-availability.md §12.

export type OrganiserContact = { name: string | null; phone: string | null }

type Bookingish = {
  organiser_name?: string | null
  organiser_phone?: string | null
  tournament?: {
    organiser_name?: string | null
    organiser_contact?: string | null
    [key: string]: unknown
  } | null
  [key: string]: unknown
}

/**
 * Removes every organiser field from the booking (and its tournament) and
 * returns the resolved contact only when `canSee` is true. The booking's own
 * organiser fields (set on the reservation path) win over the tournament's.
 */
export function splitOrganiserContact<T extends Bookingish>(
  booking: T,
  canSee: boolean,
): { booking: Omit<T, 'organiser_name' | 'organiser_phone'>; organiserContact: OrganiserContact | null } {
  const { organiser_name, organiser_phone, tournament, ...rest } = booking
  let cleanTournament = tournament
  let tName: string | null = null
  let tPhone: string | null = null
  if (tournament) {
    const { organiser_name: tn, organiser_contact: tc, ...tRest } = tournament
    cleanTournament = tRest
    tName = tn ?? null
    tPhone = tc ?? null
  }
  const name = (organiser_name || tName || '').trim() || null
  const phone = (organiser_phone || tPhone || '').trim() || null
  return {
    booking: { ...rest, tournament: cleanTournament } as Omit<T, 'organiser_name' | 'organiser_phone'>,
    organiserContact: canSee && (name || phone) ? { name, phone } : null,
  }
}
