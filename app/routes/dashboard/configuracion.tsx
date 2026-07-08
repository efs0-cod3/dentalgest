import { useState, useEffect } from 'react'
import { useSearchParams, useFetcher, Form } from 'react-router'
import type { Route } from './+types/configuracion'
import { createSupabaseServerClient } from '~/lib/supabase.server'
import { createSupabaseAdminClient } from '~/lib/supabase.admin.server'
import { getClinicaId } from '~/lib/clinica.server'
import { cn } from '~/lib/utils'
import { ConfirmDeleteModal } from '~/components/ConfirmDeleteModal'
import {
  Building2, Users, Stethoscope, Syringe, Calendar, Bell,
  DollarSign, AlertTriangle, Plus, Pencil, Trash2, X, Check,
  Download, LogOut, Mail,
} from 'lucide-react'

// ─── types ────────────────────────────────────────────────────────────────────

type TabId = 'clinica' | 'usuarios' | 'doctores' | 'tratamientos' | 'agenda' | 'notificaciones' | 'caja' | 'peligro'

type ClinicaData = {
  id: string; nombre: string; rnc: string | null
  telefono: string | null; email: string | null; direccion: string | null
}
type Doctor = { id: string; nombre: string; especialidad: string | null; color: string }
type Tratamiento = { id: string; nombre: string; precio: number; duracion_min: number; color: string }
type Perfil = { id: string; rol: string; email: string | null }
type Config = {
  agenda_hora_inicio: string; agenda_hora_fin: string
  agenda_duracion_default_min: number; agenda_dias_laborables: number[]
  agenda_citas_simultaneas: boolean; caja_moneda: string
  caja_itbis: boolean; caja_auto_ingreso: boolean; notif_lab_alerta_dias: number
}

// ─── meta ─────────────────────────────────────────────────────────────────────

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Configuración — Nin Dental Clinic' }]
}

// ─── loader ───────────────────────────────────────────────────────────────────

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request)
  const clinicaId = await getClinicaId(request)

  const [{ data: clinica }, { data: doctores }, { data: tratamientos }, { data: perfiles }, { data: config }] =
    await Promise.all([
      supabase.from('clinicas').select('id,nombre,rnc,telefono,email,direccion').eq('id', clinicaId).single(),
      supabase.from('doctores').select('id,nombre,especialidad,color').eq('clinica_id', clinicaId).order('nombre'),
      supabase.from('tratamientos').select('id,nombre,precio,duracion_min,color').eq('clinica_id', clinicaId).order('nombre'),
      supabase.from('perfiles').select('id,rol,email').eq('clinica_id', clinicaId),
      supabase.from('config_clinica').select('*').eq('clinica_id', clinicaId).single(),
    ])

  const defaultConfig: Config = {
    agenda_hora_inicio: '08:00', agenda_hora_fin: '18:00',
    agenda_duracion_default_min: 30, agenda_dias_laborables: [1, 2, 3, 4, 5],
    agenda_citas_simultaneas: false, caja_moneda: 'DOP',
    caja_itbis: false, caja_auto_ingreso: false, notif_lab_alerta_dias: 2,
  }

  return {
    clinica: clinica as ClinicaData | null,
    doctores: (doctores ?? []) as Doctor[],
    tratamientos: (tratamientos ?? []) as Tratamiento[],
    perfiles: (perfiles ?? []) as Perfil[],
    config: (config ? { ...defaultConfig, ...config } : defaultConfig) as Config,
    clinicaId,
  }
}

// ─── action ───────────────────────────────────────────────────────────────────

