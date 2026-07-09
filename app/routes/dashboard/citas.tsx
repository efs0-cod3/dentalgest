import { useState, useMemo } from 'react'
import { Form, useLoaderData, useSearchParams, useNavigation, useSubmit } from 'react-router'
import type { Route } from './+types/citas'
import { createSupabaseServerClient } from '~/lib/supabase.server'
import { getClinicaId } from '~/lib/clinica.server'
import { Calendar, List, Plus, X, ChevronLeft, ChevronRight, Pencil, Trash2, Clock, User, Stethoscope, Syringe, FileText, UserCheck, TrendingUp } from 'lucide-react'
import { cn, drLocalToUTC } from '~/lib/utils'
import { useCloseOnSubmit } from '~/lib/hooks'
import { ConfirmDeleteModal } from '~/components/ConfirmDeleteModal'

type Cita = {
  id: string
  fecha_hora: string
  duracion_min: number
  estado: string
  notas: string | null
  paciente_id: string | null
  doctor_id: string | null
  tratamiento_id: string | null
  pacientes: { nombre: string } | null
  doctores: { nombre: string } | null
  tratamientos: { nombre: string } | null
}
type Paciente = { id: string; nombre: string }
type Doctor = { id: string; nombre: string }
type Tratamiento = { id: string; nombre: string; duracion_min: number }

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Citas — Nin Dental Clinic' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request)
  const clinicaId = await getClinicaId(request)
  const [{ data: citas }, { data: pacientes }, { data: doctores }, { data: tratamientos }] =
    await Promise.all([
      supabase
        .from('citas')
        .select('id,fecha_hora,duracion_min,estado,notas,paciente_id,doctor_id,tratamiento_id,pacientes(nombre),doctores(nombre),tratamientos(nombre)')
        .eq('clinica_id', clinicaId)
        .order('fecha_hora', { ascending: true }),
      supabase.from('pacientes').select('id,nombre').eq('clinica_id', clinicaId).order('nombre'),
      supabase.from('doctores').select('id,nombre').eq('clinica_id', clinicaId).order('nombre'),
      supabase.from('tratamientos').select('id,nombre,duracion_min').eq('clinica_id', clinicaId).order('nombre'),
    ])
  return {
    citas: (citas ?? []) as unknown as Cita[],
    pacientes: (pacientes ?? []) as Paciente[],
    doctores: (doctores ?? []) as Doctor[],
    tratamientos: (tratamientos ?? []) as Tratamiento[],
  }
}

export async function action({ request }: Route.ActionArgs) {
  const { supabase } = createSupabaseServerClient(request)
  const clinicaId = await getClinicaId(request)
  const fd = await request.formData()
  const intent = fd.get('intent') as string

  if (intent === 'delete') {
    await supabase.from('citas').delete().eq('id', fd.get('id') as string).eq('clinica_id', clinicaId)
    return { ok: true }
  }

  const data = {
    clinica_id: clinicaId,
    paciente_id: fd.get('paciente_id') || null,
    doctor_id: fd.get('doctor_id') || null,
    tratamiento_id: fd.get('tratamiento_id') || null,
    fecha_hora: fd.get('fecha_hora') as string,
    duracion_min: Number(fd.get('duracion_min')) || 30,
    estado: fd.get('estado') as string,
    notas: (fd.get('notas') as string) || null,
  }

  if (intent === 'create') await supabase.from('citas').insert(data)
  else if (intent === 'update')
    await supabase.from('citas').update(data).eq('id', fd.get('id') as string).eq('clinica_id', clinicaId)

  return { ok: true }
}

// ─── helpers ────────────────────────────────────────────────────────────────

const ESTADOS = ['pendiente', 'confirmada', 'completada', 'cancelada'] as const

