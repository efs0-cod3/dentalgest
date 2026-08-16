import { useState } from 'react'
import { useRevalidator } from 'react-router'
import {
  LayoutDashboard, Calendar, Stethoscope, Users, DollarSign, FileText,
  FlaskConical, Building2, Settings, Palette, PartyPopper, ArrowRight,
} from 'lucide-react'
import { seccionesDe, SECCION_INFO, ROL_NOTA, esRol, type Seccion } from '~/lib/permisos'

const ICONO: Record<Seccion, any> = {
  inicio: LayoutDashboard,
  citas: Calendar,
  consultas: Stethoscope,
  pacientes: Users,
  caja: DollarSign,
  cotizaciones: FileText,
  laboratorio: FlaskConical,
  'trabajos-externos': Building2,
  configuracion: Settings,
  apariencia: Palette,
}

/**
 * Bienvenida que se muestra una sola vez, en el primer inicio de sesión.
 * Explica el rol de la persona y qué secciones tiene disponibles, armadas
 * desde la misma matriz de permisos para que nunca se desincronicen.
 */
export function BienvenidaModal({ nombre, rol, clinicaNombre }: {
  nombre: string | null
  rol: string
  clinicaNombre: string
}) {
  const [cerrando, setCerrando] = useState(false)
  const [miNombre, setMiNombre] = useState('')
  const revalidator = useRevalidator()
  const secciones = seccionesDe(rol)
  const nota = esRol(rol) ? ROL_NOTA[rol] : null
  // los usuarios invitados no traen nombre: se pide aquí para que el equipo no
  // se vea solo por correo
  const pedirNombre = !nombre

  async function comenzar() {
    setCerrando(true)
    try {
      const body = new FormData()
      if (pedirNombre && miNombre.trim()) body.append('nombre', miNombre.trim())
      await fetch('/api/onboarding-visto', { method: 'post', body })
    } finally {
      // revalida para que el layout deje de mostrar la bienvenida
      revalidator.revalidate()
    }
  }

  return (
    <div className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[92vh]">
        {/* encabezado */}
        <div className="px-6 py-6 text-center border-b border-gray-100 flex-shrink-0">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center mx-auto mb-3">
            <PartyPopper className="text-white" size={24} />
          </div>
          <h2 className="text-lg font-bold text-gray-900">
            {nombre ? `¡Bienvenido/a, ${nombre}!` : '¡Bienvenido/a!'}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Ya tienes acceso a <strong>{clinicaNombre}</strong>
          </p>
          <span className="inline-block mt-3 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold capitalize">
            Tu rol: {rol}
          </span>
        </div>

        {/* secciones disponibles */}
        <div className="px-6 py-4 overflow-y-auto flex-1">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Esto es lo que puedes hacer
          </p>
          <div className="space-y-2.5">
            {secciones.map(s => {
              const Icon = ICONO[s]
              const info = SECCION_INFO[s]
              return (
                <div key={s} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <Icon size={15} className="text-gray-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">{info.label}</p>
                    <p className="text-xs text-gray-500 leading-snug">{info.desc}</p>
                  </div>
                </div>
              )
            })}
          </div>

          {nota && (
            <p className="mt-4 text-xs text-gray-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5">
              {nota}
            </p>
          )}

          {pedirNombre && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                ¿Cómo te llamas? <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <input
                value={miNombre}
                onChange={e => setMiNombre(e.target.value)}
                placeholder="Tu nombre"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">
                Así tus compañeros te reconocen en el equipo, en vez de ver solo tu correo.
              </p>
            </div>
          )}
        </div>

        {/* pie */}
        <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <button
            type="button"
            onClick={comenzar}
            disabled={cerrando}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors cursor-pointer disabled:cursor-default"
          >
            {cerrando ? 'Un momento…' : <>Comenzar <ArrowRight size={15} /></>}
          </button>
          <p className="text-xs text-gray-400 text-center mt-2">
            Este mensaje solo se muestra la primera vez.
          </p>
        </div>
      </div>
    </div>
  )
}