export async function action({ request }: Route.ActionArgs) {
  const { supabase } = createSupabaseServerClient(request)
  const clinicaId = await getClinicaId(request)
  const fd = await request.formData()
  const intent = fd.get('intent') as string

  // Clínica
  if (intent === 'update_clinica') {
    const { error } = await supabase.from('clinicas').update({
      nombre: fd.get('nombre') as string,
      rnc: (fd.get('rnc') as string) || null,
      telefono: (fd.get('telefono') as string) || null,
      email: (fd.get('email') as string) || null,
      direccion: (fd.get('direccion') as string) || null,
    }).eq('id', clinicaId)
    return error ? { ok: false, error: error.message, intent } : { ok: true, intent }
  }

  // Doctores
  if (intent === 'create_doctor') {
    const { error } = await supabase.from('doctores').insert({
      clinica_id: clinicaId,
      nombre: fd.get('nombre') as string,
      especialidad: (fd.get('especialidad') as string) || null,
      color: (fd.get('color') as string) || '#3B82F6',
    })
    return error ? { ok: false, error: error.message, intent } : { ok: true, intent }
  }
  if (intent === 'update_doctor') {
    const { error } = await supabase.from('doctores').update({
      nombre: fd.get('nombre') as string,
      especialidad: (fd.get('especialidad') as string) || null,
      color: (fd.get('color') as string) || '#3B82F6',
    }).eq('id', fd.get('id') as string).eq('clinica_id', clinicaId)
    return error ? { ok: false, error: error.message, intent } : { ok: true, intent }
  }
  if (intent === 'delete_doctor') {
    await supabase.from('doctores').delete().eq('id', fd.get('id') as string).eq('clinica_id', clinicaId)
    return { ok: true, intent }
  }

  // Tratamientos
  if (intent === 'create_tratamiento') {
    const { error } = await supabase.from('tratamientos').insert({
      clinica_id: clinicaId,
      nombre: fd.get('nombre') as string,
      precio: parseFloat(fd.get('precio') as string) || 0,
      duracion_min: parseInt(fd.get('duracion_min') as string) || 30,
      color: (fd.get('color') as string) || '#6366F1',
    })
    return error ? { ok: false, error: error.message, intent } : { ok: true, intent }
  }
  if (intent === 'update_tratamiento') {
    const { error } = await supabase.from('tratamientos').update({
      nombre: fd.get('nombre') as string,
      precio: parseFloat(fd.get('precio') as string) || 0,
      duracion_min: parseInt(fd.get('duracion_min') as string) || 30,
      color: (fd.get('color') as string) || '#6366F1',
    }).eq('id', fd.get('id') as string).eq('clinica_id', clinicaId)
    return error ? { ok: false, error: error.message, intent } : { ok: true, intent }
  }
  if (intent === 'delete_tratamiento') {
    await supabase.from('tratamientos').delete().eq('id', fd.get('id') as string).eq('clinica_id', clinicaId)
    return { ok: true, intent }
  }

  // Usuarios
  if (intent === 'invite_user') {
    try {
      const admin = createSupabaseAdminClient()
      const emailInvite = fd.get('email') as string
      const rol = (fd.get('rol') as string) || 'recepcionista'
      const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(emailInvite, {
        data: { clinica_id: clinicaId },
      })
      if (inviteErr) return { ok: false, error: inviteErr.message, intent }
      await supabase.from('perfiles').upsert(
        { id: invited.user.id, clinica_id: clinicaId, rol, email: emailInvite },
        { onConflict: 'id' }
      )
      return { ok: true, intent }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Error al invitar', intent }
    }
  }
  if (intent === 'update_rol') {
    const { error } = await supabase.from('perfiles')
      .update({ rol: fd.get('rol') as string })
      .eq('id', fd.get('id') as string).eq('clinica_id', clinicaId)
    return error ? { ok: false, error: error.message, intent } : { ok: true, intent }
  }
  if (intent === 'remove_user') {
    await supabase.from('perfiles').delete()
      .eq('id', fd.get('id') as string).eq('clinica_id', clinicaId)
    return { ok: true, intent }
  }

  // Config helpers
  const ensureConfig = async () => {
    await supabase.from('config_clinica').upsert(
      { clinica_id: clinicaId },
      { onConflict: 'clinica_id', ignoreDuplicates: true }
    )
  }

  // Agenda
  if (intent === 'update_agenda') {
    await ensureConfig()
    const diasRaw = fd.get('agenda_dias_laborables') as string
    const dias = diasRaw ? diasRaw.split(',').map(Number).filter(n => !isNaN(n)) : [1, 2, 3, 4, 5]
    const { error } = await supabase.from('config_clinica').update({
      agenda_hora_inicio: fd.get('agenda_hora_inicio') || '08:00',
      agenda_hora_fin: fd.get('agenda_hora_fin') || '18:00',
      agenda_duracion_default_min: parseInt(fd.get('agenda_duracion_default_min') as string) || 30,
      agenda_dias_laborables: dias,
      agenda_citas_simultaneas: fd.get('agenda_citas_simultaneas') === 'true',
    }).eq('clinica_id', clinicaId)
    return error ? { ok: false, error: error.message, intent } : { ok: true, intent }
  }

  // Notificaciones
  if (intent === 'update_notificaciones') {
    await ensureConfig()
    const { error } = await supabase.from('config_clinica').update({
      notif_lab_alerta_dias: parseInt(fd.get('notif_lab_alerta_dias') as string) || 2,
    }).eq('clinica_id', clinicaId)
    return error ? { ok: false, error: error.message, intent } : { ok: true, intent }
  }

  // Caja
  if (intent === 'update_caja') {
    await ensureConfig()
    const { error } = await supabase.from('config_clinica').update({
      caja_moneda: (fd.get('caja_moneda') as string) || 'DOP',
      caja_itbis: fd.get('caja_itbis') === 'true',
      caja_auto_ingreso: fd.get('caja_auto_ingreso') === 'true',
    }).eq('clinica_id', clinicaId)
    return error ? { ok: false, error: error.message, intent } : { ok: true, intent }
  }

  return { ok: false, error: 'Intent desconocido', intent }
}

