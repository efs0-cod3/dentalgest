import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useLoaderData, useSearchParams, useNavigation, useSubmit, useFetcher } from 'react-router'
import type { Route } from './+types/trabajos-externos'
import { createSupabaseServerClient } from '~/lib/supabase.server'
import { getClinicaId } from '~/lib/clinica.server'
import { useCloseOnSubmit } from '~/lib/hooks'
import {
  Plus, X, Pencil, Trash2, Building2, Search, Phone, Mail,
  Inbox, Clock, CheckCircle, Package, Calendar, Printer, Upload,
  DollarSign, Receipt, Wrench,
} from 'lucide-react'
import { cn } from '~/lib/utils'
import { ConfirmDeleteModal } from '~/components/ConfirmDeleteModal'
import { buildTrabajoHtml, buildFacturaExternaHtml } from '~/lib/trabajoExterno'

// ─── types ────────────────────────────────────────────────────────────────────

type TipoCliente = 'clinica' | 'doctor_independiente'
type EstadoTrabajo = 'recibido' | 'en_proceso' | 'terminado' | 'entregado'
type EstadoFactura = 'pendiente' | 'pagada'

export type ClienteExterno = {
  id: string; nombre: string; tipo: TipoCliente
  telefono: string | null; email: string | null; direccion: string | null
  rnc: string | null; notas: string | null; created_at: string
}

export type TrabajoExterno = {
  id: string; cliente_externo_id: string
  paciente_referencia: string | null; tipo_trabajo: string; material: string | null
  notas: string | null; fotos: string[]; estado: EstadoTrabajo
  fecha_recibido: string; fecha_prometida: string | null; fecha_entregado: string | null
  precio: number | null; factura_id: string | null
  verification_token: string; created_at: string
  clientes_externos: { nombre: string } | null
}

export type FacturaExterna = {
  id: string; cliente_externo_id: string
  periodo_inicio: string; periodo_fin: string; total: number
  estado: EstadoFactura; fecha_emision: string; fecha_pago: string | null
  verification_token: string
  clientes_externos: { nombre: string } | null
}

// ─── helpers ─────────────────────────────────────────────────────────────────

export function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-DO', { dateStyle: 'medium' })
}
export function fmtMoney(n: number) {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(n)
}

const estadoTrabajoConfig: Record<EstadoTrabajo, { label: string; color: string; Icon: any }> = {
  recibido:   { label: 'Recibido',   color: 'bg-gray-100 text-gray-600',   Icon: Inbox },
  en_proceso: { label: 'En proceso', color: 'bg-amber-100 text-amber-700', Icon: Clock },
  terminado:  { label: 'Terminado',  color: 'bg-blue-100 text-blue-700',   Icon: CheckCircle },
  entregado:  { label: 'Entregado',  color: 'bg-green-100 text-green-700', Icon: Package },
}
const estadoFacturaConfig: Record<EstadoFactura, { label: string; color: string }> = {
  pendiente: { label: 'Pendiente', color: 'bg-amber-100 text-amber-700' },
  pagada:    { label: 'Pagada',    color: 'bg-green-100 text-green-700' },
}
const TIPOS_TRABAJO = [
  'Corona', 'Puente', 'Prótesis total', 'Prótesis parcial removible',
  'Retenedor / Guarda', 'Carilla / Faceta', 'Implante (componente)', 'Otro',
]
const FOTOS_BUCKET = 'externos'

function photoStoragePath(url: string) {
  const marker = `/public/${FOTOS_BUCKET}/`
  const i = url.indexOf(marker)
  return i === -1 ? null : url.slice(i + marker.length)
}

// ─── meta ─────────────────────────────────────────────────────────────────────

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Trabajos externos — Nin Dental Clinic' }]
}

// ─── loader ───────────────────────────────────────────────────────────────────

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request)
  const clinicaId = await getClinicaId(request)
  const [{ data: perfilClinica }, { data: clientes }, { data: trabajos }, { data: facturas }] = await Promise.all([
    supabase.from('clinicas').select('nombre').eq('id', clinicaId).single(),
    supabase.from('clientes_externos').select('id,nombre,tipo,telefono,email,direccion,rnc,notas,created_at')
      .eq('clinica_id', clinicaId).order('nombre'),
    supabase.from('trabajos_externos').select(
      'id,cliente_externo_id,paciente_referencia,tipo_trabajo,material,notas,fotos,estado,fecha_recibido,fecha_prometida,fecha_entregado,precio,factura_id,verification_token,created_at,clientes_externos(nombre)'
    ).eq('clinica_id', clinicaId).order('created_at', { ascending: false }),
    supabase.from('facturas_externas').select(
      'id,cliente_externo_id,periodo_inicio,periodo_fin,total,estado,fecha_emision,fecha_pago,verification_token,clientes_externos(nombre)'
    ).eq('clinica_id', clinicaId).order('fecha_emision', { ascending: false }),
  ])
  return {
    clinicaNombre: perfilClinica?.nombre ?? 'Nin Dental Clinic',
    clientes: (clientes ?? []) as ClienteExterno[],
    trabajos: (trabajos ?? []) as unknown as TrabajoExterno[],
    facturas: (facturas ?? []) as unknown as FacturaExterna[],
  }
}

// ─── action ───────────────────────────────────────────────────────────────────

