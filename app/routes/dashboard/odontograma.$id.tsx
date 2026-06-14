import { useState } from 'react'
import { useLoaderData, useFetcher, Link } from 'react-router'
import type { Route } from './+types/odontograma.$id'
import { createSupabaseServerClient } from '~/lib/supabase.server'
import { getClinicaId } from '~/lib/clinica.server'
import { Odontograma } from '~/components/Odontograma'
import type { OdontogramaData } from '~/components/Odontograma'
import { ChevronLeft, Save, CheckCircle } from 'lucide-react'
import { cn } from '~/lib/utils'

// ─── Meta ─────────────────────────────────────────────────────────────────────

export function meta({ data }: Route.MetaArgs) {
  const name = (data as any)?.paciente?.nombre ?? 'Paciente'
  return [{ title: `Odontograma — ${name} — Nin Dental` }]
}

// ─── Loader ───────────────────────────────────────────────────────────────────

export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request)
  const clinicaId = await getClinicaId(request)
  const pacienteId = params.id as string

  const [{ data: paciente }, { data: odontograma }] = await Promise.all([
    supabase
      .from('pacientes')
      .select('id, nombre, fecha_nacimiento, tipo_sangre')
      .eq('id', pacienteId)
      .eq('clinica_id', clinicaId)
      .single(),
    supabase
      .from('odontogramas')
      .select('id, datos, notas, updated_at')
      .eq('paciente_id', pacienteId)
      .eq('clinica_id', clinicaId)
      .maybeSingle(),
  ])

  return {
    paciente: paciente as { id: string; nombre: string; fecha_nacimiento: string | null; tipo_sangre: string | null } | null,
    odontograma: odontograma as { id: string; datos: OdontogramaData; notas: string | null; updated_at: string } | null,
  }
}

// ─── Action ───────────────────────────────────────────────────────────────────

export async function action({ request, params }: Route.ActionArgs) {
  const { supabase } = createSupabaseServerClient(request)
  const clinicaId = await getClinicaId(request)
  const pacienteId = params.id as string
  const fd = await request.formData()

  const datos: OdontogramaData = JSON.parse(fd.get('datos') as string)
  const notas = (fd.get('notas') as string) ?? ''
  const existingId = fd.get('odontograma_id') as string | null

  if (existingId) {
    await supabase
      .from('odontogramas')
      .update({ datos, notas, updated_at: new Date().toISOString() })
      .eq('id', existingId)
  } else {
    await supabase
      .from('odontogramas')
      .insert({ paciente_id: pacienteId, clinica_id: clinicaId, datos, notas })
  }

  return { ok: true, ts: Date.now() }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OdontogramaPage() {
  const { paciente, odontograma } = useLoaderData<typeof loader>()
  const fetcher = useFetcher<typeof action>()

  const [data, setData] = useState<OdontogramaData>(odontograma?.datos ?? {})
  const [notas, setNotas] = useState(odontograma?.notas ?? '')

  const saving = fetcher.state !== 'idle'
  const saved = fetcher.data?.ok === true && fetcher.state === 'idle'

  function handleSave() {
    const form: Record<string, string> = {
      datos: JSON.stringify(data),
      notas,
    }
    if (odontograma?.id) form.odontograma_id = odontograma.id
    fetcher.submit(form, { method: 'post' })
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            to="/dashboard/pacientes"
            className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 shrink-0"
          >
            <ChevronLeft size={15} />
            Pacientes
          </Link>
          <span className="text-gray-200 shrink-0">/</span>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-semibold text-gray-900 truncate">
              Odontograma — {paciente?.nombre ?? 'Paciente'}
            </h1>
            {paciente?.fecha_nacimiento && (
              <p className="text-xs text-gray-400">
                Nac. {new Date(paciente.fecha_nacimiento).toLocaleDateString('es-DO', { dateStyle: 'medium' })}
                {paciente.tipo_sangre ? ` · ${paciente.tipo_sangre}` : ''}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {saved && (
            <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
              <CheckCircle size={13} /> Guardado
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all',
              saving
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm hover:shadow'
            )}
          >
            <Save size={14} />
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>

      {/* Odontogram */}
      <Odontograma value={data} onChange={setData} />

      {/* Notes */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Observaciones</label>
        <textarea
          value={notas}
          onChange={e => setNotas(e.target.value)}
          rows={3}
          placeholder="Notas adicionales sobre el estado bucal del paciente…"
          className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Last saved note */}
      {odontograma?.updated_at && (
        <p className="text-xs text-gray-400">
          Última actualización: {new Date(odontograma.updated_at).toLocaleString('es-DO', { dateStyle: 'medium', timeStyle: 'short' })}
        </p>
      )}
    </div>
  )
}
