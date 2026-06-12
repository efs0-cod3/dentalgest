import { redirect } from 'react-router'
import { createSupabaseServerClient } from './supabase.server'

export async function getClinicaId(request: Request): Promise<string> {
  const { supabase } = createSupabaseServerClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw redirect('/login')
  const { data } = await supabase
    .from('perfiles')
    .select('clinica_id')
    .eq('id', user.id)
    .single()
  if (!data?.clinica_id) throw redirect('/login')
  return data.clinica_id
}
