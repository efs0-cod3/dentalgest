import { Form, Link, redirect, useActionData, useNavigation } from 'react-router'
import type { Route } from './+types/recuperar'
import { createSupabaseServerClient } from '~/lib/supabase.server'

// Pedir un enlace para restablecer la contraseña.
//
// La segunda mitad del flujo ya existía: /auth/confirmar recibe los tokens del
// enlace y deja poner la clave nueva. Lo que faltaba era poder pedirlo, así
// que quien olvidaba su contraseña quedaba fuera hasta que alguien le tocara
// la cuenta a mano.

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Recuperar contraseña — Nin Dental Clinic' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (user) return redirect('/dashboard')
  return {}
}

export async function action({ request }: Route.ActionArgs) {
  const { supabase } = createSupabaseServerClient(request)
  const fd = await request.formData()
  const email = ((fd.get('email') as string) ?? '').trim()

  if (!email) return { ok: false, error: 'Escribe tu correo electrónico.' }

  // el enlace tiene que volver al mismo sitio desde el que se pidió
  const redirectTo = new URL('/auth/confirmar', request.url).toString()
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })

  // No se dice si el correo existe o no: eso permitiría averiguar quién tiene
  // cuenta. Solo se avisa cuando el fallo es del envío, para no dejar a nadie
  // esperando un correo que nunca salió.
  if (error) {
    const esLimite = /rate limit|too many/i.test(error.message)
    return {
      ok: false,
      error: esLimite
        ? 'Se han pedido demasiados correos seguidos. Espera unos minutos e intenta de nuevo.'
        : 'No se pudo enviar el correo ahora mismo. Intenta de nuevo en un momento.',
    }
  }

  return { ok: true as const }
}

export default function Recuperar() {
  const actionData = useActionData<typeof action>()
  const navigation = useNavigation()
  const enviando = navigation.state === 'submitting'

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Recuperar contraseña</h1>
          <p className="text-sm text-gray-500 mt-1">
            Te enviamos un enlace para poner una nueva
          </p>
        </div>

        {actionData?.ok ? (
          <div className="space-y-4">
            <div className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-3">
              <p className="font-medium">Revisa tu correo</p>
              <p className="mt-1 text-green-700">
                Si esa dirección tiene una cuenta, le llegará un enlace para poner una contraseña
                nueva. Puede tardar un par de minutos — y vale la pena mirar en la carpeta de spam.
              </p>
            </div>
            <Link to="/login"
              className="block w-full text-center bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
              Volver a iniciar sesión
            </Link>
          </div>
        ) : (
          <Form method="post" className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="email">
                Correo electrónico
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                autoFocus
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {actionData?.ok === false && actionData.error && (
              <p className="text-sm text-red-600">{actionData.error}</p>
            )}

            <button
              type="submit"
              disabled={enviando}
              className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 cursor-pointer disabled:cursor-default transition-colors"
            >
              {enviando ? 'Enviando…' : 'Enviar enlace'}
            </button>

            <Link to="/login" className="block text-center text-sm text-gray-500 hover:text-gray-700">
              Volver a iniciar sesión
            </Link>
          </Form>
        )}
      </div>
    </div>
  )
}