// ─── shared UI helpers ────────────────────────────────────────────────────────

function SectionCard({ title, description, children }: {
  title: string; description?: string; children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  )
}

function SaveBtn({ loading }: { loading?: boolean }) {
  return (
    <button type="submit" disabled={loading}
      className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
      {loading ? 'Guardando…' : 'Guardar cambios'}
    </button>
  )
}

function FeedbackMsg({ data }: { data: any }) {
  if (!data) return null
  if (data.ok) return (
    <p className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
      ✓ Cambios guardados
    </p>
  )
  return (
    <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
      {data.error ?? 'Error al guardar'}
    </p>
  )
}

function Toggle({ name, defaultChecked, label, description }: {
  name: string; defaultChecked: boolean; label: string; description?: string
}) {
  const [on, setOn] = useState(defaultChecked)
  useEffect(() => { setOn(defaultChecked) }, [defaultChecked])
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      <div className="flex-shrink-0 pt-0.5">
        <button type="button" role="switch" aria-checked={on} onClick={() => setOn(!on)}
          className={cn('relative inline-flex h-6 w-11 rounded-full transition-colors focus:outline-none',
            on ? 'bg-blue-600' : 'bg-gray-300')}>
          <span className={cn('absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
            on ? 'translate-x-5' : 'translate-x-0')} />
        </button>
        <input type="hidden" name={name} value={on.toString()} />
      </div>
    </div>
  )
}

const inputCls = 'w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500'

// ─── section: Clínica ─────────────────────────────────────────────────────────

function ClinicaSection({ clinica }: { clinica: ClinicaData | null }) {
  const f = useFetcher()
  return (
    <SectionCard title="Información de la clínica" description="Aparece en encabezados de presupuestos e impresiones">
      <f.Form method="post" className="space-y-4">
        <input type="hidden" name="intent" value="update_clinica" />
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Nombre</label>
            <input name="nombre" defaultValue={clinica?.nombre ?? ''} required className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">RNC / RIF</label>
            <input name="rnc" defaultValue={clinica?.rnc ?? ''} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Teléfono</label>
            <input name="telefono" defaultValue={clinica?.telefono ?? ''} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Email</label>
            <input name="email" type="email" defaultValue={clinica?.email ?? ''} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Dirección</label>
            <input name="direccion" defaultValue={clinica?.direccion ?? ''} className={inputCls} />
          </div>
        </div>
        <div className="flex items-center gap-3 pt-2">
          <SaveBtn loading={f.state !== 'idle'} />
          <FeedbackMsg data={f.data} />
        </div>
      </f.Form>
    </SectionCard>
  )
}

