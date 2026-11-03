import { createSupabaseServerClient } from '~/lib/supabase.server'
import { getSesion } from '~/lib/clinica.server'
import { parsearReceta, motivoAnulacionSchema } from '~/lib/prescripciones'
import {
  contextoReceta,
  armarSnapshot,
  emitirReceta,
  anularReceta,
  revisarPuedeEmitir,
} from '~/lib/prescripciones.server'

// Emitir y anular recetas. Es una ruta propia para que el mismo formulario
// sirva desde Consultas y desde la ficha del paciente sin duplicar la lógica.

export async function action({ request }: { request: Request }) {
  const { supabase } = createSupabaseServerClient(request)
  const { clinicaId, rol, doctorId } = await getSesion(request)
  const fd = await request.formData()
  const intent = fd.get('intent') as string

  // ── anular ──────────────────────────────────────────────────────────────────
  if (intent === 'anular') {
    const motivo = motivoAnulacionSchema.safeParse(fd.get('motivo'))
    if (!motivo.success) {
      return Response.json(
        { ok: false, error: motivo.error.issues[0]?.message ?? 'Indica el motivo.' },
        { status: 400 },
      )
    }
    // quién puede anular lo decide anular_prescripcion() en la base
    const fallo = await anularReceta(supabase as any, fd.get('id') as string, motivo.data)
    if (fallo) return Response.json({ ok: false, error: fallo }, { status: 400 })
    return Response.json({ ok: true })
  }

  // ── emitir ──────────────────────────────────────────────────────────────────
  if (intent !== 'emitir') {
    return Response.json({ ok: false, error: 'Intent desconocido' }, { status: 400 })
  }

  const leida = parsearReceta(fd)
  if (!leida.ok) return Response.json({ ok: false, error: leida.error }, { status: 400 })

  const { doctor, clinica } = await contextoReceta(supabase as any, clinicaId, doctorId)

  const impedimento = revisarPuedeEmitir(rol, doctor)
  if (impedimento) return Response.json({ ok: false, error: impedimento }, { status: 403 })
  if (!clinica) {
    return Response.json({ ok: false, error: 'No se pudieron leer los datos de la clínica.' }, { status: 400 })
  }

  // el paciente se lee de la base, no del formulario: así el snapshot queda
  // con el nombre y la cédula reales y se comprueba que sea de esta clínica
  const { data: paciente } = await supabase
    .from('pacientes')
    .select('nombre,fecha_nacimiento,cedula')
    .eq('id', leida.receta.paciente_id)
    .eq('clinica_id', clinicaId)
    .maybeSingle()

  if (!paciente) {
    return Response.json({ ok: false, error: 'El paciente no existe en tu clínica.' }, { status: 400 })
  }

  const snapshot = armarSnapshot(doctor!, clinica, paciente as any)
  const emitida = await emitirReceta(supabase as any, leida.receta, snapshot)
  if (!emitida.ok) return Response.json({ ok: false, error: emitida.error }, { status: 400 })

  return Response.json({ ok: true, id: emitida.id })
}
