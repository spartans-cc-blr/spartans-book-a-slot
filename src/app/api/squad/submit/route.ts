export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies })
  const captain = await assertCaptain(supabase)
  if (!captain) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { booking_id } = await req.json()

  // Re-validate ownership
  const { data: booking } = await supabase
    .from('bookings').select('captain_id').eq('id', booking_id).single()
  if (!booking || booking.captain_id !== captain.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await supabase.from('squad')
    .update({ status: 'pending_approval' })
    .eq('booking_id', booking_id).eq('status', 'draft')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}