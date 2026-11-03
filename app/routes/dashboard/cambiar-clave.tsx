import { Form, Link, data, redirect, useActionData, useNavigation } from 'react-router'
import type { Route } from './+types/cambiar-clave'
import { createSupabaseServerClient } from '~/lib/supabase.server'
import { KeyRound } from 'lucide-react'

// Cambiar la propia contraseña estando dentro.
//
// Va dentro del layout del dashboard para que no parezca que te expulsó la
// aplicación, pero NO es una pestaña de Configuración: a esa solo entran
// propietario y admin, y recepción, doctores y laboratorio también tienen que
// poder cambiar la suya. Se llega desde el menú lateral.
//
// Pide la contraseña actual antes de cambiarla: si no, cualquiera que agarre
// una sesión abierta —un teléfono desbloqueado, la computadora de la clínica—
// podría dejar al dueño fuera de su propia cuenta.

const MIN_LARGO = 8

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
  if (nueva.length < MIN_LARGO) return fallo(`La contraseña nueva debe tener al menos ${MIN_LARGO} caracteres.`)
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

const inputCls =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function CambiarClave({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>()
  const navigation = useNavigation()
  const guardando = navigation.state === 'submitting'

  return (
    <div className="p-4 md:p-8 max-w-md">
      <div className="flex items-center gap-2 mb-1">
        <KeyRound size={18} className="text-gray-400" />
        <h1 className="text-2xl font-bold text-gray-900">Cambiar contraseña</h1>
      </div>
      <p className="text-sm text-gray-400 mb-6 break-words">{loaderData.email}</p>

      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        {actionData?.ok ? (
          <div className="space-y-4">
            <div className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-3">
              <p className="font-medium">Contraseña cambiada</p>
              <p className="mt-1 text-green-700">
                A partir de ahora entra con la nueva. Si tenías la sesión abierta en otro
                dispositivo, puede seguir abierta; ciérrala desde ahí si hace falta.
              </p>
            </div>
            <Link to="/dashboard"
              className="block w-full text-center bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 cursor-pointer transition-colors">
              Volver al inicio
            </Link>
          </div>
        ) : (
          <Form method="post" className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="actual">
                Contraseña actual
              </label>
              <input id="actual" name="actual" type="password" required autoComplete="current-password"
                autoFocus className={inputCls} />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="nueva">
                Contraseña nueva
              </label>
              <input id="nueva" name="nueva" type="password" required minLength={MIN_LARGO}
                autoComplete="new-password" className={inputCls} />
              <p className="text-xs text-gray-400 mt-1">Al menos {MIN_LARGO} caracteres.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="confirmar">
                Repite la contraseña nueva
              </label>
              <input id="confirmar" name="confirmar" type="password" required minLength={MIN_LARGO}
                autoComplete="new-password" className={inputCls} />
            </div>

            {actionData?.ok === false && actionData.error && (
              <p className="text-sm text-red-600">{actionData.error}</p>
            )}

            <button type="submit" disabled={guardando}
              className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 cursor-pointer disabled:cursor-default transition-colors">
              {guardando ? 'Guardando…' : 'Cambiar contraseña'}
            </button>
          </Form>
        )}
      </div>
    </div>
  )
}
