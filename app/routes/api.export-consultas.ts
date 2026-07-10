import { createSupabaseServerClient } from '~/lib/supabase.server'
import { getClinicaId } from '~/lib/clinica.server'
import { rowsToCsv } from '~/lib/csv'

function calcularEdad(fechaNacimientoISO: string) {
  const hoy = new Date()
  const nac = new Date(fechaNacimientoISO)
  let edad = hoy.getFullYear() - nac.getFullYear()
  const aunNoCumple = hoy.getMonth() < nac.getMonth() || (hoy.getMonth() === nac.getMonth() && hoy.getDate() < nac.getDate())
  if (aunNoCumple) edad--
  return edad
}

export async function loader({ request }: { request: Request }) {
  const { supabase } = createSupabaseServerClient(request)
  const clinicaId = await getClinicaId(request)
  const url = new URL(request.url)
  const tipo = url.searchParams.get('tipo')
  const pacienteId = url.searchParams.get('paciente_id')
  const doctorId = url.searchParams.get('doctor_id')
  const desde = url.searchParams.get('desde')
  const hasta = url.searchParams.get('hasta')
  const q = url.searchParams.get('q')?.trim().toLowerCase()

  let query = supabase
    .from('expediente_entradas')
    .select('id,fecha,tipo,titulo,descripcion,plan,paciente_id,doctor_id,pacientes(nombre,fecha_nacimiento,cedula),doctores(nombre)')
    .eq('clinica_id', clinicaId)
    .order('fecha', { ascending: false })

  if (tipo) query = query.eq('tipo', tipo)
  if (pacienteId) query = query.eq('paciente_id', pacienteId)
  if (doctorId) query = query.eq('doctor_id', doctorId)
  if (desde) query = query.gte('fecha', desde)
  if (hasta) query = query.lte('fecha', `${hasta}T23:59:59`)

  const { data } = await query

  let entradas = (data ?? []) as any[]
  if (q) {
    entradas = entradas.filter(e => {
      const haystack = `${e.pacientes?.nombre ?? ''} ${e.titulo} ${e.descripcion ?? ''} ${e.plan ?? ''}`.toLowerCase()
      return haystack.includes(q)
    })
  }

  const rows = entradas.map(e => ({
    Fecha: new Date(e.fecha).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }),
    Paciente: e.pacientes?.nombre ?? '',
    Edad: e.pacientes?.fecha_nacimiento ? calcularEdad(e.pacientes.fecha_nacimiento) : '',
    Cédula: e.pacientes?.cedula ?? '',
    Tipo: e.tipo,
    Diagnóstico: e.titulo,
    Descripción: e.descripcion ?? '',
    Plan: e.plan ?? '',
    Doctor: e.doctores?.nombre ?? '',
  }))

  const csv = rowsToCsv(rows)
  const fecha = new Date().toISOString().slice(0, 10)

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="consultas-${fecha}.csv"`,
    },
  })
}
