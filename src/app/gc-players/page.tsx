// /gc-players — retired. The GC-only Squad Register became the club-wide
// /players directory (see features/player-directory.md). Kept as a
// redirect so old links and bookmarks still land somewhere useful.

import { redirect } from 'next/navigation'

export default function GCPlayersRedirect() {
  redirect('/players')
}
