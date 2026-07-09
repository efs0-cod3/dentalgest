import { useState, useMemo, useEffect } from 'react'
import { useLoaderData, useNavigate, useNavigation, useSubmit } from 'react-router'
import type { Route } from './+types/pacientes'
import { createSupabaseServerClient } from '~/lib/supabase.server'
import { getClinicaId } from '~/lib/clinica.server'
import { buildPacienteData } from '~/lib/pacientes.server'
import { Plus, Pencil, Trash2, Search, User } from 'lucide-react'
import { cn } from '~/lib/utils'
import { ConfirmDeleteModal } from '~/components/ConfirmDeleteModal'
import { PacienteEditModal } from '~/components/PacienteEditModal'

// ─── types ────────────────────────────────────────────────────────────────────

type CitaPaciente = { id: string }
type ExpedienteEntrada = { id: string }
type Documento = { id: string }
type Paciente = {
  id: string; nombre: string; telefono: string | null; email: string | null; created_at: string
  fecha_nacimiento: string | null; cedula: string | null; genero: string | null; direccion: string | null
  tipo_sangre: string | null; alergias: string | null; antecedentes_medicos: string | null
  contacto_emergencia_nombre: string | null; contacto_emergencia_telefono: string | null
  contacto_emergencia_relacion: string | null
  citas: CitaPaciente[]; expediente_entradas: ExpedienteEntrada[]; documentos: Documento[]
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function initials(n: string) { return n.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() }

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Pacientes — Nin Dental Clinic' }]
}

// ─── loader ───────────────────────────────────────────────────────────────────

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request)
  const clinicaId = await getClinicaId(request)
  const { data } = await supabase.from('pacientes').select(`
      id, nombre, telefono, email, created_at,
      fecha_nacimiento, cedula, genero, direccion,
      tipo_sangre, alergias, antecedentes_medicos,
      contacto_emergencia_nombre, contacto_emergencia_telefono, contacto_emergencia_relacion,
      citas(id),
      expediente_entradas(id),
      documentos(id)
    `).eq('clinica_id', clinicaId).order('nombre')
  return { pacientes: (data ?? []) as Paciente[] }
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

  const pacienteData = buildPacienteData(fd, clinicaId)
  if (intent === 'create') await supabase.from('pacientes').insert(pacienteData)
  else if (intent === 'update')
    await supabase.from('pacientes').update(pacienteData).eq('id', fd.get('id') as string).eq('clinica_id', clinicaId)
  return { ok: true }
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function Pacientes() {
  const { pacientes } = useLoaderData<typeof loader>()
  const navigate = useNavigate()
  const navigation = useNavigation()
  const submit = useSubmit()
  const [query, setQuery] = useState('')
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
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => navigate(`/dashboard/pacientes/${p.id}`)}>
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
                <div key={p.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/dashboard/pacientes/${p.id}`)}>
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
