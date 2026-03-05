/**
 * Builds a WhatsApp deep link with a pre-filled message.
 * On mobile: opens the WhatsApp app directly.
 * On desktop: opens WhatsApp Web.
 */
export function buildWhatsAppLink(params: {
  date:   string   // e.g. 'Saturday 1 Mar'
  time:   string   // e.g. '07:30'
  format?: string  // e.g. 'T20 / T30'
}): string {
  const { date, time, format } = params
  const number = process.env.NEXT_PUBLIC_WA_NUMBER ?? ''

  const message = format
    ? `Hi Spartans! I'd like to enquire about the ${time} slot on ${date} (${format}). Is this available to book?`
    : `Hi Spartans! I'd like to enquire about the ${time} slot on ${date}. Is this available to book?`

  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`
}

/** Generic WhatsApp link with no slot pre-filled */
export function buildGenericWhatsAppLink(): string {
  const number = process.env.NEXT_PUBLIC_WA_NUMBER ?? ''
  const message = `Hi Spartans! I spotted an open slot on your fixture schedule and would like to discuss booking a game. Could you help?`
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`
}
