import { useState, useMemo, useEffect } from 'react'
import { Form, useLoaderData, useNavigation, useSubmit, Link } from 'react-router'
import type { Route } from './+types/pacientes'
import { createSupabaseServerClient } from '~/lib/supabase.server'
import { getClinicaId } from '~/lib/clinica.server'
import {
  Plus, X, Pencil, Trash2, Search, User, Phone, Mail, Clock,
  FileText, Upload, Image, File, AlertCircle, Heart, Stethoscope, Grid3x3,
} from 'lucide-react'
import { cn } from '~/lib/utils'
import { useCloseOnSubmit } from '~/lib/hooks'
import { ConfirmDeleteModal } from '~/components/ConfirmDeleteModal'

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

// ─── helpers ─────────────────────────────────────────────────────────────────

const estadoStyle: Record<string, string> = {
  pendiente: 'bg-yellow-100 text-yellow-700', confirmada: 'bg-blue-100 text-blue-700',
  completada: 'bg-green-100 text-green-700', cancelada: 'bg-gray-100 text-gray-500',
}
const tipoEntradaStyle: Record<string, string> = {
  diagnostico: 'bg-red-100 text-red-700', tratamiento: 'bg-blue-100 text-blue-700',
  observacion: 'bg-yellow-100 text-yellow-700', nota: 'bg-gray-100 text-gray-600',
}
const tipoDocIcon: Record<string, typeof File> = {
  radiografia: Image, fotografia: Image, documento: File, otro: File,
}

function initials(n: string) { return n.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('es-MX', { dateStyle: 'medium' }) }
function fmtDateTime(iso: string) { return new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) }

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Pacientes — Nin Dental Clinic' }]
}

// ─── loader ───────────────────────────────────────────────────────────────────

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request)
  const clinicaId = await getClinicaId(request)
  const [{ data }, { data: doctores }] = await Promise.all([
    supabase.from('pacientes').select(`
      id, nombre, telefono, email, created_at,
      fecha_nacimiento, cedula, genero, direccion,
      tipo_sangre, alergias, antecedentes_medicos,
      contacto_emergencia_nombre, contacto_emergencia_telefono, contacto_emergencia_relacion,
      citas(id, fecha_hora, duracion_min, estado, notas, doctores(nombre), tratamientos(nombre)),
      expediente_entradas(id, fecha, tipo, titulo, descripcion, doctores(nombre)),
      documentos(id, nombre, tipo, url, storage_path, created_at)
    `).eq('clinica_id', clinicaId).order('nombre'),
    supabase.from('doctores').select('id,nombre').eq('clinica_id', clinicaId).order('nombre'),
  ])
  const pacientes: Paciente[] = (data ?? []).map((p: any) => ({
    ...p,
    citas: (p.citas ?? []).sort((a: CitaPaciente, b: CitaPaciente) =>
      new Date(b.fecha_hora).getTime() - new Date(a.fecha_hora).getTime()),
    expediente_entradas: (p.expediente_entradas ?? []).sort((a: ExpedienteEntrada, b: ExpedienteEntrada) =>
      new Date(b.fecha).getTime() - new Date(a.fecha).getTime()),
    documentos: (p.documentos ?? []).sort((a: Documento, b: Documento) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
  }))
  return { pacientes, doctores: (doctores ?? []) as Doctor[] }
}

// ─── action ───────────────────────────────────────────────────────────────────

