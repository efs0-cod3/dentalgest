import { useState, useMemo, useEffect } from 'react'
import { Form, Link, useLoaderData, useNavigation, useSubmit, useFetcher, redirect } from 'react-router'
import type { Route } from './+types/pacientes.$id'
import type { action as citasAction } from './citas'
import { createSupabaseServerClient } from '~/lib/supabase.server'
import { getClinicaId } from '~/lib/clinica.server'
import { buildPacienteData } from '~/lib/pacientes.server'
import {
  ChevronLeft, Pencil, Trash2, Plus, Phone, Mail, FileText, Upload,
  AlertCircle, Heart, Clock, Calendar, Save, CheckCircle,
} from 'lucide-react'
import { cn, drLocalToUTC } from '~/lib/utils'
import { useCloseOnSubmit } from '~/lib/hooks'
import { ConfirmDeleteModal } from '~/components/ConfirmDeleteModal'
import { PacienteEditModal } from '~/components/PacienteEditModal'
import { Odontograma } from '~/components/Odontograma'
import type { OdontogramaData } from '~/components/Odontograma'

// ─── types ────────────────────────────────────────────────────────────────────

type CitaPaciente = {
  id: string; fecha_hora: string; duracion_min: number; estado: string; notas: string | null
  doctores: { nombre: string } | null; tratamientos: { nombre: string } | null
}
type ExpedienteEntrada = {
  id: string; fecha: string; tipo: string; titulo: string; descripcion: string | null
  doctores: { nombre: string } | null
}
type Documento = {
  id: string; nombre: string; tipo: string; url: string; storage_path: string; created_at: string
}
type Paciente = {
  id: string; nombre: string; telefono: string | null; email: string | null; created_at: string
  fecha_nacimiento: string | null; cedula: string | null; genero: string | null; direccion: string | null
  tipo_sangre: string | null; alergias: string | null; antecedentes_medicos: string | null
  contacto_emergencia_nombre: string | null; contacto_emergencia_telefono: string | null
  contacto_emergencia_relacion: string | null
  citas: CitaPaciente[]; expediente_entradas: ExpedienteEntrada[]; documentos: Documento[]
}
type Doctor = { id: string; nombre: string }
type Tratamiento = { id: string; nombre: string; duracion_min: number }
type OdontogramaVersion = { id: string; datos: OdontogramaData; notas: string | null; created_at: string }

// ─── helpers ─────────────────────────────────────────────────────────────────

const estadoStyle: Record<string, string> = {
  pendiente: 'bg-yellow-100 text-yellow-700', confirmada: 'bg-blue-100 text-blue-700',
  completada: 'bg-green-100 text-green-700', cancelada: 'bg-gray-100 text-gray-500',
}
const tipoEntradaStyle: Record<string, string> = {
  diagnostico: 'bg-red-100 text-red-700', tratamiento: 'bg-blue-100 text-blue-700',
  observacion: 'bg-yellow-100 text-yellow-700', nota: 'bg-gray-100 text-gray-600',
}

function initials(n: string) { return n.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('es-MX', { dateStyle: 'medium' }) }
function fmtDateShort(iso: string) { return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) }
function fmtDateTime(iso: string) { return new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) }

