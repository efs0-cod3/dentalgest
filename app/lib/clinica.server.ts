import { redirect } from 'react-router'
import { createSupabaseServerClient } from './supabase.server'
import { puedeVer, seccionInicial, RUTA_SECCION, type Seccion } from './permisos'

export type Sesion = {
  userId: string
  clinicaId: string
  rol: string
  doctorId: string | null
}

export async function getSesion(request: Request): Promise<Sesion> {
  const { supabase } = createSupabaseServerClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw redirect('/login')
  const { data } = await supabase
    .from('perfiles')
    .select('clinica_id,rol,doctor_id')
    .eq('id', user.id)
    .single()
  if (!data?.clinica_id) throw redirect('/login')
  return {
    userId: user.id,
    clinicaId: data.clinica_id,
    rol: (data.rol as string) ?? 'recepcionista',
    doctorId: (data.doctor_id as string | null) ?? null,
  }
}

export async function getClinicaId(request: Request): Promise<string> {
  return (await getSesion(request)).clinicaId
}

/**
 * Guarda de ruta: exige que el rol del usuario tenga acceso a la sección.
 * Si no lo tiene, lo manda a la primera sección que sí puede ver, en vez de
 * dejarlo en una página vacía o con datos que no le corresponden.
 */
export async function requireSeccion(request: Request, seccion: Seccion): Promise<Sesion> {
  const sesion = await getSesion(request)
  if (!puedeVer(sesion.rol, seccion)) {
    throw redirect(RUTA_SECCION[seccionInicial(sesion.rol)])
  }
  return sesion
}