export async function action({ request }: Route.ActionArgs) {
  const { supabase } = createSupabaseServerClient(request)
  const clinicaId = await getClinicaId(request)
  const fd = await request.formData()
  const intent = fd.get('intent') as string

  if (intent === 'delete') {
    await supabase.from('pacientes').delete().eq('id', fd.get('id') as string).eq('clinica_id', clinicaId)
    return { ok: true }
  }

  if (intent === 'create-entrada' || intent === 'delete-entrada') {
    if (intent === 'delete-entrada') {
      await supabase.from('expediente_entradas').delete().eq('id', fd.get('id') as string)
      return { ok: true }
    }
    await supabase.from('expediente_entradas').insert({
      clinica_id: clinicaId,
      paciente_id: fd.get('paciente_id') as string,
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
    const pacienteId = fd.get('paciente_id') as string
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

  if (intent === 'delete-documento') {
    const path = fd.get('storage_path') as string
    await supabase.storage.from('documentos').remove([path])
    await supabase.from('documentos').delete().eq('id', fd.get('id') as string)
    return { ok: true }
  }

  // create / update paciente
  const pacienteData = {
    clinica_id: clinicaId,
    nombre: fd.get('nombre') as string,
    telefono: (fd.get('telefono') as string) || null,
    email: (fd.get('email') as string) || null,
    fecha_nacimiento: (fd.get('fecha_nacimiento') as string) || null,
    cedula: (fd.get('cedula') as string) || null,
    genero: (fd.get('genero') as string) || null,
    direccion: (fd.get('direccion') as string) || null,
    tipo_sangre: (fd.get('tipo_sangre') as string) || null,
    alergias: (fd.get('alergias') as string) || null,
    antecedentes_medicos: (fd.get('antecedentes_medicos') as string) || null,
    contacto_emergencia_nombre: (fd.get('contacto_emergencia_nombre') as string) || null,
    contacto_emergencia_telefono: (fd.get('contacto_emergencia_telefono') as string) || null,
    contacto_emergencia_relacion: (fd.get('contacto_emergencia_relacion') as string) || null,
  }
  if (intent === 'create') await supabase.from('pacientes').insert(pacienteData)
  else if (intent === 'update')
    await supabase.from('pacientes').update(pacienteData).eq('id', fd.get('id') as string).eq('clinica_id', clinicaId)
  return { ok: true }
}

// ─── edit modal ───────────────────────────────────────────────────────────────

function PacienteEditModal({ paciente, onClose }: { paciente: Paciente | null; onClose: () => void }) {
  const navigation = useNavigation()
  const isSubmitting = navigation.state === 'submitting'
  useCloseOnSubmit(onClose)

  const field = (label: string, name: string, type = 'text', props: any = {}) => (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input type={type} name={name} defaultValue={(paciente as any)?.[name] ?? ''} {...props}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-semibold text-gray-900">{paciente ? 'Editar paciente' : 'Nuevo paciente'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <Form method="post" className="overflow-y-auto flex-1 p-4 sm:p-6 space-y-6">
          <input type="hidden" name="intent" value={paciente ? 'update' : 'create'} />
          {paciente && <input type="hidden" name="id" value={paciente.id} />}

          <section>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Datos personales</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="col-span-1 sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Nombre completo <span className="text-red-500">*</span></label>
                <input type="text" name="nombre" required defaultValue={paciente?.nombre ?? ''} placeholder="Nombre completo"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              {field('Fecha de nacimiento', 'fecha_nacimiento', 'date')}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Género</label>
                <select name="genero" defaultValue={paciente?.genero ?? ''}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Seleccionar —</option>
                  {['Masculino', 'Femenino', 'Otro', 'Prefiero no decir'].map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              {field('Cedula / Identificación', 'cedula')}
              <div className="col-span-1 sm:col-span-2">{field('Dirección', 'direccion')}</div>
            </div>
          </section>

          <section>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Contacto</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {field('Teléfono', 'telefono', 'tel', { placeholder: '555-0000' })}
              {field('Correo electrónico', 'email', 'email', { placeholder: 'correo@ejemplo.com' })}
            </div>
          </section>

          <section>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Contacto de emergencia</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {field('Nombre', 'contacto_emergencia_nombre')}
              {field('Teléfono', 'contacto_emergencia_telefono', 'tel')}
              {field('Relación', 'contacto_emergencia_relacion', 'text', { placeholder: 'Ej. Madre, Esposo' })}
            </div>
          </section>

          <section>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Historial médico</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de sangre</label>
                <select name="tipo_sangre" defaultValue={paciente?.tipo_sangre ?? ''}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Desconocido —</option>
                  {['A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Alergias</label>
                <input type="text" name="alergias" defaultValue={paciente?.alergias ?? ''} placeholder="Ej. Penicilina, látex"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="col-span-1 sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Antecedentes médicos</label>
                <textarea name="antecedentes_medicos" rows={3} defaultValue={paciente?.antecedentes_medicos ?? ''}
                  placeholder="Enfermedades crónicas, cirugías previas, medicamentos actuales…"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
            </div>
          </section>

          <div className="flex justify-end gap-2 pt-2 flex-shrink-0">
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
          <input type="hidden" name="paciente_id" value={paciente.id} />
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
        <input type="hidden" name="paciente_id" value={paciente.id} />
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
        <div className="grid grid-cols-2 gap-3">
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

// ─── detail modal ─────────────────────────────────────────────────────────────

function PacienteDetalleModal({ paciente, doctores, onClose, onEdit }: {
  paciente: Paciente; doctores: Doctor[]; onClose: () => void; onEdit: () => void
}) {
  const [tab, setTab] = useState<'datos' | 'clinico' | 'citas' | 'documentos'>('datos')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const navigation = useNavigation()
  const submit = useSubmit()
  const isDeleting = navigation.state === 'submitting'
  useEffect(() => { if (navigation.state === 'idle') setConfirmDelete(false) }, [navigation.state])
  const TABS = [
    { id: 'datos', label: 'Datos' },
    { id: 'clinico', label: `Clínico${paciente.expediente_entradas.length ? ` (${paciente.expediente_entradas.length})` : ''}` },
    { id: 'citas', label: `Citas${paciente.citas.length ? ` (${paciente.citas.length})` : ''}` },
    { id: 'documentos', label: `Documentos${paciente.documentos.length ? ` (${paciente.documentos.length})` : ''}` },
  ] as const

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[90vh]">

        {/* header */}
        <div className="flex items-start justify-between px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-lg flex-shrink-0">
              {initials(paciente.nombre)}
            </div>
            <div>
              <h2 className="font-semibold text-gray-900 text-lg leading-tight">{paciente.nombre}</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {paciente.fecha_nacimiento ? `Nac. ${fmtDate(paciente.fecha_nacimiento)}` : 'Sin fecha de nacimiento'}
                {paciente.tipo_sangre ? ` · ${paciente.tipo_sangre}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to={`/dashboard/odontograma/${paciente.id}`}
              onClick={onClose}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
            >
              <Grid3x3 size={13} /> Odontograma
            </Link>
            <button onClick={onEdit} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              <Pencil size={13} /> Editar
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
        </div>

        {/* tabs */}
        <div className="flex border-b border-gray-100 flex-shrink-0 px-6">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id as any)}
              className={cn('px-4 py-3 text-xs font-medium border-b-2 transition-colors',
                tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700')}>
              {t.label}
            </button>
          ))}
        </div>

        {/* body */}
        <div className="overflow-y-auto flex-1 p-6">

          {/* datos */}
          {tab === 'datos' && (
            <div className="space-y-5">
              {/* contacto */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Contacto</p>
                <div className="space-y-1.5">
                  {paciente.telefono && <div className="flex items-center gap-2 text-sm text-gray-700"><Phone size={14} className="text-gray-400" />{paciente.telefono}</div>}
                  {paciente.email && <div className="flex items-center gap-2 text-sm text-gray-700"><Mail size={14} className="text-gray-400" />{paciente.email}</div>}
                  {paciente.direccion && <div className="flex items-center gap-2 text-sm text-gray-700"><FileText size={14} className="text-gray-400" />{paciente.direccion}</div>}
                  {!paciente.telefono && !paciente.email && <p className="text-sm text-gray-400">Sin datos de contacto.</p>}
                </div>
              </div>

              {/* personal */}
              {(paciente.cedula || paciente.genero) && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Identificación</p>
                  <div className="grid grid-cols-2 gap-2">
                    {paciente.cedula && <div><p className="text-xs text-gray-400">Cédula</p><p className="text-sm font-medium text-gray-900">{paciente.cedula}</p></div>}
                    {paciente.genero && <div><p className="text-xs text-gray-400">Género</p><p className="text-sm font-medium text-gray-900">{paciente.genero}</p></div>}
                  </div>
                </div>
              )}

              {/* emergencia */}
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

              {/* médico */}
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

          {/* clínico */}
          {tab === 'clinico' && <TabClinico paciente={paciente} doctores={doctores} />}

          {/* citas */}
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

          {/* documentos */}
          {tab === 'documentos' && <TabDocumentos paciente={paciente} />}
        </div>

        {/* footer delete */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end flex-shrink-0">
          <button type="button" onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
            <Trash2 size={13} /> Eliminar paciente
          </button>
        </div>
      </div>
    </div>

    {confirmDelete && (
      <ConfirmDeleteModal
        title="Eliminar paciente"
        itemLabel={paciente.nombre}
        description={`Se eliminarán también sus ${paciente.citas.length} cita(s), ${paciente.expediente_entradas.length} entrada(s) clínica(s) y ${paciente.documentos.length} documento(s). Esta acción no se puede deshacer.`}
        isSubmitting={isDeleting}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => submit({ intent: 'delete', id: paciente.id }, { method: 'post' })}
      />
    )}
    </>
  )
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function Pacientes() {
  const { pacientes, doctores } = useLoaderData<typeof loader>()
  const navigation = useNavigation()
  const submit = useSubmit()
  const [query, setQuery] = useState('')
  const [detalle, setDetalle] = useState<Paciente | null>(null)
  const [editModal, setEditModal] = useState<{ open: boolean; paciente: Paciente | null }>({ open: false, paciente: null })
  const [deleteTarget, setDeleteTarget] = useState<Paciente | null>(null)
  useEffect(() => { if (navigation.state === 'idle') setDeleteTarget(null) }, [navigation.state])

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    if (!q) return pacientes
    return pacientes.filter(p =>
      p.nombre.toLowerCase().includes(q) ||
      p.telefono?.toLowerCase().includes(q) ||
      p.email?.toLowerCase().includes(q)
    )
  }, [pacientes, query])

  // sync detalle when loader reloads (after mutations)
  useEffect(() => {
    if (detalle) {
      const updated = pacientes.find(p => p.id === detalle.id)
      if (updated) setDetalle(updated)
    }
  }, [pacientes])

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Pacientes</h1>
        <button onClick={() => setEditModal({ open: true, paciente: null })}
          className="flex items-center gap-2 px-3 py-2 md:px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
          <Plus size={16} />
          <span className="hidden sm:inline">Nuevo paciente</span>
          <span className="sm:hidden">Nuevo</span>
        </button>
      </div>

      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input type="text" placeholder="Buscar por nombre, teléfono o correo…" value={query} onChange={e => setQuery(e.target.value)}
          className="w-full md:max-w-sm pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <span className="text-xs text-gray-500">{filtered.length} {filtered.length === 1 ? 'paciente' : 'pacientes'}</span>
        </div>

        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-gray-400">
            <User size={32} className="mx-auto mb-2 opacity-30" />
            {query ? 'Sin resultados para esa búsqueda.' : 'No hay pacientes registrados.'}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <table className="hidden md:table w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Paciente', 'Teléfono', 'Correo', 'Citas', 'Registrado', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setDetalle(p)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {initials(p.nombre)}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{p.nombre}</p>
                          {p.tipo_sangre && <p className="text-xs text-red-500 font-medium">{p.tipo_sangre}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{p.telefono ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{p.email ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold',
                        p.citas.length > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400')}>
                        {p.citas.length}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{new Date(p.created_at).toLocaleDateString('es-MX', { dateStyle: 'medium' })}</td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setEditModal({ open: true, paciente: p })}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => setDeleteTarget(p)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {filtered.map(p => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer" onClick={() => setDetalle(p)}>
                  <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
                    {initials(p.nombre)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{p.nombre}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {p.telefono ?? p.email ?? 'Sin contacto'}
                      {p.tipo_sangre ? ` · ${p.tipo_sangre}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {p.citas.length > 0 && (
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                        {p.citas.length}
                      </span>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); setEditModal({ open: true, paciente: p }) }}
                      className="p-2 text-gray-300 hover:text-blue-600"
                    >
                      <Pencil size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {detalle && (
        <PacienteDetalleModal paciente={detalle} doctores={doctores} onClose={() => setDetalle(null)}
          onEdit={() => { setEditModal({ open: true, paciente: detalle }); setDetalle(null) }} />
      )}
      {editModal.open && (
        <PacienteEditModal paciente={editModal.paciente} onClose={() => setEditModal({ open: false, paciente: null })} />
      )}
      {deleteTarget && (
        <ConfirmDeleteModal
          title="Eliminar paciente"
          itemLabel={deleteTarget.nombre}
          description={`Se eliminarán también sus ${deleteTarget.citas.length} cita(s), ${deleteTarget.expediente_entradas.length} entrada(s) clínica(s) y ${deleteTarget.documentos.length} documento(s). Esta acción no se puede deshacer.`}
          isSubmitting={navigation.state === 'submitting'}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => submit({ intent: 'delete', id: deleteTarget.id }, { method: 'post' })}
        />
      )}
    </div>
  )
}
