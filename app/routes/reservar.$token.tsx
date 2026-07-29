import { useMemo, useState } from 'react'
import { Form, useLoaderData, useActionData, useNavigation } from 'react-router'
import type { Route } from './+types/reservar.$token'
import { createSupabaseAdminClient } from '~/lib/supabase.admin.server'
import { drLocalToUTC } from '~/lib/utils'
import { HORARIO_DEFAULT } from '~/lib/agenda.server'
import { horariosLibres, esDiaLaborable, type ConfigAgenda, type CitaOcupada } from '~/lib/reservas'
import { CalendarCheck, CheckCircle, Clock } from 'lucide-react'

type Tratamiento = { id: string; nombre: string; duracion_min: number }

export function meta({ data }: Route.MetaArgs) {
  const nombre = (data as any)?.clinicaNombre ?? 'Reservar cita'
  return [{ title: `Reservar cita — ${nombre}` }]
}

// carga la config pública de la clínica a partir del token del enlace
async function cargarClinica(token: string) {
  const admin = createSupabaseAdminClient()
  const { data: config } = await admin
    .from('config_clinica')
    .select('clinica_id,reservas_habilitado,agenda_hora_inicio,agenda_hora_fin,agenda_duracion_default_min,agenda_dias_laborables,agenda_citas_simultaneas,clinicas(nombre)')
    .eq('reserva_token', token)
    .maybeSingle()
  if (!config || !config.reservas_habilitado) return null

  const agenda: ConfigAgenda = {
    inicio: (config.agenda_hora_inicio as string)?.slice(0, 5) ?? HORARIO_DEFAULT.inicio,
    fin: (config.agenda_hora_fin as string)?.slice(0, 5) ?? HORARIO_DEFAULT.fin,
    duracionDefault: (config.agenda_duracion_default_min as number) ?? 30,
    diasLaborables: (config.agenda_dias_laborables as number[]) ?? [1, 2, 3, 4, 5],
    simultaneas: (config.agenda_citas_simultaneas as boolean) ?? false,
  }
  return {
    admin,
    clinicaId: config.clinica_id as string,
    clinicaNombre: (config.clinicas as any)?.nombre ?? 'la clínica',
    agenda,
  }
}

export async function loader({ params }: Route.LoaderArgs) {
  const token = params.token as string
  const info = await cargarClinica(token)
  if (!info) return { activo: false as const }

  const [{ data: tratamientos }, { data: citas }] = await Promise.all([
    info.admin.from('tratamientos').select('id,nombre,duracion_min').eq('clinica_id', info.clinicaId).order('nombre'),
    info.admin
      .from('citas')
      .select('fecha_hora,duracion_min,estado')
      .eq('clinica_id', info.clinicaId)
      .gte('fecha_hora', new Date().toISOString())
      .neq('estado', 'cancelada'),
  ])

  return {
    activo: true as const,
    clinicaNombre: info.clinicaNombre,
    agenda: info.agenda,
    tratamientos: (tratamientos ?? []) as Tratamiento[],
    citas: (citas ?? []) as CitaOcupada[],
  }
}

export async function action({ params, request }: Route.ActionArgs) {
  const token = params.token as string
  const info = await cargarClinica(token)
  if (!info) return { ok: false, error: 'Las reservas no están disponibles.' }

  const fd = await request.formData()
  const nombre = ((fd.get('nombre') as string) ?? '').trim()
  const telefono = ((fd.get('telefono') as string) ?? '').trim()
  const email = ((fd.get('email') as string) ?? '').trim() || null
  const fecha = (fd.get('fecha') as string) ?? '' // YYYY-MM-DD
  const hora = (fd.get('hora') as string) ?? '' // HH:MM
  const tratamientoId = (fd.get('tratamiento_id') as string) || null
  const motivo = ((fd.get('motivo') as string) ?? '').trim() || null

  if (!nombre || !telefono) return { ok: false, error: 'Ingresa tu nombre y teléfono.' }
  if (!fecha || !hora) return { ok: false, error: 'Elige la fecha y la hora.' }

  // duración según el tratamiento elegido (o la default)
  let duracion = info.agenda.duracionDefault
  if (tratamientoId) {
    const { data: trat } = await info.admin.from('tratamientos').select('duracion_min').eq('id', tratamientoId).eq('clinica_id', info.clinicaId).maybeSingle()
    if (trat?.duracion_min) duracion = trat.duracion_min
  }

  // revalida contra el estado real: el horario debe seguir libre
  const { data: citas } = await info.admin
    .from('citas')
    .select('fecha_hora,duracion_min,estado')
    .eq('clinica_id', info.clinicaId)
    .gte('fecha_hora', new Date().toISOString())
    .neq('estado', 'cancelada')
  const libres = horariosLibres(fecha, duracion, info.agenda, (citas ?? []) as CitaOcupada[])
  if (!libres.includes(hora)) {
    return { ok: false, error: 'Ese horario ya no está disponible. Elige otro, por favor.' }
  }

  // paciente: reutiliza el que tenga el mismo teléfono, o créalo
  const { data: existente } = await info.admin
    .from('pacientes')
    .select('id')
    .eq('clinica_id', info.clinicaId)
    .eq('telefono', telefono)
    .maybeSingle()
  let pacienteId = existente?.id as string | undefined
  if (!pacienteId) {
    const { data: nuevo, error: pErr } = await info.admin
      .from('pacientes')
      .insert({ clinica_id: info.clinicaId, nombre, telefono, email })
      .select('id')
      .single()
    if (pErr || !nuevo) return { ok: false, error: 'No se pudo registrar la solicitud. Intenta de nuevo.' }
    pacienteId = nuevo.id
  }

  const { error: cErr } = await info.admin.from('citas').insert({
    clinica_id: info.clinicaId,
    paciente_id: pacienteId,
    tratamiento_id: tratamientoId,
    fecha_hora: drLocalToUTC(`${fecha}T${hora}`),
    duracion_min: duracion,
    estado: 'pendiente',
    origen: 'reserva',
    notas: motivo ? `Reserva en línea — ${motivo}` : 'Reserva en línea',
  })
  if (cErr) return { ok: false, error: 'No se pudo registrar la solicitud. Intenta de nuevo.' }

  return { ok: true, fecha, hora }
}