const estadoStyle: Record<string, string> = {
  pendiente: 'bg-yellow-100 text-yellow-700',
  confirmada: 'bg-blue-100 text-blue-700',
  completada: 'bg-green-100 text-green-700',
  cancelada: 'bg-gray-100 text-gray-500 line-through',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

const DR_OFFSET_MS = -4 * 60 * 60 * 1000 // UTC-4, no DST

function toDatetimeLocal(iso: string) {
  const d = new Date(new Date(iso).getTime() - DR_OFFSET_MS)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

// ─── detail modal ────────────────────────────────────────────────────────────

function CitaDetalleModal({
  cita,
  onClose,
  onEdit,
}: {
  cita: Cita
  onClose: () => void
  onEdit: () => void
}) {
  const isPast = new Date(cita.fecha_hora) < new Date()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const navigation = useNavigation()
  const submit = useSubmit()
  useCloseOnSubmit(() => setConfirmDelete(false))

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden max-h-[95vh] sm:max-h-none flex flex-col">

        {/* header */}
        <div className="px-6 py-5 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-start justify-between">
            <div>
              <span className={cn('px-2.5 py-1 rounded-full text-xs font-semibold', estadoStyle[cita.estado])}>
                {cita.estado.charAt(0).toUpperCase() + cita.estado.slice(1)}
              </span>
              <h2 className="font-semibold text-gray-900 text-lg mt-2 leading-tight">
                {cita.pacientes?.nombre ?? 'Sin paciente'}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Pencil size={13} /> Editar
              </button>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* body */}
        <div className="px-6 py-4 space-y-3 overflow-y-auto flex-1">
          <div className="flex items-center gap-3 text-sm">
            <Calendar size={15} className="text-gray-400 flex-shrink-0" />
            <div>
              <p className="font-medium text-gray-900">{fmtDate(cita.fecha_hora)}</p>
              <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                <Clock size={11} /> {cita.duracion_min} minutos
                {isPast && cita.estado === 'pendiente' && (
                  <span className="ml-2 text-orange-500 font-medium">· Pasada</span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <User size={15} className="text-gray-400 flex-shrink-0" />
            <div>
              <p className="text-xs text-gray-400">Paciente</p>
              <p className="font-medium text-gray-900">{cita.pacientes?.nombre ?? '—'}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <Stethoscope size={15} className="text-gray-400 flex-shrink-0" />
            <div>
              <p className="text-xs text-gray-400">Doctor</p>
              <p className="font-medium text-gray-900">{cita.doctores?.nombre ?? '—'}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <Syringe size={15} className="text-gray-400 flex-shrink-0" />
            <div>
              <p className="text-xs text-gray-400">Tratamiento</p>
              <p className="font-medium text-gray-900">{cita.tratamientos?.nombre ?? '—'}</p>
            </div>
          </div>

          {cita.notas && (
            <div className="flex items-start gap-3 text-sm">
              <FileText size={15} className="text-gray-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-gray-400">Notas</p>
                <p className="text-gray-700 mt-0.5">{cita.notas}</p>
              </div>
            </div>
          )}
        </div>

        {/* footer: delete */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end flex-shrink-0">
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
          >
            <Trash2 size={13} /> Eliminar cita
          </button>
        </div>
      </div>
    </div>

    {confirmDelete && (
      <ConfirmDeleteModal
        title="Eliminar cita"
        itemLabel={cita.pacientes?.nombre ?? 'Sin paciente'}
        description={`${fmtDate(cita.fecha_hora)}${cita.doctores ? ` · ${cita.doctores.nombre}` : ''}${cita.tratamientos ? ` · ${cita.tratamientos.nombre}` : ''}. Esta acción no se puede deshacer.`}
        isSubmitting={navigation.state === 'submitting'}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => submit({ intent: 'delete', id: cita.id }, { method: 'post' })}
      />
    )}
    </>
  )
}

// ─── edit modal ───────────────────────────────────────────────────────────────

function CitaModal({
  cita,
  pacientes,
  doctores,
  tratamientos,
  onClose,
}: {
  cita: Cita | null
  pacientes: Paciente[]
  doctores: Doctor[]
  tratamientos: Tratamiento[]
  onClose: () => void
}) {
  const navigation = useNavigation()
  const isSubmitting = navigation.state === 'submitting'

  // Split into date + time for display; hidden field submits UTC ISO
  const initial = cita ? toDatetimeLocal(cita.fecha_hora) : ''
  const [fechaDate, setFechaDate] = useState(initial.slice(0, 10))
  const [fechaTime, setFechaTime] = useState(initial.slice(11, 16))
  const fechaLocal = fechaDate && fechaTime ? `${fechaDate}T${fechaTime}` : ''

  useCloseOnSubmit(onClose)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-semibold text-gray-900">
            {cita ? 'Editar cita' : 'Nueva cita'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <Form method="post" className="p-6 space-y-4 overflow-y-auto flex-1">
          <input type="hidden" name="intent" value={cita ? 'update' : 'create'} />
          {cita && <input type="hidden" name="id" value={cita.id} />}
          {/* Convert local time to UTC ISO before submitting */}
          <input
            type="hidden"
            name="fecha_hora"
            value={fechaLocal ? drLocalToUTC(fechaLocal) : ''}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Paciente</label>
              <select
                name="paciente_id"
                defaultValue={cita?.paciente_id ?? ''}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— Sin paciente —</option>
                {pacientes.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Doctor</label>
              <select
                name="doctor_id"
                defaultValue={cita?.doctor_id ?? ''}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— Sin doctor —</option>
                {doctores.map(d => (
                  <option key={d.id} value={d.id}>{d.nombre}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tratamiento</label>
            <select
              name="tratamiento_id"
              defaultValue={cita?.tratamiento_id ?? ''}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Sin tratamiento —</option>
              {tratamientos.map(t => (
                <option key={t.id} value={t.id}>{t.nombre}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fecha <span className="text-red-500">*</span></label>
              <input
                type="date"
                required
                value={fechaDate}
                onChange={e => setFechaDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Hora <span className="text-red-500">*</span></label>
              <input
                type="time"
                required
                value={fechaTime}
                onChange={e => setFechaTime(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Duración (min)</label>
              <input
                type="number"
                name="duracion_min"
                min={5}
                step={5}
                defaultValue={cita?.duracion_min ?? 30}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Estado</label>
            <select
              name="estado"
              defaultValue={cita?.estado ?? 'pendiente'}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {ESTADOS.map(e => (
                <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
            <textarea
              name="notas"
              rows={3}
              defaultValue={cita?.notas ?? ''}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </Form>
      </div>
    </div>
  )
}

// ─── table view ─────────────────────────────────────────────────────────────

function TablaView({
  citas,
  onDetalle,
  onEdit,
}: {
  citas: Cita[]
  onDetalle: (c: Cita) => void
  onEdit: (c: Cita) => void
}) {
  const [deleteTarget, setDeleteTarget] = useState<Cita | null>(null)
  const navigation = useNavigation()
  const submit = useSubmit()
  useCloseOnSubmit(() => setDeleteTarget(null))

  if (citas.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-gray-400">No hay citas.</div>
    )
  }
  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              {['Fecha y hora', 'Paciente', 'Doctor', 'Tratamiento', 'Duración', 'Estado', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {citas.map(c => (
              <tr
                key={c.id}
                className="hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => onDetalle(c)}
              >
                <td className="px-4 py-3 text-gray-900 whitespace-nowrap">{fmtDate(c.fecha_hora)}</td>
                <td className="px-4 py-3 text-gray-700">{c.pacientes?.nombre ?? '—'}</td>
                <td className="px-4 py-3 text-gray-700">{c.doctores?.nombre ?? '—'}</td>
                <td className="px-4 py-3 text-gray-700">{c.tratamientos?.nombre ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500">{c.duracion_min} min</td>
                <td className="px-4 py-3">
                  <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', estadoStyle[c.estado])}>
                    {c.estado}
                  </span>
                </td>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onEdit(c)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(c)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden divide-y divide-gray-100">
        {citas.map(c => (
          <div
            key={c.id}
            className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer"
            onClick={() => onDetalle(c)}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0', estadoStyle[c.estado])}>
                  {c.estado}
                </span>
                <span className="text-xs text-gray-400 truncate">{fmtDate(c.fecha_hora)}</span>
              </div>
              <p className="text-sm font-medium text-gray-900 truncate">{c.pacientes?.nombre ?? '—'}</p>
              <p className="text-xs text-gray-400 truncate">
                {c.tratamientos?.nombre ?? 'Sin tratamiento'}
                {c.doctores ? ` · ${c.doctores.nombre}` : ''}
                {' · '}{c.duracion_min} min
              </p>
            </div>
            <button
              onClick={e => { e.stopPropagation(); onEdit(c) }}
              className="p-2 text-gray-300 hover:text-blue-600 flex-shrink-0"
            >
              <Pencil size={15} />
            </button>
          </div>
        ))}
      </div>

      {deleteTarget && (
        <ConfirmDeleteModal
          title="Eliminar cita"
          itemLabel={deleteTarget.pacientes?.nombre ?? 'Sin paciente'}
          description={`${fmtDate(deleteTarget.fecha_hora)}${deleteTarget.doctores ? ` · ${deleteTarget.doctores.nombre}` : ''}${deleteTarget.tratamientos ? ` · ${deleteTarget.tratamientos.nombre}` : ''}. Esta acción no se puede deshacer.`}
          isSubmitting={navigation.state === 'submitting'}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => submit({ intent: 'delete', id: deleteTarget.id }, { method: 'post' })}
        />
      )}
    </>
  )
}

// ─── week view ───────────────────────────────────────────────────────────────

const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function WeekView({
  citas,
  weekStart,
  onEdit,
  onPrev,
  onNext,
  onToday,
}: {
  citas: Cita[]
  weekStart: Date
  onEdit: (c: Cita) => void
  onPrev: () => void
  onNext: () => void
  onToday: () => void
}) {
  const days = Array.from({ length: 7 }, (_, i) =>
    new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i))
  const weekEndExclusive = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7)

  const citasByDay = useMemo(() => {
    const map: Record<string, Cita[]> = {}
    for (const c of citas) {
      const d = new Date(c.fecha_hora)
      if (d >= weekStart && d < weekEndExclusive) {
        const key = d.toDateString()
        if (!map[key]) map[key] = []
        map[key].push(c)
      }
    }
    for (const key in map) map[key].sort((a, b) => new Date(a.fecha_hora).getTime() - new Date(b.fecha_hora).getTime())
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [citas, weekStart.getTime()])

  const rangeLabel = `${days[0].toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} – ${days[6].toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}`
  const today = new Date()

  return (
    <div>
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <button onClick={onPrev} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
          <ChevronLeft size={16} />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-800 capitalize">{rangeLabel}</span>
          <button onClick={onToday} className="text-xs font-medium text-blue-600 hover:underline">Hoy</button>
        </div>
        <button onClick={onNext} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 divide-x divide-gray-100">
        {days.map((d, i) => {
          const isToday = d.toDateString() === today.toDateString()
          const dayCitas = citasByDay[d.toDateString()] ?? []
          return (
            <div key={i} className="min-h-[220px]">
              <div className={cn('text-center py-2 border-b border-gray-100', isToday && 'bg-blue-50')}>
                <p className="text-xs font-semibold text-gray-400 uppercase">{DIAS_CORTOS[i]}</p>
                <span className={cn(
                  'inline-flex items-center justify-center w-6 h-6 text-xs font-medium rounded-full mt-0.5',
                  isToday ? 'bg-blue-600 text-white' : 'text-gray-700'
                )}>
                  {d.getDate()}
                </span>
              </div>
              <div className="p-1.5 space-y-1">
                {dayCitas.length === 0 ? (
                  <p className="text-center text-xs text-gray-300 mt-2">—</p>
                ) : dayCitas.map(c => (
                  <button
                    key={c.id}
                    onClick={() => onEdit(c)}
                    className={cn('w-full text-left px-1.5 py-1 rounded text-xs', estadoStyle[c.estado])}
                  >
                    <p className="font-semibold">
                      {new Date(c.fecha_hora).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <p className="truncate">{c.pacientes?.nombre ?? 'Sin paciente'}</p>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── calendar view ───────────────────────────────────────────────────────────

function CalendarView({
  citas,
  year,
  month,
  onEdit,
  onPrev,
  onNext,
}: {
  citas: Cita[]
  year: number
  month: number
  onEdit: (c: Cita) => void
  onPrev: () => void
  onNext: () => void
}) {
  const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  const firstDow = new Date(year, month, 1).getDay()
  const totalDays = daysInMonth(year, month)
  const cells = Array.from({ length: firstDow + totalDays }, (_, i) =>
    i < firstDow ? null : i - firstDow + 1
  )

  const citasByDay = useMemo(() => {
    const map: Record<number, Cita[]> = {}
    for (const c of citas) {
      const d = new Date(c.fecha_hora)
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate()
        if (!map[day]) map[day] = []
        map[day].push(c)
      }
    }
    return map
  }, [citas, year, month])

  const monthName = new Date(year, month, 1).toLocaleString('es-MX', { month: 'long', year: 'numeric' })

  return (
    <div>
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <button onClick={onPrev} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-semibold text-gray-800 capitalize">{monthName}</span>
        <button onClick={onNext} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 border-b border-gray-100">
        {DAYS.map(d => (
          <div key={d} className="py-2 text-center text-xs font-semibold text-gray-400 uppercase">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 divide-x divide-y divide-gray-100">
        {cells.map((day, i) => {
          const today = new Date()
          const isToday = day !== null &&
            today.getDate() === day &&
            today.getMonth() === month &&
            today.getFullYear() === year

          return (
            <div
              key={i}
              className={cn('min-h-[60px] md:min-h-[90px] p-1', day === null ? 'bg-gray-50' : 'bg-white')}
            >
              {day !== null && (
                <>
                  <span className={cn(
                    'inline-flex items-center justify-center w-6 h-6 text-xs font-medium rounded-full mb-1',
                    isToday ? 'bg-blue-600 text-white' : 'text-gray-500'
                  )}>
                    {day}
                  </span>
                  <div className="space-y-0.5">
                    {(citasByDay[day] ?? []).slice(0, 3).map(c => (
                      <button
                        key={c.id}
                        onClick={() => onEdit(c)}
                        className={cn(
                          'w-full text-left px-1.5 py-0.5 rounded text-xs truncate',
                          estadoStyle[c.estado]
                        )}
                      >
                        {new Date(c.fecha_hora).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                        {' '}{c.pacientes?.nombre ?? 'Sin paciente'}
                      </button>
                    ))}
                    {(citasByDay[day]?.length ?? 0) > 3 && (
                      <span className="text-xs text-gray-400 px-1">
                        +{citasByDay[day].length - 3} más
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── page ────────────────────────────────────────────────────────────────────

export default function Citas() {
  const { citas, pacientes, doctores, tratamientos } = useLoaderData<typeof loader>()
  const [searchParams, setSearchParams] = useSearchParams()

  const view = searchParams.get('view') ?? 'tabla'
  const monthParam = searchParams.get('month')

  const today = new Date()
  const [calYear, setCalYear] = useState(() => {
    if (monthParam) return parseInt(monthParam.split('-')[0])
    return today.getFullYear()
  })
  const [calMonth, setCalMonth] = useState(() => {
    if (monthParam) return parseInt(monthParam.split('-')[1]) - 1
    return today.getMonth()
  })

  const [weekStart, setWeekStart] = useState(() =>
    new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay()))

  const [estadoFilter, setEstadoFilter] = useState('todos')
  const [detalle, setDetalle] = useState<Cita | null>(null)
  const [modal, setModal] = useState<{ open: boolean; cita: Cita | null }>({ open: false, cita: null })

  const filteredCitas = useMemo(() => {
    if (estadoFilter === 'todos') return citas
    return citas.filter(c => c.estado === estadoFilter)
  }, [citas, estadoFilter])

  const statsSemana = useMemo(() => {
    const inicioSemana = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay())
    const finSemana = new Date(inicioSemana.getFullYear(), inicioSemana.getMonth(), inicioSemana.getDate() + 7)
    const citasSemana = citas.filter(c => {
      const d = new Date(c.fecha_hora)
      return d >= inicioSemana && d < finSemana
    })
    const confirmadas = citasSemana.filter(c => c.estado === 'confirmada').length
    const concluidas = citasSemana.filter(c => c.estado === 'completada' || c.estado === 'cancelada')
    const completadas = concluidas.filter(c => c.estado === 'completada').length
    return {
      total: citasSemana.length,
      confirmadas,
      tasaAsistencia: concluidas.length > 0 ? Math.round((completadas / concluidas.length) * 100) : null,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [citas])

  const citasHoy = useMemo(() =>
    citas
      .filter(c => {
        const d = new Date(c.fecha_hora)
        return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate()
      })
      .sort((a, b) => new Date(a.fecha_hora).getTime() - new Date(b.fecha_hora).getTime()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [citas]
  )

  const fmtHoy = today.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })

  function setView(v: string) {
    setSearchParams(prev => { prev.set('view', v); return prev }, { replace: true })
  }

  function prevMonth() {
    setCalMonth(m => {
      if (m === 0) { setCalYear(y => y - 1); return 11 }
      return m - 1
    })
  }

  function nextMonth() {
    setCalMonth(m => {
      if (m === 11) { setCalYear(y => y + 1); return 0 }
      return m + 1
    })
  }

  function prevWeek() {
    setWeekStart(w => new Date(w.getFullYear(), w.getMonth(), w.getDate() - 7))
  }

  function nextWeek() {
    setWeekStart(w => new Date(w.getFullYear(), w.getMonth(), w.getDate() + 7))
  }

  function todayWeek() {
    const t = new Date()
    setWeekStart(new Date(t.getFullYear(), t.getMonth(), t.getDate() - t.getDay()))
  }

  return (
    <div className="p-4 md:p-8">
      {/* header */}
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Citas</h1>
        <button
          onClick={() => setModal({ open: true, cita: null })}
          className="flex items-center gap-2 px-3 py-2 md:px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          <span className="hidden sm:inline">Nueva cita</span>
          <span className="sm:hidden">Nueva</span>
        </button>
      </div>

      {/* weekly stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 md:mb-6">
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            <Calendar size={13} /> Citas esta semana
          </div>
          <p className="text-2xl font-bold text-gray-900">{statsSemana.total}</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            <UserCheck size={13} /> Confirmadas
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {statsSemana.confirmadas} <span className="text-sm font-medium text-gray-400">/ {statsSemana.total}</span>
          </p>
          <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2">
            <div className="h-1.5 rounded-full bg-blue-500 transition-all"
              style={{ width: `${statsSemana.total > 0 ? (statsSemana.confirmadas / statsSemana.total) * 100 : 0}%` }} />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            <TrendingUp size={13} /> Tasa de asistencia
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {statsSemana.tasaAsistencia === null ? '—' : `${statsSemana.tasaAsistencia}%`}
          </p>
          <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2">
            <div className="h-1.5 rounded-full bg-green-500 transition-all"
              style={{ width: `${statsSemana.tasaAsistencia ?? 0}%` }} />
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1 min-w-0">
          {/* toolbar */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {/* estado filter — scrollable on mobile */}
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1 overflow-x-auto max-w-full">
              {['todos', ...ESTADOS].map(e => (
                <button
                  key={e}
                  onClick={() => setEstadoFilter(e)}
                  className={cn(
                    'px-2.5 py-1 text-xs font-medium rounded-md transition-colors capitalize whitespace-nowrap flex-shrink-0',
                    estadoFilter === e ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  )}
                >
                  {e}
                </button>
              ))}
            </div>

            <div className="ml-auto flex gap-1 bg-gray-100 rounded-lg p-1 flex-shrink-0">
              <button
                onClick={() => setView('tabla')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors',
                  view === 'tabla' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                )}
              >
                <List size={13} /> Tabla
              </button>
              <button
                onClick={() => setView('semana')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors',
                  view === 'semana' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                )}
              >
                <Calendar size={13} /> Semana
              </button>
              <button
                onClick={() => setView('calendario')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors',
                  view === 'calendario' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                )}
              >
                <Calendar size={13} /> Mes
              </button>
            </div>
          </div>

          {/* content */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            {view === 'tabla' ? (
              <TablaView
                citas={filteredCitas}
                onDetalle={c => setDetalle(c)}
                onEdit={c => setModal({ open: true, cita: c })}
              />
            ) : view === 'semana' ? (
              <WeekView
                citas={filteredCitas}
                weekStart={weekStart}
                onEdit={c => setDetalle(c)}
                onPrev={prevWeek}
                onNext={nextWeek}
                onToday={todayWeek}
              />
            ) : (
              <CalendarView
                citas={filteredCitas}
                year={calYear}
                month={calMonth}
                onEdit={c => setDetalle(c)}
                onPrev={prevMonth}
                onNext={nextMonth}
              />
            )}
          </div>
        </div>

        {/* daily summary panel */}
        <div className="lg:w-80 flex-shrink-0">
          <div className="bg-white rounded-2xl border border-gray-200 p-4 lg:sticky lg:top-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Resumen del día</p>
            <p className="text-sm font-semibold text-gray-900 mb-3 capitalize">{fmtHoy}</p>
            {citasHoy.length === 0 ? (
              <p className="text-sm text-gray-400">Sin citas para hoy.</p>
            ) : (
              <div className="space-y-3">
                {citasHoy.map(c => (
                  <div key={c.id} className="flex items-start justify-between gap-2 pb-3 border-b border-gray-100 last:border-0 last:pb-0">
                    <div className="flex items-start gap-2 min-w-0">
                      <Clock size={13} className="text-gray-400 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {new Date(c.fecha_hora).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        <p className="text-xs text-gray-500 truncate">{c.pacientes?.nombre ?? 'Sin paciente'}</p>
                        <p className="text-xs text-gray-400 truncate">{c.tratamientos?.nombre ?? 'Sin tratamiento'}</p>
                      </div>
                    </div>
                    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0', estadoStyle[c.estado])}>{c.estado}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* detail modal */}
      {detalle && (
        <CitaDetalleModal
          cita={detalle}
          onClose={() => setDetalle(null)}
          onEdit={() => {
            setModal({ open: true, cita: detalle })
            setDetalle(null)
          }}
        />
      )}

      {/* edit modal */}
      {modal.open && (
        <CitaModal
          cita={modal.cita}
          pacientes={pacientes}
          doctores={doctores}
          tratamientos={tratamientos}
          onClose={() => setModal({ open: false, cita: null })}
        />
      )}
    </div>
  )
}
