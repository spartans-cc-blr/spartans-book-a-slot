export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies })
  const captain = await assertCaptain(supabase)
  if (!captain) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { booking_id } = await req.json()

  // Only allow if status is 'approved' — cannot skip GC step
  const { data: rows } = await supabase.from('squad')
    .select('status').eq('booking_id', booking_id).limit(1)
  if (!rows?.length || rows[0].status !== 'approved')
    return NextResponse.json({ error: 'Squad not yet approved by GC' }, { status: 400 })

  const { error } = await supabase.from('squad')
    .update({ status: 'announced' })
    .eq('booking_id', booking_id).eq('status', 'approved')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}