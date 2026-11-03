import { data, redirect } from 'react-router'
import type { Route } from './+types/cambiar-clave'
import { createSupabaseServerClient } from '~/lib/supabase.server'
import { KeyRound } from 'lucide-react'
import { CambiarClaveForm, MIN_LARGO_CLAVE } from '~/components/CambiarClaveForm'

// Cambiar la propia contraseña estando dentro.
//
// Esta ruta es además el action que usa el formulario desde Configuración, así
// que la validación y el manejo de cookies viven aquí y en un solo sitio.
//
// Va dentro del layout del dashboard para que no parezca que te expulsó la
// aplicación. Se llega desde el menú lateral y desde Configuración → Mi cuenta,
// de modo que la alcanza cualquier rol: a Configuración completa solo entran
// propietario y admin, pero la contraseña la cambia todo el mundo.
//
// Pide la contraseña actual antes de cambiarla: si no, cualquiera que agarre
// una sesión abierta —un teléfono desbloqueado, la computadora de la clínica—
// podría dejar al dueño fuera de su propia cuenta.

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Cambiar contraseña — Nin Dental Clinic' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, headers } = createSupabaseServerClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw redirect('/login', { headers })
  return data({ email: user.email ?? '' }, { headers })
}

export async function action({ request }: Route.ActionArgs) {
  const { supabase, headers } = createSupabaseServerClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) throw redirect('/login', { headers })

  // Todas las salidas van con `headers`: getUser() y signInWithPassword
  // escriben cookies de sesión, y si no se entregan, el navegador se queda con
  // las anteriores y la sesión se rompe —incluso al equivocarse de clave—.
  const fallo = (error: string) => data({ ok: false as const, error }, { headers })

  const fd = await request.formData()
  const actual = (fd.get('actual') as string) ?? ''
  const nueva = (fd.get('nueva') as string) ?? ''
  const confirmar = (fd.get('confirmar') as string) ?? ''

  if (!actual) return fallo('Escribe tu contraseña actual.')
  if (nueva.length < MIN_LARGO_CLAVE) {
    return fallo(`La contraseña nueva debe tener al menos ${MIN_LARGO_CLAVE} caracteres.`)
  }
  if (nueva !== confirmar) return fallo('La contraseña nueva y su confirmación no coinciden.')
  if (nueva === actual) return fallo('La contraseña nueva tiene que ser distinta de la actual.')

  const { error: malActual } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: actual,
  })
  if (malActual) return fallo('La contraseña actual no es correcta.')

  const { error } = await supabase.auth.updateUser({ password: nueva })
  if (error) return fallo(error.message)

  return data({ ok: true as const }, { headers })
}

export default function CambiarClave({ loaderData }: Route.ComponentProps) {
  return (
    <div className="p-4 md:p-8 max-w-md">
      <div className="flex items-center gap-2 mb-1">
        <KeyRound size={18} className="text-gray-400" />
        <h1 className="text-2xl font-bold text-gray-900">Cambiar contraseña</h1>
      </div>
      <p className="text-sm text-gray-400 mb-6 break-words">{loaderData.email}</p>

      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <CambiarClaveForm conEnlaceAlInicio />
      </div>
    </div>
  )
}
