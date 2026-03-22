// app/api/players/photo/route.ts
// POST /api/players/photo — upload player profile photo to Supabase Storage
// Updates photo_url on the players table.
// Players can only upload their own photo; admins can upload for any player.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'

// Supabase Storage bucket name — create this bucket in your Supabase dashboard
// Settings: public bucket, 5MB file size limit, allow image/* MIME types
const BUCKET = 'player-photos'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user    = session?.user as any

  if (!user?.playerId && !user?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const formData  = await req.formData()
  const file      = formData.get('file') as File | null
  const playerId  = formData.get('player_id') as string | null

  if (!file || !playerId) {
    return NextResponse.json({ error: 'file and player_id are required' }, { status: 400 })
  }

  // Players can only upload their own photo
  if (!user.isAdmin && user.playerId !== playerId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Validate file type
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return NextResponse.json({ error: 'Only JPG, PNG, or WebP images are allowed' }, { status: 400 })
  }

  // Validate file size (5MB)
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'Photo must be under 5MB' }, { status: 400 })
  }

  const supabase  = createServiceClient()
  const ext       = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const filePath  = `${playerId}/avatar.${ext}`
  const arrayBuf  = await file.arrayBuffer()

  // Upload to Supabase Storage (upsert = overwrite existing)
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, arrayBuf, {
      contentType:  file.type,
      upsert:       true,
      cacheControl: '3600',
    })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  // Get the public URL
  const { data: urlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(filePath)

  const photoUrl = urlData.publicUrl

  // Update the players table
  const { error: updateError } = await supabase
    .from('players')
    .update({ photo_url: photoUrl })
    .eq('id', playerId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ photo_url: photoUrl })
}
