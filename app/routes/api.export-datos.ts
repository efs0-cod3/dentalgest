import { createSupabaseServerClient } from '~/lib/supabase.server'
import { requireSeccion } from '~/lib/clinica.server'
import { fetchTodosLosDatos } from '~/lib/exportarTodo.server'

export async function loader({ request }: { request: Request }) {
  const { supabase } = createSupabaseServerClient(request)
  const { clinicaId } = await requireSeccion(request, 'configuracion')
  const datos = await fetchTodosLosDatos(supabase, clinicaId)

  const payload = {
    exportado_el: new Date().toISOString(),
    clinica_id: clinicaId,
    ...datos,
  }

  const fecha = new Date().toISOString().slice(0, 10)

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="nin-dental-export-${fecha}.json"`,
    },
  })
}
