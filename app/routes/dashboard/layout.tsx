import { useState, useEffect } from 'react'
import { redirect, Outlet, NavLink, Form, useRevalidator } from 'react-router'
import type { Route } from './+types/layout'
import { createSupabaseServerClient } from '~/lib/supabase.server'
import { Calendar, DollarSign, Users, LayoutDashboard, LogOut, FileText, FlaskConical, Building2, Settings, Menu, X, Stethoscope, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '~/lib/utils'
import { puedeVer, type Seccion } from '~/lib/permisos'
import { NotificationBell, type Reserva } from '~/components/NotificationBell'
import { BienvenidaModal } from '~/components/BienvenidaModal'

const SIDEBAR_COLLAPSED_KEY = 'sidebarCollapsed'

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return redirect('/login')
  const { data: perfil } = await supabase
    .from('perfiles')
    .select('rol,clinica_id,nombre,onboarding_visto_at,clinicas(nombre)')
    .eq('id', user.id)
    .single()
  const clinicaNombre = (perfil?.clinicas as any)?.nombre ?? 'Nin Dental Clinic'
  const rol = (perfil?.rol as string) ?? 'recepcionista'
  // bienvenida pendiente: solo en el primer inicio de sesión
  const mostrarBienvenida = !!perfil && !perfil.onboarding_visto_at
  const nombrePerfil = (perfil?.nombre as string | null) ?? null

  // reservas en línea pendientes → alertas de la campana (solo quien gestiona
  // el frente: propietario, admin, recepcionista)
  let reservas: Reserva[] = []
  if (perfil?.clinica_id && ['propietario', 'admin', 'recepcionista'].includes(rol)) {
    const { data } = await supabase
      .from('citas')
      .select('id,fecha_hora,pacientes(nombre,telefono)')
      .eq('clinica_id', perfil.clinica_id)
      .eq('estado', 'pendiente')
      .eq('origen', 'reserva')
      .gte('fecha_hora', new Date().toISOString())
      .order('fecha_hora', { ascending: true })
      .limit(20)
    reservas = (data ?? []).map((c: any) => ({
      id: c.id as string,
      fecha_hora: c.fecha_hora as string,
      nombre: (c.pacientes?.nombre as string) ?? null,
      telefono: (c.pacientes?.telefono as string) ?? null,
    }))
  }

  return { user, clinicaNombre, rol, reservas, mostrarBienvenida, nombrePerfil }
}

const nav: { to: string; label: string; icon: any; end: boolean; seccion: Seccion }[] = [
  { to: '/dashboard', label: 'Inicio', icon: LayoutDashboard, end: true, seccion: 'inicio' },
  { to: '/dashboard/citas', label: 'Citas', icon: Calendar, end: false, seccion: 'citas' },
  { to: '/dashboard/consultas', label: 'Consultas', icon: Stethoscope, end: false, seccion: 'consultas' },
  { to: '/dashboard/pacientes', label: 'Pacientes', icon: Users, end: false, seccion: 'pacientes' },
  { to: '/dashboard/caja', label: 'Caja', icon: DollarSign, end: false, seccion: 'caja' },
  { to: '/dashboard/cotizaciones', label: 'Cotizaciones', icon: FileText, end: false, seccion: 'cotizaciones' },
  { to: '/dashboard/laboratorio', label: 'Laboratorio', icon: FlaskConical, end: false, seccion: 'laboratorio' },
  { to: '/dashboard/trabajos-externos', label: 'Trabajos externos', icon: Building2, end: false, seccion: 'trabajos-externos' },
  { to: '/dashboard/configuracion', label: 'Configuración', icon: Settings, end: false, seccion: 'configuracion' },
]

