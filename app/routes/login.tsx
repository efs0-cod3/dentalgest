import { useEffect } from 'react'
import { data, Form, redirect, useActionData, useLoaderData } from 'react-router'
import type { Route } from './+types/login'
import { createSupabaseServerClient } from '~/lib/supabase.server'

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Iniciar sesión — Nin Dental Clinic' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, headers } = createSupabaseServerClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (user) throw redirect('/dashboard', { headers })
  const url = new URL(request.url)
  return data(
    { claveActualizada: url.searchParams.get('password_updated') === '1' },
    { headers },
  )
}

export async function action({ request }: Route.ActionArgs) {
  const { supabase, headers } = createSupabaseServerClient(request)
  const formData = await request.formData()
  const intent = String(formData.get('intent') ?? 'login')
  const email = String(formData.get('email') ?? '').trim()

  if (intent === 'reset') {
    const fallo = (mensaje: string) =>
      data({ intent: 'reset' as const, error: mensaje as string | null, resetSent: false }, { headers })

    if (!email) return fallo('Escribe tu correo electrónico.')

    // El redirectTo se arma con el host de ESTA petición a propósito. El
    // verificador PKCE viaja en una cookie, y una cookie puesta en
    // www.dentigest.com no se manda a dentigest.com: fijar aquí un host
    // distinto del que está usando la persona rompería el canje del código.
    const redirectTo = new URL('/auth/confirmar', request.url).toString()
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    if (error) return fallo(error.message)

    // CON headers, y esto es lo que estaba roto: en el flujo PKCE
    // resetPasswordForEmail genera un verificador y lo guarda en una cookie.
    // Al devolver un objeto pelado, esas cabeceras se descartaban y el
    // verificador nunca llegaba al navegador, así que el enlace del correo
    // jamás se podía canjear por una sesión.
    // Mensaje deliberadamente neutro para no revelar si el correo está registrado.
    return data(
      { intent: 'reset' as const, error: null as string | null, resetSent: true },
      { headers },
    )
  }

  const password = String(formData.get('password') ?? '')
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return data({ intent: 'login' as const, error: error.message }, { headers })

  return redirect('/dashboard', { headers })
}

export default function Login() {
  const actionData = useActionData<typeof action>()
  const { claveActualizada } = useLoaderData<typeof loader>()

  // Red de seguridad: si un enlace de Supabase aterriza aquí en vez de en
  // /auth/confirmar, se reenvía con todo lo que traiga. El flujo PKCE manda el
  // código en la QUERY (?code=…) y el antiguo manda los tokens en el
  // FRAGMENTO (#access_token=…); hay que contemplar los dos.
  useEffect(() => {
    const { hash, search } = window.location
    if (hash.includes('access_token') || hash.includes('error_description')) {
      window.location.replace('/auth/confirmar' + hash)
      return
    }
    const q = new URLSearchParams(search)
    if (q.has('code') || q.has('error_description')) {
      window.location.replace('/auth/confirmar' + search)
    }
  }, [])

  const resetSent = actionData?.intent === 'reset' && actionData.resetSent

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Nin Dental Clinic</h1>
          <p className="text-sm text-gray-500 mt-1">Ingresa a tu cuenta</p>
        </div>

        {claveActualizada && (
          <p className="mb-4 text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            Contraseña actualizada. Entra con la nueva.
          </p>
        )}

        <Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="login" />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="email">
              Correo electrónico
            </label>
            <input id="email" name="email" type="email" required autoComplete="email"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="password">
              Contraseña
            </label>
            <input id="password" name="password" type="password" required
              autoComplete="current-password"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {actionData?.intent === 'login' && actionData.error && (
            <p className="text-sm text-red-600">{actionData.error}</p>
          )}

          <button type="submit"
            className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            Ingresar
          </button>
        </Form>

        <div className="mt-5 border-t border-gray-200 pt-4">
          <p className="text-sm font-medium text-gray-700 mb-2">¿Olvidaste tu contraseña?</p>
          <Form method="post" className="space-y-3">
            <input type="hidden" name="intent" value="reset" />
            <label className="block text-xs text-gray-500" htmlFor="reset-email">
              Escribe tu correo y te enviaremos un enlace para crear una contraseña nueva.
            </label>
            <input id="reset-email" name="email" type="email" required autoComplete="email"
              placeholder="correo@ejemplo.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            {actionData?.intent === 'reset' && actionData.error && (
              <p className="text-sm text-red-600">{actionData.error}</p>
            )}
            {resetSent && (
              <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                Si el correo corresponde a una cuenta, recibirás instrucciones para restablecer la contraseña.
              </p>
            )}
            <button type="submit"
              className="w-full border border-blue-600 text-blue-700 py-2 rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors">
              Enviar enlace de recuperación
            </button>
          </Form>
        </div>
      </div>
    </div>
  )
}