export async function action({ request }: Route.ActionArgs) {
  const { supabase } = createSupabaseServerClient(request)
  const clinicaId = await getClinicaId(request)
  const fd = await request.formData()
  const intent = fd.get('intent') as string

  // ── clientes ──
  if (intent === 'delete_cliente') {
    const clienteId = fd.get('id') as string
    // cascade manually: jobs reference invoices and both reference the client,
    // so the FK would silently block a bare client delete
    await supabase.from('trabajos_externos').delete().eq('cliente_externo_id', clienteId).eq('clinica_id', clinicaId)
    await supabase.from('facturas_externas').delete().eq('cliente_externo_id', clienteId).eq('clinica_id', clinicaId)
    const { error } = await supabase.from('clientes_externos').delete().eq('id', clienteId).eq('clinica_id', clinicaId)
    if (error) return { ok: false, error: error.message, intent }
    return { ok: true }
  }
  if (intent === 'create_cliente' || intent === 'update_cliente') {
    const data = {
      clinica_id: clinicaId,
      nombre: fd.get('nombre') as string,
      tipo: fd.get('tipo') as string,
      telefono: (fd.get('telefono') as string) || null,
      email: (fd.get('email') as string) || null,
      direccion: (fd.get('direccion') as string) || null,
      rnc: (fd.get('rnc') as string) || null,
      notas: (fd.get('notas') as string) || null,
    }
    if (intent === 'create_cliente') {
      const { data: cliente, error } = await supabase.from('clientes_externos').insert(data).select().single()
      if (error) return { ok: false, error: error.message, intent }
      return { ok: true, intent, cliente: cliente as ClienteExterno }
    }
    const { error } = await supabase.from('clientes_externos').update(data).eq('id', fd.get('id') as string).eq('clinica_id', clinicaId)
    if (error) return { ok: false, error: error.message, intent }
    return { ok: true, intent }
  }

  // ── trabajos ──
  if (intent === 'delete_trabajo') {
    await supabase.from('trabajos_externos').delete().eq('id', fd.get('id') as string).eq('clinica_id', clinicaId)
    return { ok: true }
  }
  if (intent === 'cambiar_estado_trabajo') {
    const nuevoEstado = fd.get('estado') as string
    const updates: Record<string, string | null> = { estado: nuevoEstado }
    if (nuevoEstado === 'entregado') updates.fecha_entregado = new Date().toISOString().slice(0, 10)
    await supabase.from('trabajos_externos').update(updates).eq('id', fd.get('id') as string).eq('clinica_id', clinicaId)
    return { ok: true }
  }
  if (intent === 'create_trabajo' || intent === 'update_trabajo') {
    const data = {
      clinica_id: clinicaId,
      cliente_externo_id: fd.get('cliente_externo_id') as string,
      paciente_referencia: (fd.get('paciente_referencia') as string) || null,
      tipo_trabajo: fd.get('tipo_trabajo') as string,
      material: (fd.get('material') as string) || null,
      notas: (fd.get('notas') as string) || null,
      fecha_recibido: (fd.get('fecha_recibido') as string) || new Date().toISOString().slice(0, 10),
      fecha_prometida: (fd.get('fecha_prometida') as string) || null,
      precio: fd.get('precio') ? parseFloat(fd.get('precio') as string) : null,
    }
    const { error } = intent === 'create_trabajo'
      ? await supabase.from('trabajos_externos').insert({ ...data, estado: 'recibido' })
      : await supabase.from('trabajos_externos').update(data).eq('id', fd.get('id') as string).eq('clinica_id', clinicaId)
    if (error) return { ok: false, error: error.message, intent }
    return { ok: true, intent }
  }
  if (intent === 'upload_foto_trabajo') {
    const archivo = fd.get('archivo') as File
    const trabajoId = fd.get('trabajo_id') as string
    if (!archivo || archivo.size === 0) return { ok: false, error: 'Selecciona un archivo primero.', intent }
    const ext = archivo.name.split('.').pop()
    const path = `${clinicaId}/${trabajoId}/${Date.now()}.${ext}`
    const bytes = await archivo.arrayBuffer()
    const { error: uploadError } = await supabase.storage.from(FOTOS_BUCKET).upload(path, bytes, { contentType: archivo.type })
    if (uploadError) return { ok: false, error: `Error al subir la foto: ${uploadError.message}`, intent }
    const { data: { publicUrl } } = supabase.storage.from(FOTOS_BUCKET).getPublicUrl(path)
    const { data: trabajo } = await supabase.from('trabajos_externos').select('fotos').eq('id', trabajoId).single()
    const fotos = [...((trabajo?.fotos as string[] | null) ?? []), publicUrl]
    const { error: updateError } = await supabase.from('trabajos_externos').update({ fotos }).eq('id', trabajoId).eq('clinica_id', clinicaId)
    if (updateError) return { ok: false, error: `Foto subida pero no se pudo guardar: ${updateError.message}`, intent }
    return { ok: true, intent }
  }
  if (intent === 'delete_foto_trabajo') {
    const trabajoId = fd.get('trabajo_id') as string
    const url = fd.get('url') as string
    const path = photoStoragePath(url)
    if (path) {
      const { error: removeError } = await supabase.storage.from(FOTOS_BUCKET).remove([path])
      if (removeError) return { ok: false, error: removeError.message, intent }
    }
    const { data: trabajo } = await supabase.from('trabajos_externos').select('fotos').eq('id', trabajoId).single()
    const fotos = ((trabajo?.fotos as string[] | null) ?? []).filter(f => f !== url)
    const { error: updateError } = await supabase.from('trabajos_externos').update({ fotos }).eq('id', trabajoId).eq('clinica_id', clinicaId)
    if (updateError) return { ok: false, error: updateError.message, intent }
    return { ok: true, intent }
  }

  // ── facturas ──
  if (intent === 'generar_factura') {
    const clienteId = fd.get('cliente_externo_id') as string
    const periodoInicio = fd.get('periodo_inicio') as string
    const periodoFin = fd.get('periodo_fin') as string
    const { data: elegibles } = await supabase
      .from('trabajos_externos')
      .select('id, precio')
      .eq('clinica_id', clinicaId)
      .eq('cliente_externo_id', clienteId)
      .eq('estado', 'entregado')
      .is('factura_id', null)
      .gte('fecha_entregado', periodoInicio)
      .lte('fecha_entregado', periodoFin)
    if (!elegibles || elegibles.length === 0) {
      return { ok: false, error: 'No hay trabajos entregados sin facturar en ese período.', intent }
    }
    const total = elegibles.reduce((s, t) => s + (Number(t.precio) || 0), 0)
    const { data: factura, error } = await supabase.from('facturas_externas').insert({
      clinica_id: clinicaId, cliente_externo_id: clienteId,
      periodo_inicio: periodoInicio, periodo_fin: periodoFin, total,
    }).select().single()
    if (error || !factura) return { ok: false, error: error?.message ?? 'Error al crear la factura', intent }
    await supabase.from('trabajos_externos').update({ factura_id: factura.id }).in('id', elegibles.map(t => t.id))
    return { ok: true, intent }
  }
  if (intent === 'marcar_pagada_factura') {
    await supabase.from('facturas_externas')
      .update({ estado: 'pagada', fecha_pago: new Date().toISOString().slice(0, 10) })
      .eq('id', fd.get('id') as string).eq('clinica_id', clinicaId)
    return { ok: true }
  }
  if (intent === 'delete_factura') {
    const facturaId = fd.get('id') as string
    // un-bill the jobs first so the factura_id FK doesn't block the delete,
    // and they become eligible to be invoiced again
    await supabase.from('trabajos_externos').update({ factura_id: null }).eq('factura_id', facturaId).eq('clinica_id', clinicaId)
    await supabase.from('facturas_externas').delete().eq('id', facturaId).eq('clinica_id', clinicaId)
    return { ok: true }
  }

  return { ok: false, error: 'Intent desconocido' }
}

