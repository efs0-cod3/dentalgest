import { Form, Link, redirect, useActionData, useNavigation } from 'react-router'
import type { Route } from './+types/cambiar-clave'
import { createSupabaseServerClient } from '~/lib/supabase.server'

// Cambiar la propia contraseña estando dentro.
//
// Es una página aparte y no una pestaña de Configuración a propósito: a esa
// solo entran propietario y admin, y recepción, doctores y laboratorio también
// tienen que poder cambiar la suya. Se llega desde el menú lateral.
//
// Pide la contraseña actual antes de cambiarla: si no, cualquiera que agarre
// una sesión abierta —un teléfono desbloqueado, la computadora de la clínica—
// podría dejar al dueño fuera de su propia cuenta.

const MIN_LARGO = 8

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Cambiar contraseña — Nin Dental Clinic' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return redirect('/login')
  // tras el cambio se vuelve aquí con ?ok=1 para poder entregar las cookies
  // de la sesión nueva en la redirección
  const exito = new URL(request.url).searchParams.get('ok') === '1'
  return { email: user.email ?? '', exito }
}

export async function action({ request }: Route.ActionArgs) {
  const { supabase, headers } = createSupabaseServerClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return redirect('/login')

  const fd = await request.formData()
  const actual = (fd.get('actual') as string) ?? ''
  const nueva = (fd.get('nueva') as string) ?? ''
  const confirmar = (fd.get('confirmar') as string) ?? ''

  if (!actual) return { ok: false as const, error: 'Escribe tu contraseña actual.' }
  if (nueva.length < MIN_LARGO) {
    return { ok: false as const, error: `La contraseña nueva debe tener al menos ${MIN_LARGO} caracteres.` }
  }
  if (nueva !== confirmar) return { ok: false as const, error: 'La contraseña nueva y su confirmación no coinciden.' }
  if (nueva === actual) return { ok: false as const, error: 'La contraseña nueva tiene que ser distinta de la actual.' }

  // Comprobar la actual antes de cambiar nada.
  const { error: malActual } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: actual,
  })
  if (malActual) return { ok: false as const, error: 'La contraseña actual no es correcta.' }

  const { error } = await supabase.auth.updateUser({ password: nueva })
  if (error) return { ok: false as const, error: error.message }

  // Con headers: comprobar la contraseña actual emitió una sesión nueva, y si
  // no se entregan sus cookies el navegador se queda con las anteriores.
  throw redirect('/cambiar-clave?ok=1', { headers })
}

const inputCls =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function CambiarClave({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>()
  const navigation = useNavigation()
  const guardando = navigation.state === 'submitting'

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">Cambiar contraseña</h1>
          <p className="text-sm text-gray-500 mt-1 break-words">{loaderData.email}</p>
        </div>

        {loaderData.exito ? (
          <div className="space-y-4">
            <div className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-3">
              <p className="font-medium">Contraseña cambiada</p>
              <p className="mt-1 text-green-700">
                A partir de ahora entra con la nueva. Si habías entrado en otro dispositivo, esa
                sesión sigue abierta.
              </p>
            </div>
            <Link to="/dashboard"
              className="block w-full text-center bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
              Volver a la aplicación
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

            <Link to="/dashboard" className="block text-center text-sm text-gray-500 hover:text-gray-700">
              Cancelar
            </Link>
          </Form>
        )}
      </div>
    </div>
  )
}