function calcularEdad(fechaNacimientoISO: string) {
  const hoy = new Date()
  const nac = new Date(fechaNacimientoISO)
  let edad = hoy.getFullYear() - nac.getFullYear()
  const aunNoCumple = hoy.getMonth() < nac.getMonth() || (hoy.getMonth() === nac.getMonth() && hoy.getDate() < nac.getDate())
  if (aunNoCumple) edad--
  return edad
}

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data?.paciente?.nombre ?? 'Paciente'} — Nin Dental Clinic` }]
}

// ─── loader ───────────────────────────────────────────────────────────────────

export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request)
  const clinicaId = await getClinicaId(request)
  const pacienteId = params.id as string

  const [{ data }, { data: doctores }, { data: tratamientos }, { data: odontogramas }] = await Promise.all([
    supabase.from('pacientes').select(`
      id, nombre, telefono, email, created_at,
      fecha_nacimiento, cedula, genero, direccion,
      tipo_sangre, alergias, antecedentes_medicos,
      contacto_emergencia_nombre, contacto_emergencia_telefono, contacto_emergencia_relacion,
      citas(id, fecha_hora, duracion_min, estado, notas, doctores(nombre), tratamientos(nombre)),
      expediente_entradas(id, fecha, tipo, titulo, descripcion, doctores(nombre)),
      documentos(id, nombre, tipo, url, storage_path, created_at)
    `).eq('id', pacienteId).eq('clinica_id', clinicaId).single(),
    supabase.from('doctores').select('id,nombre').eq('clinica_id', clinicaId).order('nombre'),
    supabase.from('tratamientos').select('id,nombre,duracion_min').eq('clinica_id', clinicaId).order('nombre'),
    supabase.from('odontogramas').select('id, datos, notas, created_at')
      .eq('paciente_id', pacienteId).eq('clinica_id', clinicaId).order('created_at', { ascending: false }),
  ])

  if (!data) throw redirect('/dashboard/pacientes')

  const paciente: Paciente = {
    ...(data as any),
    citas: ((data as any).citas ?? []).sort((a: CitaPaciente, b: CitaPaciente) =>
      new Date(b.fecha_hora).getTime() - new Date(a.fecha_hora).getTime()),
    expediente_entradas: ((data as any).expediente_entradas ?? []).sort((a: ExpedienteEntrada, b: ExpedienteEntrada) =>
      new Date(b.fecha).getTime() - new Date(a.fecha).getTime()),
    documentos: ((data as any).documentos ?? []).sort((a: Documento, b: Documento) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
  }

  return {
    paciente, doctores: (doctores ?? []) as Doctor[], tratamientos: (tratamientos ?? []) as Tratamiento[],
    odontogramas: (odontogramas ?? []) as OdontogramaVersion[],
  }
}

// ─── action ───────────────────────────────────────────────────────────────────

export async function action({ request, params }: Route.ActionArgs) {
  const { supabase } = createSupabaseServerClient(request)
  const clinicaId = await getClinicaId(request)
  const pacienteId = params.id as string
  const fd = await request.formData()
  const intent = fd.get('intent') as string

  if (intent === 'delete') {
    await supabase.from('pacientes').delete().eq('id', pacienteId).eq('clinica_id', clinicaId)
    return redirect('/dashboard/pacientes')
  }

  if (intent === 'update') {
    await supabase.from('pacientes').update(buildPacienteData(fd, clinicaId)).eq('id', pacienteId).eq('clinica_id', clinicaId)
    return { ok: true }
  }

  if (intent === 'delete-entrada') {
    await supabase.from('expediente_entradas').delete().eq('id', fd.get('id') as string)
    return { ok: true }
  }

  if (intent === 'create-entrada') {
    await supabase.from('expediente_entradas').insert({
      clinica_id: clinicaId,
      paciente_id: pacienteId,
      doctor_id: (fd.get('doctor_id') as string) || null,
      fecha: fd.get('fecha') as string,
      tipo: fd.get('tipo') as string,
      titulo: fd.get('titulo') as string,
      descripcion: (fd.get('descripcion') as string) || null,
    })
    return { ok: true }
  }

  if (intent === 'upload-documento') {
    const archivo = fd.get('archivo') as File
    if (archivo && archivo.size > 0) {
      const ext = archivo.name.split('.').pop()
      const path = `${clinicaId}/${pacienteId}/${Date.now()}.${ext}`
      const bytes = await archivo.arrayBuffer()
      const { error } = await supabase.storage.from('documentos').upload(path, bytes, { contentType: archivo.type })
      if (!error) {
        const { data: { publicUrl } } = supabase.storage.from('documentos').getPublicUrl(path)
        await supabase.from('documentos').insert({
          clinica_id: clinicaId, paciente_id: pacienteId,
          nombre: (fd.get('nombre') as string) || archivo.name,
          tipo: fd.get('tipo') as string,
          url: publicUrl, storage_path: path,
        })
      }
    }
    return { ok: true }
  }

  if (intent === 'create-odontograma') {
    const datos = JSON.parse(fd.get('datos') as string)
    const notas = (fd.get('notas') as string) || null
    const { error } = await supabase.from('odontogramas').insert({
      clinica_id: clinicaId, paciente_id: pacienteId, datos, notas,
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }

  if (intent === 'delete-odontograma') {
    await supabase.from('odontogramas').delete().eq('id', fd.get('id') as string).eq('clinica_id', clinicaId)
    return { ok: true }
  }

  if (intent === 'delete-documento') {
    const path = fd.get('storage_path') as string
    await supabase.storage.from('documentos').remove([path])
    await supabase.from('documentos').delete().eq('id', fd.get('id') as string)
    return { ok: true }
  }

  return { ok: false }
}

// ─── quick cita card ────────────────────────────────────────────────────────

function QuickCitaCard({ pacienteId, doctores, tratamientos }: {
  pacienteId: string; doctores: Doctor[]; tratamientos: Tratamiento[]
}) {
  const fetcher = useFetcher<typeof citasAction>()
  const [open, setOpen] = useState(false)
  const [fechaDate, setFechaDate] = useState('')
  const [fechaTime, setFechaTime] = useState('')
  const fechaLocal = fechaDate && fechaTime ? `${fechaDate}T${fechaTime}` : ''
  const isSubmitting = fetcher.state !== 'idle'

  // fetcher.Form targets a different route's action, so we track success locally
  // instead of useCloseOnSubmit (which watches global navigation state and would
  // also fire for unrelated submissions elsewhere on this page)
  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.ok) {
      setOpen(false)
      setFechaDate('')
      setFechaTime('')
    }
  }, [fetcher.state, fetcher.data])

  return (
    <div className="relative bg-amber-50 border border-dashed border-amber-300 rounded-2xl p-4">
      <span className="absolute -top-2.5 right-4 bg-amber-500 text-white text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full">
        Rápido
      </span>
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <Calendar size={14} className="text-amber-500" /> Agendar cita rápida
        </span>
        <span className={cn(
          'w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-xs font-bold transition-transform flex-shrink-0',
          open && 'rotate-45'
        )}>+</span>
      </button>

      {open && (
        <fetcher.Form method="post" action="/dashboard/citas" className="mt-3 space-y-2">
          <input type="hidden" name="intent" value="create" />
          <input type="hidden" name="paciente_id" value={pacienteId} />
          <input type="hidden" name="estado" value="pendiente" />
          <input type="hidden" name="fecha_hora" value={fechaLocal ? drLocalToUTC(fechaLocal) : ''} />
          <div className="grid grid-cols-2 gap-2">
            <input type="date" required value={fechaDate} onChange={e => setFechaDate(e.target.value)}
              className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input type="time" required value={fechaTime} onChange={e => setFechaTime(e.target.value)}
              className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <select name="tratamiento_id" defaultValue=""
            className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">— Sin tratamiento —</option>
            {tratamientos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
          <select name="doctor_id" defaultValue=""
            className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">— Sin doctor —</option>
            {doctores.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
          </select>
          <button type="submit" disabled={isSubmitting}
            className="w-full py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {isSubmitting ? 'Agendando…' : 'Agendar'}
          </button>
        </fetcher.Form>
      )}
    </div>
  )
}

// ─── odontograma tab ────────────────────────────────────────────────────────

function TabOdontograma({ odontogramas }: { odontogramas: OdontogramaVersion[] }) {
  const fetcher = useFetcher<typeof action>()
  const navigation = useNavigation()
  const submit = useSubmit()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const latest = odontogramas[0] ?? null
  const [viewingId, setViewingId] = useState<string | null>(null)
  const viewing = viewingId ? odontogramas.find(o => o.id === viewingId) ?? null : null
  const isHistorical = viewing !== null
  const activeVersion = isHistorical ? viewing : latest

  const [data, setData] = useState<OdontogramaData>(latest?.datos ?? {})
  const [notas, setNotas] = useState(latest?.notas ?? '')
  const isSubmitting = fetcher.state !== 'idle'
  const isDeleting = navigation.state === 'submitting'
  const saved = fetcher.state === 'idle' && fetcher.data?.ok === true

  // after saving, the loader revalidates and `latest` becomes the just-saved row;
  // keep the editable buffer in sync so it doesn't show stale pre-save data
  useEffect(() => {
    if (!isHistorical) { setData(latest?.datos ?? {}); setNotas(latest?.notas ?? '') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest?.id])

  useEffect(() => { if (navigation.state === 'idle') setConfirmDelete(false) }, [navigation.state])

  function handleSave() {
    fetcher.submit({ intent: 'create-odontograma', datos: JSON.stringify(data), notas }, { method: 'post' })
  }

  function handleDelete() {
    if (!activeVersion) return
    submit({ intent: 'delete-odontograma', id: activeVersion.id }, { method: 'post' })
    setViewingId(null)
  }

  const displayData = isHistorical ? viewing!.datos : data
  const displayNotas = isHistorical ? (viewing!.notas ?? '') : notas

  return (
    <div className="space-y-4">
      {odontogramas.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button onClick={() => setViewingId(null)}
            className={cn('px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors',
              !isHistorical ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50')}>
            Actual{latest ? ` · ${fmtDateShort(latest.created_at)}` : ''}
          </button>
          {odontogramas.slice(1).map(o => (
            <button key={o.id} onClick={() => setViewingId(o.id)}
              className={cn('px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors',
                viewingId === o.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50')}>
              {fmtDateShort(o.created_at)}
            </button>
          ))}
        </div>
      )}

      {isHistorical && (
        <div className="flex items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700">
          <span>Viendo una versión anterior ({fmtDateTime(viewing!.created_at)}), de solo lectura.</span>
          <div className="flex items-center gap-3 flex-shrink-0">
            <button onClick={() => setConfirmDelete(true)} className="font-semibold underline text-red-600">Eliminar versión</button>
            <button onClick={() => setViewingId(null)} className="font-semibold underline">Volver a la actual</button>
          </div>
        </div>
      )}

      <Odontograma value={displayData} onChange={isHistorical ? undefined : setData} readOnly={isHistorical} />

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Observaciones</label>
        <textarea
          value={displayNotas}
          onChange={e => !isHistorical && setNotas(e.target.value)}
          readOnly={isHistorical}
          rows={3}
          placeholder="Notas adicionales sobre el estado bucal del paciente…"
          className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {!isHistorical && (
        <div className="flex items-center gap-3">
          <button onClick={handleSave} disabled={isSubmitting}
            className={cn('flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all',
              isSubmitting ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm hover:shadow')}>
            <Save size={14} /> {isSubmitting ? 'Guardando…' : 'Guardar nueva versión'}
          </button>
          {latest && (
            <button onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
              <Trash2 size={13} /> Eliminar versión
            </button>
          )}
          {saved && (
            <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
              <CheckCircle size={13} /> Guardado
            </span>
          )}
        </div>
      )}

      {confirmDelete && activeVersion && (
        <ConfirmDeleteModal
          title="Eliminar versión del odontograma"
          itemLabel={fmtDateTime(activeVersion.created_at)}
          description="Esta versión se eliminará permanentemente y no aparecerá más en el historial. Esta acción no se puede deshacer."
          isSubmitting={isDeleting}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  )
}

// ─── expediente tab ───────────────────────────────────────────────────────────

function TabClinico({ paciente, doctores }: { paciente: Paciente; doctores: Doctor[] }) {
  const [showForm, setShowForm] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ExpedienteEntrada | null>(null)
  const navigation = useNavigation()
  const submit = useSubmit()
  const isSubmitting = navigation.state === 'submitting'
  useCloseOnSubmit(() => setShowForm(false))
  useEffect(() => { if (navigation.state === 'idle') setDeleteTarget(null) }, [navigation.state])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Entradas clínicas</p>
        <button onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
          <Plus size={13} /> Agregar
        </button>
      </div>

      {showForm && (
        <Form method="post" className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-200">
          <input type="hidden" name="intent" value="create-entrada" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
              <select name="tipo" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                {['diagnostico', 'tratamiento', 'observacion', 'nota'].map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Doctor</label>
              <select name="doctor_id" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— Sin doctor —</option>
                {doctores.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Fecha</label>
            <input type="datetime-local" name="fecha" defaultValue={new Date().toISOString().slice(0, 16)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Título <span className="text-red-500">*</span></label>
            <input type="text" name="titulo" required placeholder="Ej. Caries en molar inferior derecho"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Descripción</label>
            <textarea name="descripcion" rows={2} placeholder="Detalles adicionales…"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">Cancelar</button>
            <button type="submit" disabled={isSubmitting} className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {isSubmitting ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </Form>
      )}

      {paciente.expediente_entradas.length === 0 && !showForm && (
        <p className="text-sm text-gray-400 text-center py-8">Sin entradas clínicas registradas.</p>
      )}
      <div className="space-y-2">
        {paciente.expediente_entradas.map(e => (
          <div key={e.id} className="flex items-start gap-3 p-3 rounded-xl border border-gray-100">
            <div className="flex-shrink-0 mt-0.5">
              <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium capitalize', tipoEntradaStyle[e.tipo])}>{e.tipo}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">{e.titulo}</p>
              {e.descripcion && <p className="text-xs text-gray-500 mt-0.5">{e.descripcion}</p>}
              <p className="text-xs text-gray-400 mt-1">
                {fmtDateTime(e.fecha)}{e.doctores ? ` · ${e.doctores.nombre}` : ''}
              </p>
            </div>
            <button type="button" onClick={() => setDeleteTarget(e)}
              className="p-1 text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
          </div>
        ))}
      </div>

      {deleteTarget && (
        <ConfirmDeleteModal
          title="Eliminar entrada clínica"
          itemLabel={deleteTarget.titulo}
          description={`${deleteTarget.tipo.charAt(0).toUpperCase() + deleteTarget.tipo.slice(1)} · ${fmtDateTime(deleteTarget.fecha)}${deleteTarget.doctores ? ` · ${deleteTarget.doctores.nombre}` : ''}. Esta acción no se puede deshacer.`}
          isSubmitting={isSubmitting}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => submit({ intent: 'delete-entrada', id: deleteTarget.id }, { method: 'post' })}
        />
      )}
    </div>
  )
}

// ─── documentos tab ───────────────────────────────────────────────────────────

function TabDocumentos({ paciente }: { paciente: Paciente }) {
  const [deleteTarget, setDeleteTarget] = useState<Documento | null>(null)
  const navigation = useNavigation()
  const submit = useSubmit()
  const isUploading = navigation.state === 'submitting'
  useEffect(() => { if (navigation.state === 'idle') setDeleteTarget(null) }, [navigation.state])

  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Archivos y documentos</p>

      <Form method="post" encType="multipart/form-data" className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-3">
        <input type="hidden" name="intent" value="upload-documento" />
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Archivo</label>
            <input type="file" name="archivo" accept="image/*,.pdf,.doc,.docx"
              className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
            <select name="tipo" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              {['radiografia', 'fotografia', 'documento', 'otro'].map(t => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Nombre descriptivo</label>
          <input type="text" name="nombre" placeholder="Ej. Radiografía panorámica junio 2026"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex justify-end">
          <button type="submit" disabled={isUploading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
            <Upload size={13} /> {isUploading ? 'Subiendo…' : 'Subir archivo'}
          </button>
        </div>
      </Form>

      {paciente.documentos.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">Sin archivos adjuntos.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {paciente.documentos.map(d => {
            const isImage = d.tipo === 'radiografia' || d.tipo === 'fotografia'
            return (
              <div key={d.id} className="rounded-xl border border-gray-200 overflow-hidden">
                {isImage ? (
                  <a href={d.url} target="_blank" rel="noreferrer">
                    <img src={d.url} alt={d.nombre} className="w-full h-28 object-cover hover:opacity-90 transition-opacity" />
                  </a>
                ) : (
                  <a href={d.url} target="_blank" rel="noreferrer"
                    className="flex items-center justify-center h-28 bg-gray-50 hover:bg-gray-100 transition-colors">
                    <FileText size={32} className="text-gray-300" />
                  </a>
                )}
                <div className="px-3 py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-900 truncate">{d.nombre}</p>
                    <p className="text-xs text-gray-400">{fmtDate(d.created_at)}</p>
                  </div>
                  <button type="button" onClick={() => setDeleteTarget(d)}
                    className="p-1 text-gray-300 hover:text-red-500 flex-shrink-0 transition-colors"><Trash2 size={13} /></button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {deleteTarget && (
        <ConfirmDeleteModal
          title="Eliminar archivo"
          itemLabel={deleteTarget.nombre}
          description={`Subido el ${fmtDate(deleteTarget.created_at)}. Se eliminará también del almacenamiento y no se puede deshacer.`}
          isSubmitting={navigation.state === 'submitting'}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => submit({
            intent: 'delete-documento', id: deleteTarget.id, storage_path: deleteTarget.storage_path,
          }, { method: 'post' })}
        />
      )}
    </div>
  )
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function PacienteDetalle() {
  const { paciente, doctores, tratamientos, odontogramas } = useLoaderData<typeof loader>()
  const navigation = useNavigation()
  const submit = useSubmit()
  const [tab, setTab] = useState<'datos' | 'clinico' | 'citas' | 'documentos' | 'odontograma'>('datos')
  const [editModal, setEditModal] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isDeleting = navigation.state === 'submitting'
  useEffect(() => { if (navigation.state === 'idle') setConfirmDelete(false) }, [navigation.state])

  const TABS = [
    { id: 'datos', label: 'Datos' },
    { id: 'clinico', label: `Clínico${paciente.expediente_entradas.length ? ` (${paciente.expediente_entradas.length})` : ''}` },
    { id: 'citas', label: `Citas${paciente.citas.length ? ` (${paciente.citas.length})` : ''}` },
    { id: 'documentos', label: `Documentos${paciente.documentos.length ? ` (${paciente.documentos.length})` : ''}` },
    { id: 'odontograma', label: `Odontograma${odontogramas.length ? ` (${odontogramas.length})` : ''}` },
  ] as const

  const proximasCitas = useMemo(() =>
    paciente.citas
      .filter(c => c.estado !== 'cancelada' && c.estado !== 'completada' && new Date(c.fecha_hora) >= new Date())
      .sort((a, b) => new Date(a.fecha_hora).getTime() - new Date(b.fecha_hora).getTime())
      .slice(0, 4),
    [paciente.citas]
  )

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <Link to="/dashboard/pacientes" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 mb-4">
        <ChevronLeft size={15} /> Pacientes
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xl flex-shrink-0">
            {initials(paciente.nombre)}
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 leading-tight">{paciente.nombre}</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {paciente.fecha_nacimiento ? `${calcularEdad(paciente.fecha_nacimiento)} años` : 'Edad no registrada'}
              {paciente.tipo_sangre ? ` · ${paciente.tipo_sangre}` : ''}
              {paciente.telefono ? ` · ${paciente.telefono}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => setEditModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <Pencil size={13} /> Editar
          </button>
          <button onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
            <Trash2 size={13} /> Eliminar
          </button>
        </div>
      </div>

      <div className="flex gap-1 border-b border-gray-200 mb-5 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn('px-4 py-3 text-xs font-medium border-b-2 whitespace-nowrap transition-colors',
              tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700')}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">

          {tab === 'datos' && (
            <div className="space-y-5">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Contacto</p>
                <div className="space-y-1.5">
                  {paciente.telefono && <div className="flex items-center gap-2 text-sm text-gray-700"><Phone size={14} className="text-gray-400" />{paciente.telefono}</div>}
                  {paciente.email && <div className="flex items-center gap-2 text-sm text-gray-700"><Mail size={14} className="text-gray-400" />{paciente.email}</div>}
                  {paciente.direccion && <div className="flex items-center gap-2 text-sm text-gray-700"><FileText size={14} className="text-gray-400" />{paciente.direccion}</div>}
                  {!paciente.telefono && !paciente.email && <p className="text-sm text-gray-400">Sin datos de contacto.</p>}
                </div>
              </div>

              {(paciente.cedula || paciente.genero) && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Identificación</p>
                  <div className="grid grid-cols-2 gap-2">
                    {paciente.cedula && <div><p className="text-xs text-gray-400">Cédula</p><p className="text-sm font-medium text-gray-900">{paciente.cedula}</p></div>}
                    {paciente.genero && <div><p className="text-xs text-gray-400">Género</p><p className="text-sm font-medium text-gray-900">{paciente.genero}</p></div>}
                  </div>
                </div>
              )}

              {paciente.contacto_emergencia_nombre && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Contacto de emergencia</p>
                  <div className="flex items-center gap-3 p-3 bg-orange-50 rounded-xl border border-orange-100">
                    <AlertCircle size={15} className="text-orange-400 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{paciente.contacto_emergencia_nombre}</p>
                      <p className="text-xs text-gray-500">
                        {paciente.contacto_emergencia_relacion}
                        {paciente.contacto_emergencia_telefono ? ` · ${paciente.contacto_emergencia_telefono}` : ''}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Historial médico</p>
                <div className="space-y-2">
                  {paciente.tipo_sangre && (
                    <div className="flex items-center gap-2">
                      <Heart size={14} className="text-red-400" />
                      <span className="text-xs text-gray-400">Tipo de sangre:</span>
                      <span className="text-sm font-semibold text-red-600">{paciente.tipo_sangre}</span>
                    </div>
                  )}
                  {paciente.alergias && (
                    <div className="p-3 bg-red-50 rounded-xl border border-red-100">
                      <p className="text-xs font-medium text-red-600 mb-0.5">Alergias</p>
                      <p className="text-sm text-gray-800">{paciente.alergias}</p>
                    </div>
                  )}
                  {paciente.antecedentes_medicos && (
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                      <p className="text-xs font-medium text-gray-500 mb-0.5">Antecedentes médicos</p>
                      <p className="text-sm text-gray-800 whitespace-pre-line">{paciente.antecedentes_medicos}</p>
                    </div>
                  )}
                  {!paciente.tipo_sangre && !paciente.alergias && !paciente.antecedentes_medicos && (
                    <p className="text-sm text-gray-400">Sin antecedentes médicos registrados.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === 'clinico' && <TabClinico paciente={paciente} doctores={doctores} />}

          {tab === 'citas' && (
            <div className="space-y-2">
              {paciente.citas.length === 0
                ? <p className="text-sm text-gray-400 text-center py-8">Sin citas registradas.</p>
                : paciente.citas.map(c => (
                  <div key={c.id} className="flex items-start gap-3 p-3 rounded-xl border border-gray-100">
                    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 mt-0.5', estadoStyle[c.estado])}>{c.estado}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{fmtDateTime(c.fecha_hora)}</p>
                      <p className="text-xs text-gray-500">
                        {c.tratamientos?.nombre ?? 'Sin tratamiento'}
                        {c.doctores ? ` · ${c.doctores.nombre}` : ''}
                        <span className="ml-2 text-gray-400 flex items-center gap-0.5 inline-flex"><Clock size={10} /> {c.duracion_min}m</span>
                      </p>
                      {c.notas && <p className="text-xs text-gray-400 mt-0.5 italic">"{c.notas}"</p>}
                    </div>
                  </div>
                ))
              }
            </div>
          )}

          {tab === 'documentos' && <TabDocumentos paciente={paciente} />}

          {tab === 'odontograma' && <TabOdontograma odontogramas={odontogramas} />}
        </div>

        <div className="space-y-4">
          <QuickCitaCard pacienteId={paciente.id} doctores={doctores} tratamientos={tratamientos} />

          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Próximas citas</p>
            {proximasCitas.length === 0 ? (
              <p className="text-sm text-gray-400">Sin citas próximas.</p>
            ) : (
              <div className="space-y-3">
                {proximasCitas.map(c => (
                  <div key={c.id} className="flex items-start gap-2">
                    <span className={cn('mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0',
                      c.estado === 'confirmada' ? 'bg-blue-500' : 'bg-yellow-500')} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{fmtDateTime(c.fecha_hora)}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {c.tratamientos?.nombre ?? 'Sin tratamiento'}{c.doctores ? ` · ${c.doctores.nombre}` : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {editModal && <PacienteEditModal paciente={paciente} onClose={() => setEditModal(false)} />}

      {confirmDelete && (
        <ConfirmDeleteModal
          title="Eliminar paciente"
          itemLabel={paciente.nombre}
          description={`Se eliminarán también sus ${paciente.citas.length} cita(s), ${paciente.expediente_entradas.length} entrada(s) clínica(s) y ${paciente.documentos.length} documento(s). Esta acción no se puede deshacer.`}
          isSubmitting={isDeleting}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => submit({ intent: 'delete' }, { method: 'post' })}
        />
      )}
    </div>
  )
}
