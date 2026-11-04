import type { Route } from './+types/verificar-receta.$id'
import { createSupabaseAdminClient } from '~/lib/supabase.admin.server'
import { CheckCircle, XCircle, ShieldCheck } from 'lucide-react'

type RecetaPublica = {
  id: string
  numero: number
  fecha: string
  estado: 'emitida' | 'anulada'
  snapshot: {
    clinica?: { nombre?: string }
    doctor?: { nombre?: string; exequatur?: string; especialidad?: string | null }
  }
}

export function meta({ data }: Route.MetaArgs) {
  if (!data?.receta) return [{ title: 'Verificación de receta — Dentalgest' }]
  return [{ title: `Receta #${String((data.receta as RecetaPublica).numero).padStart(4, '0')} — Verificación` }]
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const id = params.id as string
  const token = new URL(request.url).searchParams.get('token')
  if (!id || !token || token.length > 100) return { receta: null }

  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('prescripciones')
      .select('id,numero,fecha,estado,snapshot')
      .eq('id', id)
      .eq('verification_token', token)
      .maybeSingle()
    if (error) return { receta: null }
    return { receta: data as RecetaPublica | null }
  } catch {
    return { receta: null }
  }
}

function fechaLarga(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-DO', { dateStyle: 'long' })
}

export default function VerificarReceta({ loaderData }: Route.ComponentProps) {
  const { receta } = loaderData

  if (!receta) {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <section className="w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden text-center">
          <div className="bg-red-600 px-6 py-8">
            <XCircle size={40} className="text-white mx-auto mb-2" />
            <h1 className="text-white font-bold text-lg">Receta no encontrada</h1>
            <p className="text-red-100 text-sm mt-1">El código no es válido o la receta no existe.</p>
          </div>
          <p className="px-6 py-6 text-sm text-gray-500">Si tienes dudas, contacta directamente a la clínica.</p>
        </section>
      </main>
    )
  }

  const snapshot = receta.snapshot ?? {}
  const clinica = snapshot.clinica?.nombre || 'Clínica'
  const doctor = snapshot.doctor

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <section className="w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden">
        <header className="bg-slate-900 px-6 py-7 text-center">
          <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-3">
            <ShieldCheck size={26} className="text-white" />
          </div>
          <h1 className="text-white font-bold text-lg">{clinica}</h1>
          <p className="text-slate-300 text-xs mt-1">Verificación de receta médica</p>
        </header>

        {receta.estado === 'emitida' ? (
          <div className="flex items-center justify-center gap-2 bg-green-50 border-b border-green-100 px-4 py-3">
            <CheckCircle size={17} className="text-green-600" />
            <p className="text-sm font-semibold text-green-700">Receta auténtica · Vigente</p>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 bg-red-50 border-b border-red-100 px-4 py-3">
            <XCircle size={17} className="text-red-600" />
            <p className="text-sm font-semibold text-red-700">Receta auténtica · Anulada</p>
          </div>
        )}

        <div className="px-6 py-5 space-y-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-1">Folio</p>
            <p className="text-lg font-bold text-gray-900">#{String(receta.numero).padStart(4, '0')}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-1">Fecha de emisión</p>
            <p className="text-sm text-gray-800">{fechaLarga(receta.fecha)}</p>
          </div>
          {doctor && (
            <div>
              <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-1">Profesional emisor</p>
              <p className="text-sm font-semibold text-gray-900">{doctor.nombre}</p>
              {doctor.especialidad && <p className="text-xs text-gray-600">{doctor.especialidad}</p>}
              {doctor.exequatur && <p className="text-xs text-gray-600">Exequátur: {doctor.exequatur}</p>}
            </div>
          )}
        </div>

        <footer className="px-6 py-4 bg-slate-50 border-t border-gray-100 text-center">
          <p className="text-[10px] text-gray-500 leading-relaxed">
            Esta consulta confirma la autenticidad y el estado de la receta. Por privacidad,
            no muestra datos del paciente ni medicamentos prescritos.
          </p>
          <p className="mt-3 text-[10px] text-gray-400 font-semibold tracking-widest uppercase">Dentalgest</p>
        </footer>
      </section>
    </main>
  )
}
