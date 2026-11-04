import { data, Form, Link, redirect, useActionData, useNavigation } from 'react-router'
import type { Route } from './+types/recuperar'
import { createSupabaseServerClient } from '~/lib/supabase.server'

// Pedir el enlace para restablecer la contraseña.
//
// La segunda mitad del flujo vive en /auth/confirmar, que canjea el código
// PKCE y muestra el formulario de contraseña nueva.

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Recuperar contraseña — Nin Dental Clinic' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, headers } = createSupabaseServerClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (user) throw redirect('/dashboard', { headers })
  return data({}, { headers })
}

export async function action({ request }: Route.ActionArgs) {
  const { supabase, headers } = createSupabaseServerClient(request)
  const fd = await request.formData()
  const email = String(fd.get('email') ?? '').trim()

  const fallo = (mensaje: string) =>
    data({ error: mensaje as string | null, enviado: false }, { headers })

  if (!email) return fallo('Escribe tu correo electrónico.')

  // El redirectTo se arma con el host de ESTA petición a propósito. El
  // verificador PKCE viaja en una cookie, y una cookie puesta en
  // www.dentigest.com no se manda a dentigest.com: fijar aquí un host
  // distinto del que está usando la persona rompería el canje del código.
  const redirectTo = new URL('/auth/confirmar', request.url).toString()
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
  if (error) return fallo(error.message)

  // CON headers, y esto es lo delicado: en el flujo PKCE
  // resetPasswordForEmail genera un verificador y lo guarda en una cookie.
  // Si se devuelve un objeto pelado, esas cabeceras se descartan, el
  // verificador nunca llega al navegador y el enlace del correo no se puede
  // canjear por una sesión.
  // Mensaje deliberadamente neutro para no revelar si el correo está registrado.
  return data({ error: null as string | null, enviado: true }, { headers })
}

const inputCls =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'

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
            Te enviamos un enlace para crear una nueva
          </p>
        </div>

        {actionData?.enviado ? (
          <div className="space-y-4">
            <div className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-3">
              <p className="font-medium">Revisa tu correo</p>
              <p className="mt-1 text-green-700">
                Si esa dirección tiene una cuenta, le llegará un enlace para crear una contraseña
                nueva. Puede tardar un par de minutos — y vale la pena mirar en la carpeta de spam.
              </p>
            </div>
            <p className="text-xs text-gray-500">
              Abre el enlace en este mismo navegador y dispositivo: por seguridad, no funciona
              desde otro.
            </p>
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
              <input id="email" name="email" type="email" required autoComplete="email" autoFocus
                placeholder="correo@ejemplo.com" className={inputCls} />
            </div>

            {actionData?.error && <p className="text-sm text-red-600">{actionData.error}</p>}

            <button type="submit" disabled={enviando}
              className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 cursor-pointer disabled:cursor-default transition-colors">
              {enviando ? 'Enviando…' : 'Enviar enlace de recuperación'}
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
