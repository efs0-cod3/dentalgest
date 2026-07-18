import { useState, useMemo, useEffect, useRef } from 'react'
import { Form, useLoaderData, useNavigation, useSubmit, useActionData } from 'react-router'
import type { Route } from './+types/consultas'
import { createSupabaseServerClient } from '~/lib/supabase.server'
import { getClinicaId } from '~/lib/clinica.server'
import {
  Plus, X, Pencil, Trash2, Search, Eye, Download, Stethoscope, Calendar,
} from 'lucide-react'
import { cn, calcularEdad } from '~/lib/utils'
import { ConfirmDeleteModal } from '~/components/ConfirmDeleteModal'

// ─── types ────────────────────────────────────────────────────────────────────

type PacienteRef = { id: string; nombre: string; fecha_nacimiento: string | null; cedula: string | null }
type Consulta = {
  id: string; fecha: string; tipo: string; titulo: string; descripcion: string | null; plan: string | null
  paciente_id: string | null; doctor_id: string | null
  pacientes: PacienteRef | null
  doctores: { nombre: string } | null
}
type Paciente = { id: string; nombre: string; fecha_nacimiento: string | null; cedula: string | null }
type Doctor = { id: string; nombre: string }

const TIPOS = ['diagnostico', 'tratamiento', 'observacion', 'nota'] as const

const tipoStyle: Record<string, string> = {
  diagnostico: 'bg-red-100 text-red-700', tratamiento: 'bg-blue-100 text-blue-700',
  observacion: 'bg-yellow-100 text-yellow-700', nota: 'bg-gray-100 text-gray-600',
}

function initials(n: string) { return n.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('es-DO', { dateStyle: 'medium' }) }
function fmtDateTime(iso: string) { return new Date(iso).toLocaleString('es-DO', { dateStyle: 'medium', timeStyle: 'short' }) }

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Histórico de consultas — Nin Dental Clinic' }]
}

// ─── loader ───────────────────────────────────────────────────────────────────

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request)
  const clinicaId = await getClinicaId(request)

  const [{ data: consultas }, { data: pacientes }, { data: doctores }] = await Promise.all([
    supabase.from('expediente_entradas')
      .select('id,fecha,tipo,titulo,descripcion,plan,paciente_id,doctor_id,pacientes(id,nombre,fecha_nacimiento,cedula),doctores(nombre)')
      .eq('clinica_id', clinicaId)
      .order('fecha', { ascending: false }),
    supabase.from('pacientes').select('id,nombre,fecha_nacimiento,cedula').eq('clinica_id', clinicaId).order('nombre'),
    supabase.from('doctores').select('id,nombre').eq('clinica_id', clinicaId).order('nombre'),
  ])

  return {
    consultas: (consultas ?? []) as unknown as Consulta[],
    pacientes: (pacientes ?? []) as Paciente[],
    doctores: (doctores ?? []) as Doctor[],
  }
}

// ─── action ───────────────────────────────────────────────────────────────────

export async function action({ request }: Route.ActionArgs) {
  const { supabase } = createSupabaseServerClient(request)
  const clinicaId = await getClinicaId(request)
  const fd = await request.formData()
  const intent = fd.get('intent') as string

  if (intent === 'delete') {
    const { error } = await supabase.from('expediente_entradas').delete().eq('id', fd.get('id') as string).eq('clinica_id', clinicaId)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }

  const pacienteId = fd.get('paciente_id') as string
  if (!pacienteId) return { ok: false, error: 'Selecciona un paciente.' }

  const data = {
    clinica_id: clinicaId,
    paciente_id: pacienteId,
    doctor_id: (fd.get('doctor_id') as string) || null,
    fecha: fd.get('fecha') as string,
    tipo: fd.get('tipo') as string,
    titulo: fd.get('titulo') as string,
    descripcion: (fd.get('descripcion') as string) || null,
    plan: (fd.get('plan') as string) || null,
  }

  if (intent === 'create') {
    const { error } = await supabase.from('expediente_entradas').insert(data)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }
  if (intent === 'update') {
    const { error } = await supabase.from('expediente_entradas')
      .update(data).eq('id', fd.get('id') as string).eq('clinica_id', clinicaId)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }

  return { ok: false, error: 'Intent desconocido' }
}