// ─── cliente form modal ────────────────────────────────────────────────────────

function ClienteFormModal({ cliente, onClose, onCreated }: {
  cliente: ClienteExterno | null; onClose: () => void; onCreated?: (cliente: ClienteExterno) => void
}) {
  const fetcher = useFetcher<typeof action>()
  const isSubmitting = fetcher.state !== 'idle'
  useEffect(() => {
    if (fetcher.state !== 'idle' || !fetcher.data?.ok) return
    if (onCreated && 'cliente' in fetcher.data && fetcher.data.cliente) onCreated(fetcher.data.cliente)
    onClose()
  }, [fetcher.state, fetcher.data])

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[95vh] sm:max-h-[92vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-semibold text-gray-900">{cliente ? 'Editar cliente externo' : 'Nuevo cliente externo'}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <fetcher.Form method="post" className="overflow-y-auto flex-1 p-6 space-y-4">
          <input type="hidden" name="intent" value={cliente ? 'update_cliente' : 'create_cliente'} />
          {cliente && <input type="hidden" name="id" value={cliente.id} />}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nombre <span className="text-red-500">*</span></label>
            <input type="text" name="nombre" required defaultValue={cliente?.nombre ?? ''} placeholder="Clínica Dental XYZ / Dr. Juan Pérez"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
              <select name="tipo" defaultValue={cliente?.tipo ?? 'clinica'}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="clinica">Clínica</option>
                <option value="doctor_independiente">Doctor independiente</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">RNC</label>
              <input type="text" name="rnc" defaultValue={cliente?.rnc ?? ''}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Teléfono</label>
              <input type="tel" name="telefono" defaultValue={cliente?.telefono ?? ''}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Correo</label>
              <input type="email" name="email" defaultValue={cliente?.email ?? ''}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Dirección</label>
              <input type="text" name="direccion" defaultValue={cliente?.direccion ?? ''}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
            <textarea name="notas" rows={2} defaultValue={cliente?.notas ?? ''}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>

          {fetcher.data && !fetcher.data.ok && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{fetcher.data.error}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancelar</button>
            <button type="submit" disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {isSubmitting ? 'Guardando…' : cliente ? 'Guardar cambios' : 'Crear cliente'}
            </button>
          </div>
        </fetcher.Form>
      </div>
    </div>,
    document.body
  )
}

// ─── generar factura modal ─────────────────────────────────────────────────────

function GenerarFacturaModal({ cliente, trabajos, onClose }: {
  cliente: ClienteExterno; trabajos: TrabajoExterno[]; onClose: () => void
}) {
  const fetcher = useFetcher<typeof action>()
  const isSubmitting = fetcher.state !== 'idle'
  const today = new Date().toISOString().slice(0, 10)
  const primerDiaMes = today.slice(0, 8) + '01'
  const [inicio, setInicio] = useState(primerDiaMes)
  const [fin, setFin] = useState(today)
  useEffect(() => { if (fetcher.state === 'idle' && fetcher.data?.ok) onClose() }, [fetcher.state, fetcher.data])

  const elegibles = trabajos.filter(t =>
    t.cliente_externo_id === cliente.id && t.estado === 'entregado' && !t.factura_id &&
    t.fecha_entregado && t.fecha_entregado >= inicio && t.fecha_entregado <= fin
  )
  const total = elegibles.reduce((s, t) => s + (t.precio ?? 0), 0)

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[95vh] sm:max-h-[92vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-semibold text-gray-900">Generar factura — {cliente.nombre}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <fetcher.Form method="post" className="overflow-y-auto flex-1 p-6 space-y-4">
          <input type="hidden" name="intent" value="generar_factura" />
          <input type="hidden" name="cliente_externo_id" value={cliente.id} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Desde</label>
              <input type="date" name="periodo_inicio" value={inicio} onChange={e => setInicio(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Hasta</label>
              <input type="date" name="periodo_fin" value={fin} onChange={e => setFin(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl border border-gray-200 p-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              {elegibles.length} trabajo{elegibles.length !== 1 ? 's' : ''} entregado{elegibles.length !== 1 ? 's' : ''} sin facturar en el período
            </p>
            {elegibles.length === 0 ? (
              <p className="text-sm text-gray-400">Sin trabajos elegibles en este rango.</p>
            ) : (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {elegibles.map(t => (
                  <div key={t.id} className="flex justify-between text-sm text-gray-700">
                    <span className="truncate">{t.tipo_trabajo}</span>
                    <span className="flex-shrink-0 ml-2">{t.precio != null ? fmtMoney(t.precio) : '—'}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-between text-sm font-bold text-gray-900 mt-2 pt-2 border-t border-gray-200">
              <span>Total</span><span>{fmtMoney(total)}</span>
            </div>
          </div>

          {fetcher.data && !fetcher.data.ok && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{fetcher.data.error}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancelar</button>
            <button type="submit" disabled={isSubmitting || elegibles.length === 0}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {isSubmitting ? 'Generando…' : 'Generar factura'}
            </button>
          </div>
        </fetcher.Form>
      </div>
    </div>,
    document.body
  )
}

// ─── cliente detalle modal ──────────────────────────────────────────────────────

function ClienteDetalleModal({ cliente, trabajos, clinicaNombre, onClose, onEdit }: {
  cliente: ClienteExterno; trabajos: TrabajoExterno[]; clinicaNombre: string
  onClose: () => void; onEdit: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [facturaModal, setFacturaModal] = useState(false)
  const navigation = useNavigation()
  const submit = useSubmit()
  const isDeleting = navigation.state === 'submitting'
  useEffect(() => { if (navigation.state === 'idle') setConfirmDelete(false) }, [navigation.state])

  const trabajosCliente = trabajos.filter(t => t.cliente_externo_id === cliente.id)
  const pendientesFacturar = trabajosCliente.filter(t => t.estado === 'entregado' && !t.factura_id).length

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
        onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
        <div className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[90vh]">
          <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center flex-shrink-0">
                <Building2 size={18} />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900 text-lg leading-tight">{cliente.nombre}</h2>
                <p className="text-xs text-gray-400 mt-0.5 capitalize">{cliente.tipo.replace('_', ' ')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={onEdit} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                <Pencil size={13} /> Editar
              </button>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
          </div>

          <div className="overflow-y-auto flex-1 p-6 space-y-5">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Contacto</p>
              <div className="space-y-1.5">
                {cliente.telefono && <div className="flex items-center gap-2 text-sm text-gray-700"><Phone size={14} className="text-gray-400" />{cliente.telefono}</div>}
                {cliente.email && <div className="flex items-center gap-2 text-sm text-gray-700"><Mail size={14} className="text-gray-400" />{cliente.email}</div>}
                {cliente.direccion && <div className="flex items-center gap-2 text-sm text-gray-700"><Building2 size={14} className="text-gray-400" />{cliente.direccion}</div>}
                {cliente.rnc && <p className="text-xs text-gray-400">RNC: {cliente.rnc}</p>}
                {!cliente.telefono && !cliente.email && <p className="text-sm text-gray-400">Sin datos de contacto.</p>}
              </div>
            </div>

            {cliente.notas && (
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                <p className="text-xs font-medium text-gray-500 mb-0.5">Notas</p>
                <p className="text-sm text-gray-800 whitespace-pre-line">{cliente.notas}</p>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Trabajos ({trabajosCliente.length})</p>
                {pendientesFacturar > 0 && (
                  <button onClick={() => setFacturaModal(true)}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                    <Receipt size={12} /> Generar factura ({pendientesFacturar})
                  </button>
                )}
              </div>
              {trabajosCliente.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">Sin trabajos registrados.</p>
              ) : (
                <div className="space-y-2">
                  {trabajosCliente.map(t => {
                    const { label, color, Icon } = estadoTrabajoConfig[t.estado]
                    return (
                      <div key={t.id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-gray-100">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{t.tipo_trabajo}</p>
                          <p className="text-xs text-gray-400">{fmtDate(t.fecha_recibido)}</p>
                        </div>
                        <span className={cn('flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0', color)}>
                          <Icon size={10} /> {label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="px-6 py-4 border-t border-gray-100 flex justify-end flex-shrink-0">
            <button type="button" onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
              <Trash2 size={13} /> Eliminar cliente
            </button>
          </div>
        </div>
      </div>

      {confirmDelete && (
        <ConfirmDeleteModal
          title="Eliminar cliente externo"
          itemLabel={cliente.nombre}
          description={`Tiene ${trabajosCliente.length} trabajo(s) asociado(s). Esta acción no se puede deshacer.`}
          isSubmitting={isDeleting}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => submit({ intent: 'delete_cliente', id: cliente.id }, { method: 'post' })}
        />
      )}
      {facturaModal && (
        <GenerarFacturaModal cliente={cliente} trabajos={trabajos} onClose={() => setFacturaModal(false)} />
      )}
    </>,
    document.body
  )
}

// ─── trabajo form modal ─────────────────────────────────────────────────────────

function TrabajoFormModal({ trabajo, clientes, onClose }: {
  trabajo: TrabajoExterno | null; clientes: ClienteExterno[]; onClose: () => void
}) {
  const fetcher = useFetcher<typeof action>()
  const fotoFetcher = useFetcher<typeof action>()
  const isSubmitting = fetcher.state !== 'idle'
  useEffect(() => { if (fetcher.state === 'idle' && fetcher.data?.ok) onClose() }, [fetcher.state, fetcher.data])

  const [clienteId, setClienteId] = useState(trabajo?.cliente_externo_id ?? '')
  const [extraClientes, setExtraClientes] = useState<ClienteExterno[]>([])
  const [showClienteModal, setShowClienteModal] = useState(false)
  const clientesDisponibles = [...clientes, ...extraClientes.filter(e => !clientes.some(c => c.id === e.id))]

  return createPortal(
    <>
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full sm:max-w-xl bg-white rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[95vh] sm:max-h-[92vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-semibold text-gray-900">{trabajo ? 'Editar trabajo' : 'Nuevo trabajo externo'}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <fetcher.Form method="post" className="overflow-y-auto flex-1 p-6 space-y-4">
          <input type="hidden" name="intent" value={trabajo ? 'update_trabajo' : 'create_trabajo'} />
          {trabajo && <input type="hidden" name="id" value={trabajo.id} />}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-gray-600">Cliente externo <span className="text-red-500">*</span></label>
              <button type="button" onClick={() => setShowClienteModal(true)}
                className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700">
                <Plus size={12} /> Nuevo cliente
              </button>
            </div>
            <select name="cliente_externo_id" required value={clienteId} onChange={e => setClienteId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— Seleccionar —</option>
              {clientesDisponibles.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de trabajo <span className="text-red-500">*</span></label>
              <input type="text" name="tipo_trabajo" required list="tipos-trabajo-externo-list"
                defaultValue={trabajo?.tipo_trabajo ?? ''} placeholder="Corona, Puente…"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <datalist id="tipos-trabajo-externo-list">
                {TIPOS_TRABAJO.map(t => <option key={t} value={t} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Material</label>
              <input type="text" name="material" defaultValue={trabajo?.material ?? ''} placeholder="Zirconia, E-max…"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Referencia del paciente</label>
              <input type="text" name="paciente_referencia" defaultValue={trabajo?.paciente_referencia ?? ''} placeholder="Nombre o iniciales"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Precio</label>
              <input type="number" name="precio" min={0} step={1} defaultValue={trabajo?.precio ?? ''} placeholder="0"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fecha de recibido</label>
              <input type="date" name="fecha_recibido" defaultValue={trabajo?.fecha_recibido ?? new Date().toISOString().slice(0, 10)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fecha prometida</label>
              <input type="date" name="fecha_prometida" defaultValue={trabajo?.fecha_prometida ?? ''}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
            <textarea name="notas" rows={2} defaultValue={trabajo?.notas ?? ''} placeholder="Instrucciones especiales…"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>

          {fetcher.data && !fetcher.data.ok && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{fetcher.data.error}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancelar</button>
            <button type="submit" disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {isSubmitting ? 'Guardando…' : trabajo ? 'Guardar cambios' : 'Crear trabajo'}
            </button>
          </div>
        </fetcher.Form>

        {trabajo && (
          <div className="border-t border-gray-100 p-6 space-y-3 flex-shrink-0">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Fotos</p>
            <fotoFetcher.Form method="post" encType="multipart/form-data" className="flex items-center gap-2">
              <input type="hidden" name="intent" value="upload_foto_trabajo" />
              <input type="hidden" name="trabajo_id" value={trabajo.id} />
              <input type="file" name="archivo" accept="image/*"
                className="flex-1 text-xs text-gray-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
              <button type="submit" disabled={fotoFetcher.state !== 'idle'}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors">
                <Upload size={12} /> {fotoFetcher.state !== 'idle' ? 'Subiendo…' : 'Subir'}
              </button>
            </fotoFetcher.Form>
            {fotoFetcher.data && !fotoFetcher.data.ok && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{fotoFetcher.data.error}</p>
            )}
            {trabajo.fotos.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {trabajo.fotos.map(url => (
                  <div key={url} className="relative group">
                    <a href={url} target="_blank" rel="noreferrer">
                      <img src={url} alt="Foto del trabajo" className="w-full h-16 object-cover rounded-lg border border-gray-200 hover:opacity-90 transition-opacity" />
                    </a>
                    <fotoFetcher.Form method="post" className="absolute -top-1.5 -right-1.5">
                      <input type="hidden" name="intent" value="delete_foto_trabajo" />
                      <input type="hidden" name="trabajo_id" value={trabajo.id} />
                      <input type="hidden" name="url" value={url} />
                      <button type="submit" className="w-5 h-5 flex items-center justify-center bg-white rounded-full border border-gray-200 text-gray-500 hover:text-red-600 shadow-sm">
                        <X size={11} />
                      </button>
                    </fotoFetcher.Form>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>

    {showClienteModal && (
      <ClienteFormModal
        cliente={null}
        onClose={() => setShowClienteModal(false)}
        onCreated={c => { setExtraClientes(prev => [...prev, c]); setClienteId(c.id) }}
      />
    )}
    </>,
    document.body
  )
}

// ─── trabajo detalle modal ──────────────────────────────────────────────────────

function TrabajoDetalleModal({ trabajo, clinicaNombre, onClose, onEdit }: {
  trabajo: TrabajoExterno; clinicaNombre: string; onClose: () => void; onEdit: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const navigation = useNavigation()
  const submit = useSubmit()
  useCloseOnSubmit(() => { setConfirmDelete(false); onClose() })
  const { label, color, Icon } = estadoTrabajoConfig[trabajo.estado]

  async function handlePrint() {
    const w = window.open('', '_blank', 'width=600,height=800')
    if (!w) { alert('Permite ventanas emergentes para imprimir'); return }
    const QRCode = (await import('qrcode')).default
    const qrUrl = `${window.location.origin}/verificar-trabajo/${trabajo.id}?token=${trabajo.verification_token}`
    const qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 120, margin: 1, color: { dark: '#1e293b', light: '#ffffff' } })
    w.document.write(buildTrabajoHtml(trabajo, qrDataUrl, clinicaNombre))
    w.document.close()
    w.focus()
  }

  return createPortal(
    <>
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[90vh]">
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100 flex-shrink-0">
          <div className="min-w-0">
            <span className={cn('inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold', color)}>
              <Icon size={11} /> {label}
            </span>
            <h2 className="font-semibold text-gray-900 text-lg mt-2 leading-tight">{trabajo.tipo_trabajo}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{trabajo.clientes_externos?.nombre ?? 'Sin cliente'}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={onEdit} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              <Pencil size={13} /> Editar
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            {trabajo.material && (
              <div><p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-0.5">Material</p>
                <p className="text-sm text-gray-900">{trabajo.material}</p></div>
            )}
            {trabajo.paciente_referencia && (
              <div><p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-0.5">Referencia del paciente</p>
                <p className="text-sm text-gray-900">{trabajo.paciente_referencia}</p></div>
            )}
            {trabajo.precio != null && (
              <div><p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-0.5">Precio</p>
                <p className="text-sm text-gray-900 font-semibold">{fmtMoney(trabajo.precio)}</p></div>
            )}
            <div><p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-0.5">Facturación</p>
              <p className="text-sm text-gray-900">{trabajo.factura_id ? 'Facturado' : 'Sin facturar'}</p></div>
            <div><p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-0.5">Fecha de recibido</p>
              <p className="text-sm text-gray-900">{fmtDate(trabajo.fecha_recibido)}</p></div>
            {trabajo.fecha_prometida && (
              <div><p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-0.5">Fecha prometida</p>
                <p className="text-sm text-gray-900">{fmtDate(trabajo.fecha_prometida)}</p></div>
            )}
            {trabajo.fecha_entregado && (
              <div><p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-0.5">Fecha de entrega</p>
                <p className="text-sm text-gray-900">{fmtDate(trabajo.fecha_entregado)}</p></div>
            )}
          </div>

          {trabajo.notas && (
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
              <p className="text-xs font-medium text-gray-500 mb-0.5">Notas</p>
              <p className="text-sm text-gray-800 whitespace-pre-line">{trabajo.notas}</p>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Fotos ({trabajo.fotos.length})</p>
            {trabajo.fotos.length === 0 ? (
              <p className="text-sm text-gray-400">Sin fotos adjuntas.</p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {trabajo.fotos.map(url => (
                  <a key={url} href={url} target="_blank" rel="noreferrer">
                    <img src={url} alt="Foto del trabajo" className="w-full h-16 object-cover rounded-lg border border-gray-200 hover:opacity-90 transition-opacity" />
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 flex-shrink-0">
          <button onClick={handlePrint} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <Printer size={13} /> Imprimir ficha
          </button>
          <button onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
            <Trash2 size={13} /> Eliminar
          </button>
        </div>
      </div>
    </div>

    {confirmDelete && (
      <ConfirmDeleteModal
        title="Eliminar trabajo"
        itemLabel={trabajo.tipo_trabajo}
        description={`${trabajo.clientes_externos?.nombre ?? 'Sin cliente'}. Esta acción no se puede deshacer.`}
        isSubmitting={navigation.state === 'submitting'}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => submit({ intent: 'delete_trabajo', id: trabajo.id }, { method: 'post' })}
      />
    )}
    </>,
    document.body
  )
}

// ─── trabajo card ───────────────────────────────────────────────────────────────

function TrabajoCard({ trabajo, clinicaNombre, onView, onEdit }: {
  trabajo: TrabajoExterno; clinicaNombre: string; onView: () => void; onEdit: () => void
}) {
  const cambiarEstadoFetcher = useFetcher()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const navigation = useNavigation()
  const submit = useSubmit()
  useCloseOnSubmit(() => setConfirmDelete(false))
  const { label, color, Icon } = estadoTrabajoConfig[trabajo.estado]

  async function handlePrint() {
    const w = window.open('', '_blank', 'width=600,height=800')
    if (!w) { alert('Permite ventanas emergentes para imprimir'); return }
    const QRCode = (await import('qrcode')).default
    const qrUrl = `${window.location.origin}/verificar-trabajo/${trabajo.id}?token=${trabajo.verification_token}`
    const qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 120, margin: 1, color: { dark: '#1e293b', light: '#ffffff' } })
    w.document.write(buildTrabajoHtml(trabajo, qrDataUrl, clinicaNombre))
    w.document.close()
    w.focus()
  }

  function cambiarEstado(nuevoEstado: EstadoTrabajo) {
    cambiarEstadoFetcher.submit({ intent: 'cambiar_estado_trabajo', id: trabajo.id, estado: nuevoEstado }, { method: 'post' })
  }

  return (
    <div onClick={onView}
      className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col gap-3 transition-shadow hover:shadow-md cursor-pointer">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold mb-1.5', color)}>
            <Icon size={10} /> {label}
          </span>
          <p className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2">{trabajo.tipo_trabajo}</p>
          <p className="text-xs text-gray-500 mt-0.5">{trabajo.clientes_externos?.nombre ?? '—'}</p>
          {trabajo.paciente_referencia && <p className="text-xs text-gray-400">{trabajo.paciente_referencia}</p>}
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
          <button type="button" onClick={handlePrint} title="Imprimir ficha"
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"><Printer size={13} /></button>
          <button type="button" onClick={onEdit}
            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Pencil size={13} /></button>
          <button type="button" onClick={() => setConfirmDelete(true)}
            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={13} /></button>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1 text-gray-500">
          <Calendar size={11} />
          {trabajo.fecha_prometida ? `Prometido ${fmtDate(trabajo.fecha_prometida)}` : `Recibido ${fmtDate(trabajo.fecha_recibido)}`}
        </div>
        {trabajo.precio != null && <span className="font-medium text-gray-700">{fmtMoney(trabajo.precio)}</span>}
      </div>

      {trabajo.estado !== 'entregado' && (
        <div className="flex gap-2 pt-1 border-t border-gray-50" onClick={e => e.stopPropagation()}>
          {trabajo.estado === 'recibido' && (
            <button type="button" onClick={() => cambiarEstado('en_proceso')} disabled={cambiarEstadoFetcher.state !== 'idle'}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors disabled:opacity-50">
              <Clock size={12} /> Iniciar
            </button>
          )}
          {trabajo.estado === 'en_proceso' && (
            <button type="button" onClick={() => cambiarEstado('terminado')} disabled={cambiarEstadoFetcher.state !== 'idle'}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-50">
              <CheckCircle size={12} /> Marcar terminado
            </button>
          )}
          {trabajo.estado === 'terminado' && (
            <button type="button" onClick={() => cambiarEstado('entregado')} disabled={cambiarEstadoFetcher.state !== 'idle'}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors disabled:opacity-50">
              <Package size={12} /> Marcar entregado
            </button>
          )}
        </div>
      )}
      {trabajo.estado === 'entregado' && (
        <p className="text-xs text-gray-400 border-t border-gray-50 pt-2">
          {trabajo.factura_id ? 'Facturado' : 'Entregado, sin facturar'}
          {trabajo.fecha_entregado ? ` · ${fmtDate(trabajo.fecha_entregado)}` : ''}
        </p>
      )}

      {confirmDelete && (
        <ConfirmDeleteModal
          title="Eliminar trabajo"
          itemLabel={trabajo.tipo_trabajo}
          description={`${trabajo.clientes_externos?.nombre ?? 'Sin cliente'}. Esta acción no se puede deshacer.`}
          isSubmitting={navigation.state === 'submitting'}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => submit({ intent: 'delete_trabajo', id: trabajo.id }, { method: 'post' })}
        />
      )}
    </div>
  )
}

// ─── factura detalle modal ──────────────────────────────────────────────────────

function FacturaDetalleModal({ factura, trabajos, clinicaNombre, onClose }: {
  factura: FacturaExterna; trabajos: TrabajoExterno[]; clinicaNombre: string; onClose: () => void
}) {
  const fetcher = useFetcher()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const navigation = useNavigation()
  const submit = useSubmit()
  useCloseOnSubmit(() => { setConfirmDelete(false); onClose() })
  const trabajosFactura = trabajos.filter(t => t.factura_id === factura.id)
  const { label, color } = estadoFacturaConfig[factura.estado]

  async function handlePrint() {
    const w = window.open('', '_blank', 'width=760,height=900')
    if (!w) { alert('Permite ventanas emergentes para imprimir'); return }
    const QRCode = (await import('qrcode')).default
    const qrUrl = `${window.location.origin}/verificar-factura/${factura.id}?token=${factura.verification_token}`
    const qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 120, margin: 1, color: { dark: '#1e293b', light: '#ffffff' } })
    w.document.write(buildFacturaExternaHtml(factura, trabajosFactura, qrDataUrl, clinicaNombre))
    w.document.close()
    w.focus()
  }

  function marcarPagada() {
    fetcher.submit({ intent: 'marcar_pagada_factura', id: factura.id }, { method: 'post' })
  }

  return createPortal(
    <>
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[90vh]">
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100 flex-shrink-0">
          <div>
            <span className={cn('inline-flex px-2.5 py-1 rounded-full text-xs font-semibold', color)}>{label}</span>
            <h2 className="font-semibold text-gray-900 text-lg mt-2 leading-tight">{factura.clientes_externos?.nombre ?? '—'}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{fmtDate(factura.periodo_inicio)} – {fmtDate(factura.periodo_fin)}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          <p className="text-3xl font-extrabold text-gray-900">{fmtMoney(factura.total)}</p>

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Trabajos incluidos ({trabajosFactura.length})</p>
            <div className="space-y-1.5">
              {trabajosFactura.map(t => (
                <div key={t.id} className="flex justify-between text-sm">
                  <span className="text-gray-700 truncate">{t.tipo_trabajo}</span>
                  <span className="text-gray-500 flex-shrink-0 ml-2">{t.precio != null ? fmtMoney(t.precio) : '—'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 flex-shrink-0">
          <button onClick={handlePrint} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <Printer size={13} /> Imprimir
          </button>
          {factura.estado === 'pendiente' && (
            <button onClick={marcarPagada} disabled={fetcher.state !== 'idle'}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors">
              <CheckCircle size={13} /> Marcar pagada
            </button>
          )}
          <button onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
            <Trash2 size={13} /> Eliminar
          </button>
        </div>
      </div>
    </div>

    {confirmDelete && (
      <ConfirmDeleteModal
        title="Eliminar factura"
        itemLabel={factura.clientes_externos?.nombre ?? '—'}
        description={`${fmtMoney(factura.total)} · ${trabajosFactura.length} trabajo(s). Los trabajos incluidos volverán a quedar disponibles para facturar. Esta acción no se puede deshacer.`}
        isSubmitting={navigation.state === 'submitting'}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => submit({ intent: 'delete_factura', id: factura.id }, { method: 'post' })}
      />
    )}
    </>,
    document.body
  )
}

// ─── page ─────────────────────────────────────────────────────────────────────

type TabId = 'trabajos' | 'clientes' | 'facturas'

export default function TrabajosExternos({ loaderData }: Route.ComponentProps) {
  const { clinicaNombre, clientes, trabajos, facturas } = loaderData
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = (searchParams.get('tab') ?? 'trabajos') as TabId
  function setTab(t: TabId) { setSearchParams(prev => { prev.set('tab', t); return prev }, { replace: true }) }

  const [estadoFiltro, setEstadoFiltro] = useState<'todas' | EstadoTrabajo>('todas')
  const [clienteQuery, setClienteQuery] = useState('')
  const [trabajoModal, setTrabajoModal] = useState<{ open: boolean; trabajo: TrabajoExterno | null }>({ open: false, trabajo: null })
  const [clienteModal, setClienteModal] = useState<{ open: boolean; cliente: ClienteExterno | null }>({ open: false, cliente: null })
  const [clienteDetalle, setClienteDetalle] = useState<ClienteExterno | null>(null)
  const [facturaDetalle, setFacturaDetalle] = useState<FacturaExterna | null>(null)
  const [trabajoDetalle, setTrabajoDetalle] = useState<TrabajoExterno | null>(null)
  const [nuevaFacturaClienteId, setNuevaFacturaClienteId] = useState('')
  const [generarFacturaCliente, setGenerarFacturaCliente] = useState<ClienteExterno | null>(null)

  useEffect(() => {
    if (clienteDetalle) {
      const updated = clientes.find(c => c.id === clienteDetalle.id)
      setClienteDetalle(updated ?? null)
    }
  }, [clientes])

  useEffect(() => {
    if (trabajoModal.open && trabajoModal.trabajo) {
      const updated = trabajos.find(t => t.id === trabajoModal.trabajo!.id)
      if (updated) setTrabajoModal(m => ({ ...m, trabajo: updated }))
    }
  }, [trabajos])

  useEffect(() => {
    if (trabajoDetalle) {
      const updated = trabajos.find(t => t.id === trabajoDetalle.id)
      setTrabajoDetalle(updated ?? null)
    }
  }, [trabajos])

  useEffect(() => {
    if (facturaDetalle) {
      const updated = facturas.find(f => f.id === facturaDetalle.id)
      setFacturaDetalle(updated ?? null)
    }
  }, [facturas])

  const trabajosFiltrados = estadoFiltro === 'todas' ? trabajos : trabajos.filter(t => t.estado === estadoFiltro)
  const clientesFiltrados = clientes.filter(c => c.nombre.toLowerCase().includes(clienteQuery.toLowerCase()))
  const clientesConPendientes = clientes.filter(c =>
    trabajos.some(t => t.cliente_externo_id === c.id && t.estado === 'entregado' && !t.factura_id)
  )

  const tabs: { id: TabId; label: string; icon: any }[] = [
    { id: 'trabajos', label: `Trabajos (${trabajos.length})`, icon: Wrench },
    { id: 'clientes', label: `Clientes (${clientes.length})`, icon: Building2 },
    { id: 'facturas', label: `Facturas (${facturas.length})`, icon: DollarSign },
  ]

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Trabajos externos</h1>
        {tab === 'trabajos' && (
          <button onClick={() => setTrabajoModal({ open: true, trabajo: null })}
            className="flex items-center gap-2 px-3 py-2 md:px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
            <Plus size={16} /><span className="hidden sm:inline">Nuevo trabajo</span><span className="sm:hidden">Nuevo</span>
          </button>
        )}
        {tab === 'clientes' && (
          <button onClick={() => setClienteModal({ open: true, cliente: null })}
            className="flex items-center gap-2 px-3 py-2 md:px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
            <Plus size={16} /><span className="hidden sm:inline">Nuevo cliente</span><span className="sm:hidden">Nuevo</span>
          </button>
        )}
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-4 w-fit">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              tab === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {tab === 'trabajos' && (
        <>
          <div className="flex gap-1 mb-4 overflow-x-auto">
            {(['todas', 'recibido', 'en_proceso', 'terminado', 'entregado'] as const).map(e => (
              <button key={e} onClick={() => setEstadoFiltro(e)}
                className={cn('px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap flex-shrink-0 capitalize',
                  estadoFiltro === e ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
                {e === 'todas' ? 'Todas' : estadoTrabajoConfig[e].label}
              </button>
            ))}
          </div>
          {trabajosFiltrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <p className="text-sm font-medium text-gray-400">Sin trabajos en este filtro.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {trabajosFiltrados.map(t => (
                <TrabajoCard key={t.id} trabajo={t} clinicaNombre={clinicaNombre}
                  onView={() => setTrabajoDetalle(t)}
                  onEdit={() => setTrabajoModal({ open: true, trabajo: t })} />
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'clientes' && (
        <div>
          <div className="relative mb-4 max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Buscar cliente…" value={clienteQuery} onChange={e => setClienteQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
            {clientesFiltrados.length === 0 ? (
              <div className="px-4 py-12 text-center text-gray-400">Sin clientes externos registrados.</div>
            ) : clientesFiltrados.map(c => {
              const pendientes = trabajos.filter(t => t.cliente_externo_id === c.id && t.estado !== 'entregado').length
              return (
                <div key={c.id} onClick={() => setClienteDetalle(c)}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors">
                  <div className="w-9 h-9 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center flex-shrink-0">
                    <Building2 size={15} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{c.nombre}</p>
                    <p className="text-xs text-gray-400 truncate">{c.telefono ?? c.email ?? 'Sin contacto'}</p>
                  </div>
                  {pendientes > 0 && (
                    <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 flex-shrink-0">
                      {pendientes} pendiente{pendientes !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {tab === 'facturas' && (
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <select value={nuevaFacturaClienteId} onChange={e => setNuevaFacturaClienteId(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">
                {clientesConPendientes.length === 0 ? 'Sin trabajos entregados pendientes de facturar' : 'Elegir cliente para facturar…'}
              </option>
              {clientesConPendientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <button
              disabled={!nuevaFacturaClienteId}
              onClick={() => {
                const cliente = clientes.find(c => c.id === nuevaFacturaClienteId)
                if (cliente) { setGenerarFacturaCliente(cliente); setNuevaFacturaClienteId('') }
              }}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              <Receipt size={14} /> Generar factura
            </button>
          </div>
          {clientesConPendientes.length === 0 && facturas.length === 0 && (
            <p className="text-xs text-gray-400 mb-3">
              Una factura solo se puede generar para clientes con al menos un trabajo en estado "Entregado" que aún no esté facturado.
            </p>
          )}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
          {facturas.length === 0 ? (
            <div className="px-4 py-12 text-center text-gray-400">Sin facturas generadas.</div>
          ) : facturas.map(f => {
            const { label, color } = estadoFacturaConfig[f.estado]
            return (
              <div key={f.id} onClick={() => setFacturaDetalle(f)}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{f.clientes_externos?.nombre ?? '—'}</p>
                  <p className="text-xs text-gray-400">{fmtDate(f.periodo_inicio)} – {fmtDate(f.periodo_fin)}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-gray-900">{fmtMoney(f.total)}</p>
                  <span className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-medium', color)}>{label}</span>
                </div>
              </div>
            )
          })}
          </div>
        </div>
      )}

      {trabajoModal.open && (
        <TrabajoFormModal trabajo={trabajoModal.trabajo} clientes={clientes}
          onClose={() => setTrabajoModal({ open: false, trabajo: null })} />
      )}
      {clienteModal.open && (
        <ClienteFormModal cliente={clienteModal.cliente} onClose={() => setClienteModal({ open: false, cliente: null })} />
      )}
      {clienteDetalle && (
        <ClienteDetalleModal cliente={clienteDetalle} trabajos={trabajos} clinicaNombre={clinicaNombre}
          onClose={() => setClienteDetalle(null)}
          onEdit={() => { setClienteModal({ open: true, cliente: clienteDetalle }); setClienteDetalle(null) }} />
      )}
      {facturaDetalle && (
        <FacturaDetalleModal factura={facturaDetalle} trabajos={trabajos} clinicaNombre={clinicaNombre}
          onClose={() => setFacturaDetalle(null)} />
      )}
      {generarFacturaCliente && (
        <GenerarFacturaModal cliente={generarFacturaCliente} trabajos={trabajos}
          onClose={() => setGenerarFacturaCliente(null)} />
      )}
      {trabajoDetalle && (
        <TrabajoDetalleModal trabajo={trabajoDetalle} clinicaNombre={clinicaNombre}
          onClose={() => setTrabajoDetalle(null)}
          onEdit={() => { setTrabajoModal({ open: true, trabajo: trabajoDetalle }); setTrabajoDetalle(null) }} />
      )}
    </div>
  )
}
