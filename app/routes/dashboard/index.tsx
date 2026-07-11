import { useLoaderData } from 'react-router'
import { Link } from 'react-router'
import type { Route } from './+types/index'
import { createSupabaseServerClient } from '~/lib/supabase.server'
import { getClinicaId } from '~/lib/clinica.server'
import { TrendingUp, TrendingDown, Users, Calendar, Clock, ChevronRight, DollarSign } from 'lucide-react'
import { cn, fmtMoney } from '~/lib/utils'

const estadoStyle: Record<string, string> = {
  pendiente: 'bg-yellow-100 text-yellow-700',
  confirmada: 'bg-blue-100 text-blue-700',
  completada: 'bg-green-100 text-green-700',
  cancelada: 'bg-gray-100 text-gray-500',
}

const fmt = fmtMoney

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Inicio — Nin Dental Clinic' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request)
  const clinicaId = await getClinicaId(request)
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const [
    { data: citasHoy },
    { data: proximasCitas },
    { data: pacientes },
    { data: pagosHoy },
    { data: pagosMes },
  ] = await Promise.all([
    supabase
      .from('citas')
      .select('id,fecha_hora,duracion_min,estado,pacientes(nombre),doctores(nombre),tratamientos(nombre)')
      .eq('clinica_id', clinicaId)
      .gte('fecha_hora', todayStart)
      .lt('fecha_hora', todayEnd)
      .order('fecha_hora'),
    supabase
      .from('citas')
      .select('id,fecha_hora,estado,pacientes(nombre),tratamientos(nombre)')
      .eq('clinica_id', clinicaId)
      .gte('fecha_hora', todayEnd)
      .not('estado', 'eq', 'cancelada')
      .order('fecha_hora')
      .limit(5),
    supabase.from('pacientes').select('id', { count: 'exact', head: true }).eq('clinica_id', clinicaId),
    supabase.from('pagos').select('monto,tipo').eq('clinica_id', clinicaId).gte('fecha', todayStart).lt('fecha', todayEnd),
    supabase.from('pagos').select('monto,tipo').eq('clinica_id', clinicaId).gte('fecha', monthStart),
  ])

  const ingresosHoy = (pagosHoy ?? []).filter((p: any) => p.tipo === 'ingreso').reduce((s: number, p: any) => s + p.monto, 0)
  const egresosHoy = (pagosHoy ?? []).filter((p: any) => p.tipo === 'egreso').reduce((s: number, p: any) => s + p.monto, 0)
  const ingresosMes = (pagosMes ?? []).filter((p: any) => p.tipo === 'ingreso').reduce((s: number, p: any) => s + p.monto, 0)

  return {
    citasHoy: (citasHoy ?? []) as any[],
    proximasCitas: (proximasCitas ?? []) as any[],
    totalPacientes: pacientes?.length ?? 0,
    ingresosHoy,
    egresosHoy,
    balanceHoy: ingresosHoy - egresosHoy,
    ingresosMes,
    fecha: now.toLocaleDateString('es-DO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
  }
}

export default function DashboardIndex() {
  const { citasHoy, proximasCitas, totalPacientes, ingresosHoy, egresosHoy, balanceHoy, ingresosMes, fecha } =
    useLoaderData<typeof loader>()

  const citasPendientes = citasHoy.filter((c: any) => c.estado === 'pendiente' || c.estado === 'confirmada')
  const citasCompletadas = citasHoy.filter((c: any) => c.estado === 'completada')

  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-8">
      {/* greeting */}
      <div>
        <p className="text-sm text-gray-400 capitalize">{fecha}</p>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">Buenos días</h1>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <Calendar size={15} className="text-blue-600" />
            </div>
            <span className="text-xs font-medium text-gray-500">Citas hoy</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{citasHoy.length}</p>
          <p className="text-xs text-gray-400 mt-1">
            {citasPendientes.length} pendientes · {citasCompletadas.length} completadas
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
              <Users size={15} className="text-purple-600" />
            </div>
            <span className="text-xs font-medium text-gray-500">Pacientes</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{totalPacientes}</p>
          <p className="text-xs text-gray-400 mt-1">registrados en total</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
              <TrendingUp size={15} className="text-green-600" />
            </div>
            <span className="text-xs font-medium text-gray-500">Ingresos hoy</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{fmt(ingresosHoy)}</p>
          <p className="text-xs text-gray-400 mt-1">Este mes: {fmt(ingresosMes)}</p>
        </div>

        <div className={cn(
          'rounded-2xl border p-5',
          balanceHoy >= 0 ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-100'
        )}>
          <div className="flex items-center gap-2 mb-3">
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', balanceHoy >= 0 ? 'bg-blue-100' : 'bg-red-100')}>
              <DollarSign size={15} className={balanceHoy >= 0 ? 'text-blue-600' : 'text-red-600'} />
            </div>
            <span className="text-xs font-medium text-gray-500">Balance hoy</span>
          </div>
          <p className={cn('text-3xl font-bold', balanceHoy >= 0 ? 'text-blue-700' : 'text-red-700')}>
            {fmt(balanceHoy)}
          </p>
          <p className="text-xs text-gray-400 mt-1">Egresos: {fmt(egresosHoy)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {/* citas de hoy */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 text-sm">Citas de hoy</h2>
            <Link
              to="/dashboard/citas"
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              Ver todas <ChevronRight size={13} />
            </Link>
          </div>

          {citasHoy.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <Calendar size={28} className="mx-auto mb-2 text-gray-200" />
              <p className="text-sm text-gray-400">Sin citas programadas para hoy.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {citasHoy.map((c: any) => (
                <div key={c.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="text-center w-12 flex-shrink-0">
                    <p className="text-sm font-bold text-gray-900">
                      {new Date(c.fecha_hora).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <p className="text-xs text-gray-400 flex items-center justify-center gap-0.5">
                      <Clock size={9} />{c.duracion_min}m
                    </p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{c.pacientes?.nombre ?? '—'}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {c.tratamientos?.nombre ?? 'Sin tratamiento'}
                      {c.doctores ? ` · ${c.doctores.nombre}` : ''}
                    </p>
                  </div>
                  <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0', estadoStyle[c.estado])}>
                    {c.estado}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* próximas citas */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 text-sm">Próximas citas</h2>
            <Link
              to="/dashboard/citas"
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              Ver todas <ChevronRight size={13} />
            </Link>
          </div>

          {proximasCitas.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <Calendar size={28} className="mx-auto mb-2 text-gray-200" />
              <p className="text-sm text-gray-400">No hay citas próximas.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {proximasCitas.map((c: any) => {
                const d = new Date(c.fecha_hora)
                return (
                  <div key={c.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="text-center w-12 flex-shrink-0">
                      <p className="text-xs font-bold text-gray-700">
                        {d.toLocaleDateString('es-DO', { day: '2-digit', month: 'short' })}
                      </p>
                      <p className="text-xs text-gray-400">
                        {d.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{c.pacientes?.nombre ?? '—'}</p>
                      <p className="text-xs text-gray-400 truncate">{c.tratamientos?.nombre ?? 'Sin tratamiento'}</p>
                    </div>
                    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0', estadoStyle[c.estado])}>
                      {c.estado}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
