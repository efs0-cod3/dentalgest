import { useEffect } from 'react'
import { Form, redirect, useActionData } from 'react-router'
import type { Route } from './+types/login'
import { createSupabaseServerClient } from '~/lib/supabase.server'

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Iniciar sesión — Nin Dental Clinic' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (user) return redirect('/dashboard')
  return {}
}

export async function action({ request }: Route.ActionArgs) {
  const { supabase, headers } = createSupabaseServerClient(request)
  const formData = await request.formData()
  const intent = String(formData.get('intent') ?? 'login')
  const email = String(formData.get('email') ?? '').trim()

  if (intent === 'reset') {
    if (!email) return { intent: 'reset', error: 'Escribe tu correo electrónico.' }
    const redirectTo = new URL('/auth/confirmar', request.url).toString()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    })
    if (error) return { intent: 'reset', error: error.message }
    // Mensaje deliberadamente neutro para no revelar si el correo está registrado.
    return { intent: 'reset', resetSent: true }
  }

  const password = String(formData.get('password') ?? '')
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { intent: 'login', error: error.message }

  return redirect('/dashboard', { headers })
}

export default function Login() {
  const actionData = useActionData<typeof action>()

  useEffect(() => {
    const h = window.location.hash
    if (h.includes('access_token') || h.includes('error_description')) {
      window.location.replace('/auth/confirmar' + h)
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
