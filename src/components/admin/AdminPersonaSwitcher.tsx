'use client'
import { usePersonaState } from '@/lib/usePersona'
import { PersonaSwitcher } from '@/components/ui/PersonaSwitcher'

// Mounted in the admin top bar in place of the old plain "← Hub" link.
// Being inside /admin always means "viewing as Admin" by definition, so the
// pill is forced to show that regardless of whatever persona was last
// picked elsewhere — picking any other persona here routes back out to "/"
// via the same usePersonaState() leaving-admin rule every other page uses.
export function AdminPersonaSwitcher() {
  const { selectPersona, available } = usePersonaState()
  return <PersonaSwitcher persona="admin" selectPersona={selectPersona} available={available} />
}
