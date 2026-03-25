// Builds the WhatsApp squad announcement text from booking + squad data.
// Mirrors the format used in actual Spartans announcements.

interface AnnouncementPlayer {
  name: string
  primary_skill: string | null
  is_match_captain: boolean  // match-specific, from squad row
  is_vc: boolean             // match-specific, from squad row
  is_wk: boolean             // match-specific, from squad row
}

interface AnnouncementBooking {
  game_date: string          // 'YYYY-MM-DD'
  format: string             // 'T20' | 'T30'
  match_time: string | null  // 'HH:MM' — reporting time
  opponent_name: string | null
  cricheroes_url: string | null
  tournament: {
    ball_type: 'red' | 'white' | 'pink'
    ground: {
      name: string
      maps_url: string
      hospital_url: string
    } | null
  } | null
}

function roleSuffix(skill: string | null, isCaptain: boolean, isVC: boolean): string {
  const suffixes: string[] = []
  if (isWK) suffixes.push('WK')
  if (isCaptain) suffixes.push('C')
  if (isVC) suffixes.push('VC')
  return suffixes.length > 0 ? ` (${suffixes.join(', ')})` : ''
}

function formatAnnouncementDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const day = d.getDate()
  const suffix = [,'st','nd','rd'][((day%100-20)%10)||day%100>10?0:day%10] ?? 'th'
  return `${day}${suffix} ${d.toLocaleDateString('en-IN', { month: 'long' })} (${d.toLocaleDateString('en-IN', { weekday: 'long' })})`
}

 function formatReportingTime(matchTime: string | null): string {
   if (!matchTime) return 'As per slot'
   const [h, m] = matchTime.split(':').map(Number)
   // Reporting time is 15 minutes before match start
   const totalMinutes = h * 60 + m - 15
   const rh = Math.floor(totalMinutes / 60)
   const rm = totalMinutes % 60
   const period = rh >= 12 ? 'PM' : 'AM'
   const hour12 = rh % 12 || 12
   return `${hour12}${rm > 0 ? `:${String(rm).padStart(2,'0')}` : ''} ${period}`
 }

function jerseyLabel(ballType: 'red' | 'white' | 'pink'): string {
  return ballType === 'white' ? 'Colours' : 'Whites'
}

export function buildSquadAnnouncement(
  booking: AnnouncementBooking,
  players: AnnouncementPlayer[]
): string {
  const ground     = booking.tournament?.ground
  const ballType   = booking.tournament?.ball_type ?? 'red'
  const dateStr    = formatAnnouncementDate(booking.game_date)
  const reportTime = formatReportingTime(booking.match_time)
  const jersey     = jerseyLabel(ballType)

  const playerLines = players
    .map((p, i) => `${i + 1}. ${p.name}${roleSuffix(p.primary_skill, p.is_captain, p.is_vc)}`)
    .join('\n')

  const lines: string[] = [
    `📅 *${dateStr}*`,
    ``,
    `Format: ${booking.format}`,
    ground ? `Venue: ${ground.name}` : null,
    `*Reporting Time: ${reportTime}*`,
    ``,
    ground?.maps_url ? ground.maps_url : null,
    ``,
    `Jersey: *${jersey}*`,
    ``,
    `*Team*`,
    playerLines,
    ``,
    booking.opponent_name ? `*Opponents:* ${booking.opponent_name}` : null,
    ``,
    booking.cricheroes_url ? `*Match Details:*\n${booking.cricheroes_url}` : null,
    ``,
    ground?.hospital_url ? `*Nearest hospital:*\n${ground.hospital_url}` : null,
    ``,
    `*Follow Reporting Time strictly* 🏏`,
  ]

  return lines.filter(l => l !== null).join('\n')
}

export function buildAnnouncementWhatsAppLink(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}