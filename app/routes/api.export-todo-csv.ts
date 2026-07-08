import JSZip from 'jszip'
import { createSupabaseServerClient } from '~/lib/supabase.server'
import { getClinicaId } from '~/lib/clinica.server'
import { fetchTodosLosDatos } from '~/lib/exportarTodo.server'
import { rowsToCsv } from '~/lib/csv'

export async function loader({ request }: { request: Request }) {
  const { supabase } = createSupabaseServerClient(request)
  const clinicaId = await getClinicaId(request)
  const datos = await fetchTodosLosDatos(supabase, clinicaId)

  const zip = new JSZip()
  for (const [tabla, rows] of Object.entries(datos)) {
    if (rows.length === 0) continue
    zip.file(`${tabla}.csv`, rowsToCsv(rows as Record<string, unknown>[]))
  }

  const contenido = await zip.generateAsync({ type: 'uint8array' })
  const fecha = new Date().toISOString().slice(0, 10)

  return new Response(contenido as BodyInit, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="nin-dental-export-completo-${fecha}.zip"`,
    },
  })
}
