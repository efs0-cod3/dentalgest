import { redirect } from 'react-router'
import type { Route } from './+types/logout'
import { createSupabaseServerClient } from '~/lib/supabase.server'

export async function action({ request }: Route.ActionArgs) {
  const { supabase, headers } = createSupabaseServerClient(request)
  await supabase.auth.signOut()
  return redirect('/login', { headers })
}

export function loader() {
  return redirect('/dashboard')
}