// ─── UI ─────────────────────────────────────────────────────────────────────

const DIAS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
function fmtFechaLarga(fecha: string) {
  const d = new Date(fecha + 'T12:00:00-04:00')
  return `${DIAS_ES[d.getUTCDay()]} ${d.getUTCDate()} de ${['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'][d.getUTCMonth()]}`
}

function hoyLocal() {
  const d = new Date(Date.now() - 4 * 60 * 60 * 1000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

export default function Reservar() {
  const data = useLoaderData<typeof loader>()
  const actionData = useActionData<typeof action>()
  const navigation = useNavigation()
  const enviando = navigation.state === 'submitting'

  const [tratamientoId, setTratamientoId] = useState('')
  const [fecha, setFecha] = useState('')
  const [hora, setHora] = useState('')

  if (!data.activo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-sm w-full bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <p className="text-gray-900 font-semibold">Reservas no disponibles</p>
          <p className="text-sm text-gray-500 mt-2">
            Este enlace no está activo. Comunícate con la clínica para agendar tu cita.
          </p>
        </div>
      </div>
    )
  }

  if (actionData?.ok) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-sm w-full bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="text-green-600" size={28} />
          </div>
          <h1 className="text-lg font-bold text-gray-900">¡Solicitud recibida!</h1>
          <p className="text-sm text-gray-600 mt-2">
            Pediste tu cita para el <strong>{fmtFechaLarga(actionData.fecha!)}</strong> a las{' '}
            <strong>{actionData.hora}</strong>.
          </p>
          <p className="text-xs text-gray-500 mt-3 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            Queda <strong>pendiente de confirmación</strong>. La clínica te contactará para confirmarla.
          </p>
        </div>
      </div>
    )
  }

  const { agenda, tratamientos, citas } = data
  const durSel = tratamientoId
    ? tratamientos.find(t => t.id === tratamientoId)?.duracion_min ?? agenda.duracionDefault
    : agenda.duracionDefault

  const slots = useMemo(() => {
    if (!fecha) return []
    return horariosLibres(fecha, durSel, agenda, citas)
  }, [fecha, durSel, agenda, citas])

  const fechaNoLaborable = fecha && !esDiaLaborable(fecha, agenda.diasLaborables)

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center mx-auto mb-3">
            <CalendarCheck className="text-white" size={24} />
          </div>
          <h1 className="text-xl font-bold text-gray-900">{data.clinicaNombre}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Solicita tu cita en línea</p>
        </div>

        <Form method="post" className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          {/* servicio */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Servicio (opcional)</label>
            <select
              name="tratamiento_id"
              value={tratamientoId}
              onChange={e => { setTratamientoId(e.target.value); setHora('') }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Consulta general</option>
              {tratamientos.map(t => (
                <option key={t.id} value={t.id}>{t.nombre} ({t.duracion_min} min)</option>
              ))}
            </select>
          </div>

          {/* fecha */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Fecha <span className="text-red-500">*</span></label>
            <input
              type="date"
              required
              min={hoyLocal()}
              value={fecha}
              onChange={e => { setFecha(e.target.value); setHora('') }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* horarios */}
          {fecha && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5 flex items-center gap-1.5">
                <Clock size={13} /> Horarios disponibles
              </label>
              {fechaNoLaborable ? (
                <p className="text-sm text-gray-400 bg-gray-50 rounded-lg px-3 py-2">La clínica no atiende ese día.</p>
              ) : slots.length === 0 ? (
                <p className="text-sm text-gray-400 bg-gray-50 rounded-lg px-3 py-2">No quedan horarios para esa fecha. Prueba otro día.</p>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {slots.map(s => (
                    <button
                      type="button"
                      key={s}
                      onClick={() => setHora(s)}
                      className={
                        'px-2 py-2 rounded-lg text-sm font-medium border transition-colors ' +
                        (hora === s
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-blue-400')
                      }
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <input type="hidden" name="fecha" value={fecha} />
          <input type="hidden" name="hora" value={hora} />

          {/* datos del paciente */}
          <div className="pt-1 border-t border-gray-100 space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nombre completo <span className="text-red-500">*</span></label>
              <input name="nombre" required placeholder="Tu nombre"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Teléfono <span className="text-red-500">*</span></label>
              <input name="telefono" type="tel" required placeholder="809 555 1234"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Correo (opcional)</label>
              <input name="email" type="email" placeholder="correo@ejemplo.com"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Motivo (opcional)</label>
              <textarea name="motivo" rows={2} placeholder="Ej. Limpieza, dolor de muela…"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>
          </div>

          {actionData?.ok === false && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{actionData.error}</p>
          )}

          <button
            type="submit"
            disabled={enviando || !hora}
            className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {enviando ? 'Enviando…' : !hora ? 'Elige un horario' : 'Solicitar cita'}
          </button>
          <p className="text-xs text-gray-400 text-center">
            Tu cita quedará pendiente hasta que la clínica la confirme.
          </p>
        </Form>
      </div>
    </div>
  )
}
