import { createSupabaseServerClient } from '~/lib/supabase.server'
import { getClinicaId } from '~/lib/clinica.server'

export async function loader({ request }: { request: Request }) {
  const { supabase } = createSupabaseServerClient(request)
  const clinicaId = await getClinicaId(request)

  const [pacientes, citas, pagos, cotizaciones, ordenes] = await Promise.all([
    supabase.from('pacientes').select('*').eq('clinica_id', clinicaId),
    supabase.from('citas').select('*').eq('clinica_id', clinicaId),
    supabase.from('pagos').select('*').eq('clinica_id', clinicaId),
    supabase.from('cotizaciones').select('*').eq('clinica_id', clinicaId),
    supabase.from('ordenes_laboratorio').select('*').eq('clinica_id', clinicaId),
  ])

  const payload = {
    exportado_el: new Date().toISOString(),
    clinica_id: clinicaId,
    pacientes: pacientes.data ?? [],
    citas: citas.data ?? [],
    pagos: pagos.data ?? [],
    cotizaciones: cotizaciones.data ?? [],
    ordenes_laboratorio: ordenes.data ?? [],
  }

  const fecha = new Date().toISOString().slice(0, 10)

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="nin-dental-export-${fecha}.json"`,
    },
  })
}
