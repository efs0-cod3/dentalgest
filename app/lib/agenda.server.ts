import type { createSupabaseServerClient } from './supabase.server'

type Supabase = ReturnType<typeof createSupabaseServerClient>['supabase']

export const HORARIO_DEFAULT = { inicio: '08:30', fin: '18:00' }

export async function getHorarioAgenda(supabase: Supabase, clinicaId: string) {
  const { data } = await supabase
    .from('config_clinica')
    .select('agenda_hora_inicio,agenda_hora_fin')
    .eq('clinica_id', clinicaId)
    .single()
  return {
    inicio: data?.agenda_hora_inicio ?? HORARIO_DEFAULT.inicio,
    fin: data?.agenda_hora_fin ?? HORARIO_DEFAULT.fin,
  }
}