// ─── section: Usuarios ────────────────────────────────────────────────────────

const ROLES = ['propietario', 'admin', 'recepcionista', 'doctor', 'laboratorio'] as const

function UsuariosSection({ perfiles }: { perfiles: Perfil[] }) {
  const f = useFetcher()
  const [inviting, setInviting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Perfil | null>(null)

  useEffect(() => {
    if (f.data?.ok && f.data.intent === 'invite_user') setInviting(false)
    if (f.state === 'idle') setDeleteTarget(null)
  }, [f.data, f.state])

  return (
    <div className="space-y-4">
      <SectionCard title="Equipo" description="Personas con acceso a la clínica y sus roles">
        <div className="space-y-1">
          {perfiles.map(p => (
            <div key={p.id} className="flex items-center gap-3 py-2 px-2 hover:bg-gray-50 rounded-lg group">
              <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                {(p.email?.[0] ?? '?').toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{p.email ?? '(sin email)'}</p>
                <select
                  defaultValue={p.rol}
                  onChange={e => {
                    const fd = new FormData()
                    fd.append('intent', 'update_rol')
                    fd.append('id', p.id)
                    fd.append('rol', e.target.value)
                    f.submit(fd, { method: 'post' })
                  }}
                  className="text-xs text-gray-500 bg-transparent border-0 p-0 focus:outline-none cursor-pointer mt-0.5">
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <button type="button" onClick={() => setDeleteTarget(p)}
                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                <X size={13} />
              </button>
            </div>
          ))}

          {perfiles.length === 0 && (
            <p className="text-sm text-gray-400 py-2 px-2">Aún no hay usuarios registrados.</p>
          )}

          {deleteTarget && (
            <ConfirmDeleteModal
              title="Quitar acceso"
              itemLabel={deleteTarget.email ?? '(sin email)'}
              description={`Perderá acceso a la clínica de inmediato. Rol actual: ${deleteTarget.rol}.`}
              confirmLabel="Quitar acceso"
              isSubmitting={f.state !== 'idle'}
              onCancel={() => setDeleteTarget(null)}
              onConfirm={() => {
                const fd = new FormData()
                fd.append('intent', 'remove_user')
                fd.append('id', deleteTarget.id)
                f.submit(fd, { method: 'post' })
              }}
            />
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100">
          {inviting ? (
            <f.Form method="post" className="flex flex-wrap gap-2">
              <input type="hidden" name="intent" value="invite_user" />
              <input name="email" type="email" required autoFocus placeholder="email@ejemplo.com"
                className="flex-1 min-w-48 px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <select name="rol" defaultValue="recepcionista"
                className="px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <button type="submit" disabled={f.state !== 'idle'}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
                <Mail size={13} /> Invitar
              </button>
              <button type="button" onClick={() => setInviting(false)}
                className="px-3 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200">
                Cancelar
              </button>
            </f.Form>
          ) : (
            <button onClick={() => setInviting(true)}
              className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700">
              <Plus size={14} /> Invitar usuario por email
            </button>
          )}
          {f.data && (
            f.data.ok && f.data.intent === 'invite_user'
              ? <p className="mt-2 text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">✓ Invitación enviada</p>
              : !f.data.ok
                ? <p className="mt-2 text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{f.data.error}</p>
                : null
          )}
        </div>
      </SectionCard>
    </div>
  )
}

// ─── section: Doctores ────────────────────────────────────────────────────────

function DoctoresSection({ doctores }: { doctores: Doctor[] }) {
  const f = useFetcher()
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Doctor | null>(null)

  useEffect(() => {
    if (!f.data?.ok) return
    if (f.data.intent === 'create_doctor') setAdding(false)
    if (f.data.intent === 'update_doctor') setEditing(null)
  }, [f.data])

  useEffect(() => { if (f.state === 'idle') setDeleteTarget(null) }, [f.state])

  return (
    <SectionCard title="Doctores" description="Perfil de cada médico — el color se usa en la agenda">
      <div className="space-y-1">
        {doctores.map(doc => (
          <div key={doc.id}>
            {editing === doc.id ? (
              <f.Form method="post" className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg">
                <input type="hidden" name="intent" value="update_doctor" />
                <input type="hidden" name="id" value={doc.id} />
                <input type="color" name="color" defaultValue={doc.color}
                  className="h-8 w-8 rounded cursor-pointer border-0 flex-shrink-0" />
                <input name="nombre" defaultValue={doc.nombre} required placeholder="Nombre"
                  className={cn(inputCls, 'flex-1')} />
                <input name="especialidad" defaultValue={doc.especialidad ?? ''} placeholder="Especialidad"
                  className={cn(inputCls, 'flex-1')} />
                <button type="submit" disabled={f.state !== 'idle'}
                  className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                  <Check size={14} />
                </button>
                <button type="button" onClick={() => setEditing(null)}
                  className="p-2 bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300">
                  <X size={14} />
                </button>
              </f.Form>
            ) : (
              <div className="flex items-center gap-3 py-2 px-2 hover:bg-gray-50 rounded-lg group">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: doc.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{doc.nombre}</p>
                  {doc.especialidad && <p className="text-xs text-gray-400">{doc.especialidad}</p>}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button type="button" onClick={() => setEditing(doc.id)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                    <Pencil size={13} />
                  </button>
                  <button type="button" onClick={() => setDeleteTarget(doc)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {adding ? (
          <f.Form method="post" className="flex items-center gap-2 p-2 bg-green-50 rounded-lg">
            <input type="hidden" name="intent" value="create_doctor" />
            <input type="color" name="color" defaultValue="#3B82F6"
              className="h-8 w-8 rounded cursor-pointer border-0 flex-shrink-0" />
            <input name="nombre" required autoFocus placeholder="Nombre del doctor"
              className={cn(inputCls, 'flex-1')} />
            <input name="especialidad" placeholder="Especialidad (opcional)"
              className={cn(inputCls, 'flex-1')} />
            <button type="submit" disabled={f.state !== 'idle'}
              className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
              <Check size={14} />
            </button>
            <button type="button" onClick={() => setAdding(false)}
              className="p-2 bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300">
              <X size={14} />
            </button>
          </f.Form>
        ) : (
          <button onClick={() => setAdding(true)}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors mt-1">
            <Plus size={14} /> Agregar doctor
          </button>
        )}
      </div>
      {f.data && !f.data.ok && (
        <p className="mt-3 text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{f.data.error}</p>
      )}
      {deleteTarget && (
        <ConfirmDeleteModal
          title="Eliminar doctor"
          itemLabel={deleteTarget.nombre}
          description={`${deleteTarget.especialidad ?? 'Sin especialidad'}. Esta acción no se puede deshacer.`}
          isSubmitting={f.state !== 'idle'}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            const fd = new FormData()
            fd.append('intent', 'delete_doctor')
            fd.append('id', deleteTarget.id)
            f.submit(fd, { method: 'post' })
          }}
        />
      )}
    </SectionCard>
  )
}

// ─── section: Tratamientos ────────────────────────────────────────────────────

const DURACIONES = [15, 20, 30, 45, 60, 90, 120]

function TratamientosSection({ tratamientos }: { tratamientos: Tratamiento[] }) {
  const f = useFetcher()
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Tratamiento | null>(null)

  useEffect(() => {
    if (!f.data?.ok) return
    if (f.data.intent === 'create_tratamiento') setAdding(false)
    if (f.data.intent === 'update_tratamiento') setEditing(null)
  }, [f.data])

  useEffect(() => { if (f.state === 'idle') setDeleteTarget(null) }, [f.state])

  return (
    <SectionCard title="Catálogo de tratamientos" description="Servicios con precio, duración y color para la agenda">
      {/* header */}
      <div className="flex items-center gap-3 px-2 pb-2 border-b border-gray-100 mb-1">
        <div className="w-3 flex-shrink-0" />
        <p className="flex-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">Nombre</p>
        <p className="w-28 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Precio</p>
        <p className="w-20 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Duración</p>
        <div className="w-14" />
      </div>

      <div className="space-y-1">
        {tratamientos.map(t => (
          <div key={t.id}>
            {editing === t.id ? (
              <f.Form method="post" className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg">
                <input type="hidden" name="intent" value="update_tratamiento" />
                <input type="hidden" name="id" value={t.id} />
                <input type="color" name="color" defaultValue={t.color}
                  className="h-8 w-8 rounded cursor-pointer border-0 flex-shrink-0" />
                <input name="nombre" defaultValue={t.nombre} required placeholder="Nombre"
                  className={cn(inputCls, 'flex-1')} />
                <input name="precio" type="number" defaultValue={t.precio} min="0" step="0.01" placeholder="0.00"
                  className={cn(inputCls, 'w-28')} />
                <select name="duracion_min" defaultValue={t.duracion_min}
                  className={cn(inputCls, 'w-24')}>
                  {DURACIONES.map(v => <option key={v} value={v}>{v} min</option>)}
                </select>
                <button type="submit" disabled={f.state !== 'idle'}
                  className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                  <Check size={14} />
                </button>
                <button type="button" onClick={() => setEditing(null)}
                  className="p-2 bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300">
                  <X size={14} />
                </button>
              </f.Form>
            ) : (
              <div className="flex items-center gap-3 py-2 px-2 hover:bg-gray-50 rounded-lg group">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                <p className="flex-1 text-sm font-medium text-gray-900">{t.nombre}</p>
                <p className="w-28 text-sm text-gray-600 text-right">
                  {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(t.precio)}
                </p>
                <p className="w-20 text-sm text-gray-500 text-right">{t.duracion_min} min</p>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity w-14 justify-end">
                  <button type="button" onClick={() => setEditing(t.id)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                    <Pencil size={13} />
                  </button>
                  <button type="button" onClick={() => setDeleteTarget(t)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {adding ? (
          <f.Form method="post" className="flex items-center gap-2 p-2 bg-green-50 rounded-lg">
            <input type="hidden" name="intent" value="create_tratamiento" />
            <input type="color" name="color" defaultValue="#6366F1"
              className="h-8 w-8 rounded cursor-pointer border-0 flex-shrink-0" />
            <input name="nombre" required autoFocus placeholder="Nombre del tratamiento"
              className={cn(inputCls, 'flex-1')} />
            <input name="precio" type="number" min="0" step="0.01" placeholder="0.00"
              className={cn(inputCls, 'w-28')} />
            <select name="duracion_min" defaultValue={30}
              className={cn(inputCls, 'w-24')}>
              {DURACIONES.map(v => <option key={v} value={v}>{v} min</option>)}
            </select>
            <button type="submit" disabled={f.state !== 'idle'}
              className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
              <Check size={14} />
            </button>
            <button type="button" onClick={() => setAdding(false)}
              className="p-2 bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300">
              <X size={14} />
            </button>
          </f.Form>
        ) : (
          <button onClick={() => setAdding(true)}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors mt-1">
            <Plus size={14} /> Agregar tratamiento
          </button>
        )}
      </div>
      {f.data && !f.data.ok && (
        <p className="mt-3 text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{f.data.error}</p>
      )}
      {deleteTarget && (
        <ConfirmDeleteModal
          title="Eliminar tratamiento"
          itemLabel={deleteTarget.nombre}
          description={`${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(deleteTarget.precio)} · ${deleteTarget.duracion_min} min. Esta acción no se puede deshacer.`}
          isSubmitting={f.state !== 'idle'}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            const fd = new FormData()
            fd.append('intent', 'delete_tratamiento')
            fd.append('id', deleteTarget.id)
            f.submit(fd, { method: 'post' })
          }}
        />
      )}
    </SectionCard>
  )
}

// ─── section: Agenda ──────────────────────────────────────────────────────────

const DIAS_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const DIAS_VALUES = [1, 2, 3, 4, 5, 6, 0]

function AgendaSection({ config }: { config: Config }) {
  const f = useFetcher()
  const diasStr = config.agenda_dias_laborables.join(',')
  const [dias, setDias] = useState<number[]>(config.agenda_dias_laborables)
  useEffect(() => { setDias(config.agenda_dias_laborables) }, [diasStr])

  return (
    <SectionCard title="Configuración de agenda" description="Horarios y reglas para programación de citas">
      <f.Form method="post" className="space-y-5">
        <input type="hidden" name="intent" value="update_agenda" />
        <input type="hidden" name="agenda_dias_laborables" value={dias.join(',')} />

        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Días laborables</p>
          <div className="flex gap-2">
            {DIAS_LABELS.map((lbl, i) => {
              const v = DIAS_VALUES[i]
              const active = dias.includes(v)
              return (
                <button key={v} type="button"
                  onClick={() => setDias(prev => active ? prev.filter(d => d !== v) : [...prev, v])}
                  className={cn('w-9 h-9 rounded-full text-xs font-semibold transition-colors',
                    active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}>
                  {lbl}
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Apertura</label>
            <input type="time" name="agenda_hora_inicio" defaultValue={config.agenda_hora_inicio} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Cierre</label>
            <input type="time" name="agenda_hora_fin" defaultValue={config.agenda_hora_fin} className={inputCls} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
            Duración por defecto de cita
          </label>
          <select name="agenda_duracion_default_min" defaultValue={config.agenda_duracion_default_min} className={inputCls}>
            {DURACIONES.map(v => <option key={v} value={v}>{v} minutos</option>)}
          </select>
        </div>

        <div className="border-t border-gray-100 pt-1">
          <Toggle name="agenda_citas_simultaneas" defaultChecked={config.agenda_citas_simultaneas}
            label="Permitir citas simultáneas"
            description="Más de una cita a la misma hora (p. ej. con distintos doctores)" />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <SaveBtn loading={f.state !== 'idle'} />
          <FeedbackMsg data={f.data} />
        </div>
      </f.Form>
    </SectionCard>
  )
}

// ─── section: Notificaciones ──────────────────────────────────────────────────

function NotificacionesSection({ config }: { config: Config }) {
  const f = useFetcher()
  return (
    <div className="space-y-4">
      <SectionCard title="Alertas de laboratorio" description="Aviso cuando una orden no llegará a tiempo para la cita del paciente">
        <f.Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="update_notificaciones" />
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Alertar si la orden de lab no llega con anticipación de
            </label>
            <div className="flex items-center gap-3">
              <input type="number" name="notif_lab_alerta_dias" defaultValue={config.notif_lab_alerta_dias}
                min={1} max={14}
                className="w-24 px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <span className="text-sm text-gray-500">días antes de la cita</span>
            </div>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <SaveBtn loading={f.state !== 'idle'} />
            <FeedbackMsg data={f.data} />
          </div>
        </f.Form>
      </SectionCard>

      <SectionCard title="Notificaciones por WhatsApp">
        <p className="text-sm text-gray-500">Próximamente — recordatorios automáticos a pacientes vía WhatsApp Business.</p>
      </SectionCard>
    </div>
  )
}

// ─── section: Caja ────────────────────────────────────────────────────────────

function CajaSection({ config }: { config: Config }) {
  const f = useFetcher()
  return (
    <SectionCard title="Configuración de caja" description="Ajustes de moneda, impuestos y registro de pagos">
      <f.Form method="post" className="space-y-5">
        <input type="hidden" name="intent" value="update_caja" />

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Moneda</label>
          <select name="caja_moneda" defaultValue={config.caja_moneda} className={inputCls}>
            <option value="DOP">DOP — Peso dominicano</option>
            <option value="USD">USD — Dólar americano</option>
            <option value="EUR">EUR — Euro</option>
            <option value="MXN">MXN — Peso mexicano</option>
          </select>
        </div>

        <div className="border-t border-gray-100 pt-1 divide-y divide-gray-100">
          <Toggle name="caja_itbis" defaultChecked={config.caja_itbis}
            label="Aplicar ITBIS (18%)"
            description="Los servicios médicos en RD están exentos — activa solo si aplica" />
          <Toggle name="caja_auto_ingreso" defaultChecked={config.caja_auto_ingreso}
            label="Registrar ingreso al marcar cita como atendida"
            description="Crea automáticamente un pago cuando una cita pasa a estado 'atendida'" />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <SaveBtn loading={f.state !== 'idle'} />
          <FeedbackMsg data={f.data} />
        </div>
      </f.Form>
    </SectionCard>
  )
}

// ─── section: Zona de peligro ─────────────────────────────────────────────────

function PeligroSection() {
  return (
    <div className="space-y-4">
      <SectionCard title="Exportar datos">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-900">Descargar todos los datos</p>
            <p className="text-xs text-gray-500 mt-1">
              Exporta pacientes, citas, pagos, cotizaciones y órdenes de laboratorio en formato JSON.
            </p>
          </div>
          <a href="/api/export-datos"
            className="flex-shrink-0 flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
            <Download size={14} />
            Exportar
          </a>
        </div>
      </SectionCard>

      <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-red-100 bg-red-50">
          <h3 className="text-base font-semibold text-red-900">Zona de peligro</h3>
          <p className="text-sm text-red-600 mt-0.5">Acciones irreversibles que afectan el acceso al sistema.</p>
        </div>
        <div className="px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-900">Cerrar todas las sesiones activas</p>
              <p className="text-xs text-gray-500 mt-1">
                Desconecta todos los dispositivos. Necesitarás iniciar sesión de nuevo.
              </p>
            </div>
            <Form method="post" action="/logout">
              <button type="submit"
                className="flex-shrink-0 flex items-center gap-2 px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
                <LogOut size={14} />
                Cerrar todas
              </button>
            </Form>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── tabs ─────────────────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'clinica', label: 'Clínica', icon: Building2 },
  { id: 'usuarios', label: 'Usuarios', icon: Users },
  { id: 'doctores', label: 'Doctores', icon: Stethoscope },
  { id: 'tratamientos', label: 'Tratamientos', icon: Syringe },
  { id: 'agenda', label: 'Agenda', icon: Calendar },
  { id: 'notificaciones', label: 'Notificaciones', icon: Bell },
  { id: 'caja', label: 'Caja', icon: DollarSign },
  { id: 'peligro', label: 'Zona de peligro', icon: AlertTriangle },
]

// ─── main component ───────────────────────────────────────────────────────────

export default function Configuracion({ loaderData }: Route.ComponentProps) {
  const { clinica, doctores, tratamientos, perfiles, config } = loaderData
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = (searchParams.get('tab') ?? 'clinica') as TabId

  return (
    <div className="flex flex-col md:flex-row h-full">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-52 flex-shrink-0 bg-white border-r border-gray-200 py-5 flex-col">
        <p className="px-5 text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Configuración</p>
        <nav className="space-y-0.5 px-2">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setSearchParams({ tab: id })}
              className={cn(
                'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left',
                tab === id
                  ? id === 'peligro' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'
                  : id === 'peligro'
                    ? 'text-red-500 hover:bg-red-50'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              )}>
              <Icon size={15} />
              {label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Mobile top tab bar */}
      <div className="md:hidden bg-white border-b border-gray-200 flex-shrink-0 overflow-x-auto">
        <div className="flex min-w-max px-2 py-2 gap-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setSearchParams({ tab: id })}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0',
                tab === id
                  ? id === 'peligro' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'
                  : id === 'peligro'
                    ? 'text-red-500'
                    : 'text-gray-600'
              )}>
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* content */}
      <div className="flex-1 overflow-auto p-4 md:p-6">
        <div className="max-w-2xl space-y-4">
          {tab === 'clinica' && <ClinicaSection clinica={clinica} />}
          {tab === 'usuarios' && <UsuariosSection perfiles={perfiles} />}
          {tab === 'doctores' && <DoctoresSection doctores={doctores} />}
          {tab === 'tratamientos' && <TratamientosSection tratamientos={tratamientos} />}
          {tab === 'agenda' && <AgendaSection config={config} />}
          {tab === 'notificaciones' && <NotificacionesSection config={config} />}
          {tab === 'caja' && <CajaSection config={config} />}
          {tab === 'peligro' && <PeligroSection />}
        </div>
      </div>
    </div>
  )
}
