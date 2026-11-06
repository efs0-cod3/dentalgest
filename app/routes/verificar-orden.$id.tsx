import type { Route } from './+types/verificar-orden.$id'
import { createSupabaseAdminClient } from '~/lib/supabase.admin.server'
import { ClipboardList, XCircle, CheckCircle2, Clock } from 'lucide-react'

// Página pública de la orden de laboratorio: a dónde lleva el QR de la
// tablilla impresa.
//
// A diferencia de la verificación de recetas, que esconde a propósito todo
// dato clínico, aquí SÍ se muestra el trabajo: el objetivo es que el
// supervisor del laboratorio, que no tiene cuenta en el sistema, pueda
// consultar las indicaciones desde el teléfono en vez de depender del papel.
// Es la misma información que ya lleva impresa la hoja que tiene en la mano.
//
// El acceso lo controla el token, que es aleatorio e independiente del id:
// sin él no se devuelve nada, y conocer el id de una orden no sirve.

type OrdenPublica = {
  id: string
  titulo: string
  laboratorio: string | null
  tipo_trabajo: string | null
  color_dental: string | null
  doctor: string | null
  fecha_solicitud: string
  fecha_prometida: string | null
  fecha_entrega: string | null
  estado: string
  notas: string | null
  pacientes: { nombre: string } | null
  clinicas: { nombre: string } | null
}

export function meta({ data }: Route.MetaArgs) {
  const orden = data?.orden as OrdenPublica | null | undefined
  if (!orden) return [{ title: 'Orden no encontrada' }]
  return [{ title: `Orden #${orden.id.slice(-8).toUpperCase()} — ${orden.titulo}` }]
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const id = params.id as string
  const token = new URL(request.url).searchParams.get('token')
  // sin token no se mira siquiera: el id por sí solo no abre nada
  if (!id || !token || token.length > 100) return { orden: null }

  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('ordenes_laboratorio')
      .select('id,titulo,laboratorio,tipo_trabajo,color_dental,doctor,fecha_solicitud,fecha_prometida,fecha_entrega,estado,notas,pacientes(nombre),clinicas(nombre)')
      .eq('id', id)
      .eq('verification_token', token)
      .maybeSingle()
    if (error) {
      console.error('[verificar-orden] la consulta falló:', error.message)
      return { orden: null }
    }
    return { orden: data as unknown as OrdenPublica | null }
  } catch {
    return { orden: null }
  }
}

function fechaLarga(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString('es-DO', { dateStyle: 'long' })
}

const ESTADOS: Record<string, { texto: string; clase: string; Icono: typeof Clock }> = {
  pendiente: { texto: 'Pendiente', clase: 'bg-amber-50 border-amber-100 text-amber-700', Icono: Clock },
  enviado: { texto: 'En el laboratorio', clase: 'bg-blue-50 border-blue-100 text-blue-700', Icono: ClipboardList },
  recibido: { texto: 'Recibido en la clínica', clase: 'bg-blue-50 border-blue-100 text-blue-700', Icono: ClipboardList },
  entregado: { texto: 'Entregado', clase: 'bg-green-50 border-green-100 text-green-700', Icono: CheckCircle2 },
}

export default function VerificarOrden({ loaderData }: Route.ComponentProps) {
  const { orden } = loaderData

  if (!orden) {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <section className="w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden text-center">
          <div className="bg-red-600 px-6 py-8">
            <XCircle size={40} className="text-white mx-auto mb-2" />
            <h1 className="text-white font-bold text-lg">Orden no encontrada</h1>
            <p className="text-red-100 text-sm mt-1">El código no es válido o la orden no existe.</p>
          </div>
          <p className="px-6 py-6 text-sm text-gray-500">Si tienes dudas, contacta directamente a la clínica.</p>
        </section>
      </main>
    )
  }

  const estado = ESTADOS[orden.estado] ?? {
    texto: orden.estado, clase: 'bg-slate-50 border-slate-200 text-slate-700', Icono: ClipboardList,
  }
  const { Icono } = estado

  const filas: Array<[string, string | null]> = [
    ['Paciente', orden.pacientes?.nombre ?? null],
    ['Doctor', orden.doctor],
    ['Laboratorio', orden.laboratorio],
    ['Tipo de trabajo', orden.tipo_trabajo],
    ['Color dental', orden.color_dental],
    ['Fecha de envío', orden.fecha_solicitud ? fechaLarga(orden.fecha_solicitud) : null],
    ['Fecha prometida', orden.fecha_prometida ? fechaLarga(orden.fecha_prometida) : null],
    ['Fecha de entrega', orden.fecha_entrega ? fechaLarga(orden.fecha_entrega) : null],
  ]

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <section className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        <header className="bg-slate-900 px-6 py-7 text-center">
          <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-3">
            <ClipboardList size={26} className="text-white" />
          </div>
          <h1 className="text-white font-bold text-lg">{orden.clinicas?.nombre ?? 'Clínica'}</h1>
          <p className="text-slate-300 text-xs mt-1">Orden de laboratorio</p>
        </header>

        <div className={`flex items-center justify-center gap-2 border-b px-4 py-3 ${estado.clase}`}>
          <Icono size={17} />
          <p className="text-sm font-semibold">{estado.texto}</p>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-1">Trabajo</p>
            <p className="text-base font-bold text-gray-900 leading-snug">{orden.titulo}</p>
            <p className="text-xs text-gray-500 mt-1 font-mono">#{orden.id.slice(-8).toUpperCase()}</p>
          </div>

          <dl className="divide-y divide-gray-100 border-t border-gray-100">
            {filas.filter(([, valor]) => !!valor).map(([etiqueta, valor]) => (
              <div key={etiqueta} className="flex gap-3 py-2">
                <dt className="w-2/5 flex-shrink-0 text-[10px] uppercase tracking-widest font-semibold text-gray-400 pt-0.5">
                  {etiqueta}
                </dt>
                <dd className="flex-1 text-sm text-gray-900">{valor}</dd>
              </div>
            ))}
          </dl>

          {orden.notas && (
            <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
              <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-1">Indicaciones</p>
              <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-line">{orden.notas}</p>
            </div>
          )}
        </div>

        <footer className="px-6 py-4 bg-slate-50 border-t border-gray-100 text-center">
          <p className="text-[10px] text-gray-500 leading-relaxed">
            Esta página muestra las mismas indicaciones que la hoja impresa que acompaña
            al trabajo. Cualquier cambio debe confirmarse con la clínica antes de continuar.
          </p>
        </footer>
      </section>
    </main>
  )
}
