// GET — returns all O/E players and which squads cover them
export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies })
  // GC members are admins — re-validate
  const captain = await assertCaptain(supabase)
  if (!captain) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const weekStart = req.nextUrl.searchParams.get('week_start')
  if (!weekStart) return NextResponse.json({ error: 'week_start required' }, { status: 400 })

  // All bookings this weekend
  const { data: bookings } = await supabase.from('bookings')
    .select('id, slot_time, format')
    .gte('game_date', weekStart)
    .lt('game_date', new Date(new Date(weekStart).getTime() + 7*86400000).toISOString().slice(0,10))

  // All O/E availability this weekend
  const { data: avail } = await supabase.from('availability')
    .select('player_id, booking_id, response, players(name)')
    .in('response', ['O', 'E'])
    .in('booking_id', bookings?.map(b => b.id) ?? [])

  // All squad selections this weekend
  const { data: squads } = await supabase.from('squad')
    .select('player_id, booking_id, status')
    .in('booking_id', bookings?.map(b => b.id) ?? [])
    .in('status', ['pending_approval', 'approved', 'announced'])

  return NextResponse.json({ bookings, avail, squads })
}

// PATCH — GC approves or returns a squad
export async function PATCH(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies })
  const captain = await assertCaptain(supabase)
  if (!captain) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { booking_id, decision, note } = await req.json()
  if (!['approved', 'returned'].includes(decision))
    return NextResponse.json({ error: 'Invalid decision' }, { status: 400 })

  if (decision === 'approved') {
    await supabase.from('squad')
      .update({ status: 'approved' })
      .eq('booking_id', booking_id).eq('status', 'pending_approval')
  } else {
    // Return to draft — captain must revise
    await supabase.from('squad')
      .update({ status: 'draft' })
      .eq('booking_id', booking_id).eq('status', 'pending_approval')
    // Optionally store the note — could be a separate gc_notes table in a future sprint
  }

  return NextResponse.json({ ok: true })
}