export default function DashboardLayout({ loaderData }: Route.ComponentProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  // el menú solo muestra lo que el rol puede abrir (el bloqueo real está en
  // el loader de cada ruta)
  const navVisible = nav.filter(n => puedeVer(loaderData.rol, n.seccion))
  // la campana de reservas solo para quien gestiona el frente
  const verNotif = ['propietario', 'admin', 'recepcionista'].includes(loaderData.rol)

  // auto-refresco de la campana: revalida el loader cada 60s para que las
  // reservas nuevas aparezcan sin recargar. Solo cuando hay campana y la
  // pestaña está visible; no interrumpe si ya hay una revalidación en curso.
  const revalidator = useRevalidator()
  useEffect(() => {
    if (!verNotif) return
    const tick = () => {
      if (document.visibilityState === 'visible' && revalidator.state === 'idle') {
        revalidator.revalidate()
      }
    }
    const id = setInterval(tick, 60_000)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick) }
  }, [verNotif, revalidator])

  // restore preference after mount to avoid a server/client hydration mismatch
  // (localStorage isn't available during SSR)
  useEffect(() => {
    if (localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true') setCollapsed(true)
  }, [])

  function toggleCollapsed() {
    setCollapsed(c => {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(!c))
      return !c
    })
  }

  const sidebarContent = (onNav?: () => void, collapsedNav = false) => (
    <>
      <div className={cn('px-6 py-5 border-b border-gray-100 flex flex-col items-center gap-1.5', collapsedNav && 'px-2')}>
        <img src="/ninlogo.png" alt="Logo" style={{ maxWidth: collapsedNav ? '85%' : '70%' }} />
        {!collapsedNav && (
          <span className="font-bold text-gray-900 text-sm text-center">{loaderData.clinicaNombre}</span>
        )}
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navVisible.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNav}
            title={collapsedNav ? label : undefined}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                collapsedNav && 'justify-center px-0',
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              )
            }
          >
            <Icon size={16} />
            {!collapsedNav && label}
          </NavLink>
        ))}
      </nav>
      <div className="px-3 py-4 border-t border-gray-100">
        {!collapsedNav && (
          <p className="text-xs text-gray-500 px-3 mb-2 truncate">{loaderData.user.email}</p>
        )}
        <Form method="post" action="/logout">
          <button
            type="submit"
            title={collapsedNav ? 'Cerrar sesión' : undefined}
            className={cn(
              'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors',
              collapsedNav && 'justify-center px-0'
            )}
          >
            <LogOut size={16} />
            {!collapsedNav && 'Cerrar sesión'}
          </button>
        </Form>
      </div>
    </>
  )

  return (
    <div className="flex h-screen bg-gray-50">
      {/* bienvenida del primer inicio de sesión */}
      {loaderData.mostrarBienvenida && (
        <BienvenidaModal
          nombre={loaderData.nombrePerfil}
          rol={loaderData.rol}
          clinicaNombre={loaderData.clinicaNombre}
        />
      )}

      {/* Desktop sidebar */}
      <aside className={cn(
        'hidden md:flex flex-shrink-0 bg-white border-r border-gray-200 flex-col relative transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-56'
      )}>
        {sidebarContent(undefined, collapsed)}
        <button
          onClick={toggleCollapsed}
          title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          className="hidden md:flex items-center justify-center absolute top-6 -right-3 w-6 h-6 bg-white border border-gray-200 rounded-full text-gray-400 hover:text-gray-700 hover:border-gray-300 shadow-sm transition-colors"
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>
      </aside>

      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40"
          onClick={() => setDrawerOpen(false)}
        >
          <aside
            className="absolute inset-y-0 left-0 w-72 bg-white flex flex-col shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-end px-4 h-14 border-b border-gray-100">
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 flex flex-col overflow-hidden">
              {sidebarContent(() => setDrawerOpen(false))}
            </div>
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center gap-3 px-4 h-14 bg-white border-b border-gray-200 flex-shrink-0 z-20">
          <button
            onClick={() => setDrawerOpen(true)}
            className="p-1.5 -ml-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            <Menu size={22} />
          </button>
          <img src="/ninlogo.png" alt="Logo" className="h-7 w-auto" />
          <span className="font-semibold text-gray-900 text-sm truncate">{loaderData.clinicaNombre}</span>
          {verNotif && (
            <div className="ml-auto">
              <NotificationBell reservas={loaderData.reservas} clinicaNombre={loaderData.clinicaNombre} />
            </div>
          )}
        </header>

        {/* Desktop top bar (solo con la campana) */}
        {verNotif && (
          <header className="hidden md:flex items-center justify-end px-6 h-14 bg-white border-b border-gray-200 flex-shrink-0 z-20">
            <NotificationBell reservas={loaderData.reservas} clinicaNombre={loaderData.clinicaNombre} />
          </header>
        )}

        {/* Page content */}
        <main className="flex-1 overflow-auto pb-16 md:pb-0">
          <Outlet />
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex z-30">
          {navVisible.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors',
                  isActive ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
                )
              }
            >
              <Icon size={19} />
              <span className="text-[9px] font-medium leading-none">{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