// ─── form modal (crear / editar) ───────────────────────────────────────────────

function ConsultaFormModal({ consulta, pacientes, doctores, onClose }: {
  consulta: Consulta | null; pacientes: Paciente[]; doctores: Doctor[]; onClose: () => void
}) {
  const navigation = useNavigation()
  const actionData = useActionData<typeof action>()
  const isSubmitting = navigation.state === 'submitting'

  // don't use useCloseOnSubmit here — it would close the modal even when the
  // server rejects the consulta (paciente faltante, error de base de datos)
  const wasSubmitting = useRef(false)
  useEffect(() => {
    if (navigation.state === 'submitting') wasSubmitting.current = true
    else if (navigation.state === 'idle' && wasSubmitting.current) {
      wasSubmitting.current = false
      if (actionData?.ok !== false) onClose()
    }
  }, [navigation.state])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-semibold text-gray-900">{consulta ? 'Editar consulta' : 'Nueva consulta'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <Form method="post" className="p-6 space-y-4 overflow-y-auto flex-1">
          <input type="hidden" name="intent" value={consulta ? 'update' : 'create'} />
          {consulta && <input type="hidden" name="id" value={consulta.id} />}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Paciente <span className="text-red-500">*</span></label>
            <select name="paciente_id" required defaultValue={consulta?.paciente_id ?? ''}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— Seleccionar paciente —</option>
              {pacientes.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
              <select name="tipo" defaultValue={consulta?.tipo ?? 'diagnostico'}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                {TIPOS.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fecha</label>
              <input type="datetime-local" name="fecha" required
                defaultValue={consulta ? new Date(consulta.fecha).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Doctor</label>
            <select name="doctor_id" defaultValue={consulta?.doctor_id ?? ''}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— Sin doctor —</option>
              {doctores.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Diagnóstico <span className="text-red-500">*</span></label>
            <input type="text" name="titulo" required defaultValue={consulta?.titulo ?? ''}
              placeholder="Ej. Caries en molar inferior derecho"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Descripción breve</label>
            <textarea name="descripcion" rows={2} defaultValue={consulta?.descripcion ?? ''}
              placeholder="Detalles del hallazgo o de la consulta…"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Plan</label>
            <textarea name="plan" rows={2} defaultValue={consulta?.plan ?? ''}
              placeholder="Plan de tratamiento a seguir…"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancelar</button>
            <button type="submit" disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {isSubmitting ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </Form>
      </div>
    </div>
  )
}

// ─── detalle modal (ver) ────────────────────────────────────────────────────────

function ConsultaDetalleModal({ consulta, onClose, onEdit }: {
  consulta: Consulta; onClose: () => void; onEdit: () => void
}) {
  const paciente = consulta.pacientes
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[90vh]">
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100 flex-shrink-0">
          <div>
            <span className={cn('inline-flex px-2.5 py-1 rounded-full text-xs font-semibold capitalize', tipoStyle[consulta.tipo])}>{consulta.tipo}</span>
            <h2 className="font-semibold text-gray-900 text-lg mt-2 leading-tight">{paciente?.nombre ?? 'Sin paciente'}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {paciente?.fecha_nacimiento ? `${calcularEdad(paciente.fecha_nacimiento)} años` : 'Edad no registrada'}
              {paciente?.cedula ? ` · ${paciente.cedula}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <Calendar size={14} className="text-gray-400" />
            {fmtDateTime(consulta.fecha)}
            {consulta.doctores && <span>· {consulta.doctores.nombre}</span>}
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Diagnóstico</p>
            <p className="text-sm font-medium text-gray-900">{consulta.titulo}</p>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Descripción</p>
            <p className="text-sm text-gray-700 whitespace-pre-line">{consulta.descripcion || 'Sin descripción.'}</p>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Plan</p>
            <p className="text-sm text-gray-700 whitespace-pre-line">{consulta.plan || 'Sin plan registrado.'}</p>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end flex-shrink-0">
          <button onClick={onEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <Pencil size={13} /> Editar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function Consultas() {
  const { consultas, pacientes, doctores } = useLoaderData<typeof loader>()
  const navigation = useNavigation()
  const submit = useSubmit()

  const [query, setQuery] = useState('')
  const [tipoFilter, setTipoFilter] = useState<'todos' | typeof TIPOS[number]>('todos')
  const [pacienteFilter, setPacienteFilter] = useState('')
  const [doctorFilter, setDoctorFilter] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')

  const [formModal, setFormModal] = useState<{ open: boolean; consulta: Consulta | null }>({ open: false, consulta: null })
  const [detalle, setDetalle] = useState<Consulta | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Consulta | null>(null)
  useEffect(() => { if (navigation.state === 'idle') setDeleteTarget(null) }, [navigation.state])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return consultas.filter(c => {
      if (tipoFilter !== 'todos' && c.tipo !== tipoFilter) return false
      if (pacienteFilter && c.paciente_id !== pacienteFilter) return false
      if (doctorFilter && c.doctor_id !== doctorFilter) return false
      if (fechaDesde && new Date(c.fecha) < new Date(fechaDesde)) return false
      if (fechaHasta && new Date(c.fecha) > new Date(`${fechaHasta}T23:59:59`)) return false
      if (q) {
        const haystack = `${c.pacientes?.nombre ?? ''} ${c.titulo} ${c.descripcion ?? ''} ${c.plan ?? ''}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [consultas, query, tipoFilter, pacienteFilter, doctorFilter, fechaDesde, fechaHasta])

  const exportParams = new URLSearchParams()
  if (tipoFilter !== 'todos') exportParams.set('tipo', tipoFilter)
  if (pacienteFilter) exportParams.set('paciente_id', pacienteFilter)
  if (doctorFilter) exportParams.set('doctor_id', doctorFilter)
  if (fechaDesde) exportParams.set('desde', fechaDesde)
  if (fechaHasta) exportParams.set('hasta', fechaHasta)
  if (query.trim()) exportParams.set('q', query.trim())
  const exportHref = `/api/export-consultas${exportParams.toString() ? `?${exportParams.toString()}` : ''}`

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Stethoscope size={22} className="text-blue-600" /> Histórico de consultas
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">Registro de consultas realizadas</p>
        </div>
        <button onClick={() => setFormModal({ open: true, consulta: null })}
          className="flex items-center gap-2 px-3 py-2 md:px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
          <Plus size={16} />
          <span className="hidden sm:inline">Nueva consulta</span>
          <span className="sm:hidden">Nueva</span>
        </button>
      </div>

      {/* filters */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Buscar por paciente, diagnóstico, descripción o plan…" value={query} onChange={e => setQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <a href={exportHref}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex-shrink-0">
            <Download size={14} /> Exportar CSV
          </a>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1 overflow-x-auto max-w-full">
            {(['todos', ...TIPOS] as const).map(t => (
              <button key={t} onClick={() => setTipoFilter(t)}
                className={cn('px-2.5 py-1 text-xs font-medium rounded-md transition-colors capitalize whitespace-nowrap flex-shrink-0',
                  tipoFilter === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
                {t}
              </button>
            ))}
          </div>

          <select value={pacienteFilter} onChange={e => setPacienteFilter(e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Todos los pacientes</option>
            {pacientes.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>

          <select value={doctorFilter} onChange={e => setDoctorFilter(e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Todos los doctores</option>
            {doctores.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
          </select>

          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span>Del</span>
            <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
              className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <span>al</span>
            <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
              className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <span className="text-xs text-gray-500">{filtered.length} {filtered.length === 1 ? 'consulta' : 'consultas'}</span>
        </div>

        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-gray-400">
            <Stethoscope size={32} className="mx-auto mb-2 opacity-30" />
            {consultas.length === 0 ? 'Sin consultas registradas.' : 'Sin resultados para estos filtros.'}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <table className="hidden lg:table w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Fecha', 'Paciente', 'Diagnóstico', 'Descripción', 'Plan', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setDetalle(c)}>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap align-top">{fmtDate(c.fecha)}</td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {c.pacientes ? initials(c.pacientes.nombre) : '—'}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 truncate">{c.pacientes?.nombre ?? 'Sin paciente'}</p>
                          <p className="text-xs text-gray-400">
                            {c.pacientes?.fecha_nacimiento ? `${calcularEdad(c.pacientes.fecha_nacimiento)} años` : 'Edad n/d'}
                            {c.pacientes?.cedula ? ` · ${c.pacientes.cedula}` : ''}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top max-w-[220px]">
                      <span className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize mb-1', tipoStyle[c.tipo])}>{c.tipo}</span>
                      <p className="text-gray-900 truncate">{c.titulo}</p>
                    </td>
                    <td className="px-4 py-3 align-top max-w-[240px]">
                      <p className="text-gray-600 truncate">{c.descripcion || '—'}</p>
                    </td>
                    <td className="px-4 py-3 align-top max-w-[240px]">
                      <p className="text-gray-600 truncate">{c.plan || '—'}</p>
                    </td>
                    <td className="px-4 py-3 align-top" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setDetalle(c)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Ver">
                          <Eye size={14} />
                        </button>
                        <button onClick={() => setFormModal({ open: true, consulta: c })}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Editar">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => setDeleteTarget(c)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Eliminar">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile cards */}
            <div className="lg:hidden divide-y divide-gray-100">
              {filtered.map(c => (
                <div key={c.id} className="px-4 py-3 hover:bg-gray-50 cursor-pointer" onClick={() => setDetalle(c)}>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {c.pacientes ? initials(c.pacientes.nombre) : '—'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{c.pacientes?.nombre ?? 'Sin paciente'}</p>
                        <p className="text-xs text-gray-400">
                          {c.pacientes?.fecha_nacimiento ? `${calcularEdad(c.pacientes.fecha_nacimiento)} años` : 'Edad n/d'}
                          {c.pacientes?.cedula ? ` · ${c.pacientes.cedula}` : ''}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0">{fmtDate(c.fecha)}</span>
                  </div>
                  <span className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize mb-1', tipoStyle[c.tipo])}>{c.tipo}</span>
                  <p className="text-sm text-gray-900 truncate">{c.titulo}</p>
                  <div className="flex items-center gap-2 mt-2" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setFormModal({ open: true, consulta: c })}
                      className="p-1.5 text-gray-300 hover:text-blue-600"><Pencil size={14} /></button>
                    <button onClick={() => setDeleteTarget(c)}
                      className="p-1.5 text-gray-300 hover:text-red-600"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {formModal.open && (
        <ConsultaFormModal consulta={formModal.consulta} pacientes={pacientes} doctores={doctores}
          onClose={() => setFormModal({ open: false, consulta: null })} />
      )}
      {detalle && (
        <ConsultaDetalleModal consulta={detalle} onClose={() => setDetalle(null)}
          onEdit={() => { setFormModal({ open: true, consulta: detalle }); setDetalle(null) }} />
      )}
      {deleteTarget && (
        <ConfirmDeleteModal
          title="Eliminar consulta"
          itemLabel={deleteTarget.titulo}
          description={`${deleteTarget.pacientes?.nombre ?? 'Sin paciente'} · ${fmtDateTime(deleteTarget.fecha)}. Esta acción no se puede deshacer.`}
          isSubmitting={navigation.state === 'submitting'}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => submit({ intent: 'delete', id: deleteTarget.id }, { method: 'post' })}
        />
      )}
    </div>
  )
}
