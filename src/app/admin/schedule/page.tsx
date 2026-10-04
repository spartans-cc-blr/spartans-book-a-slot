import { redirect } from 'next/navigation'

// The calendar is now a view inside Matches (/admin?view=calendar).
export default function AdminSchedulePage() {
  redirect('/admin?view=calendar')
}
