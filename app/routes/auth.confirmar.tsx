import { useEffect, useState } from 'react'
import { data, redirect, useFetcher, useLoaderData } from 'react-router'
import type { Route } from './+types/auth.confirmar'
import { createSupabaseServerClient } from '~/lib/supabase.server'

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Activa tu cuenta — Nin Dental Clinic' }]
}

// El enlace de invitación de Supabase redirige aquí con los tokens en el
// fragmento de la URL (#access_token=…), que solo es visible en el navegador.
// El componente los captura y los envía al action para crear la sesión en
// cookies; luego el usuario define su contraseña.

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  return { hasSession: !!user }
}

export async function action({ request }: Route.ActionArgs) {
  const { supabase, headers } = createSupabaseServerClient(request)
  const fd = await request.formData()
  const intent = fd.get('intent') as string

  if (intent === 'session') {
    const access_token = fd.get('access_token') as string
    const refresh_token = fd.get('refresh_token') as string
    if (!access_token || !refresh_token) {
      return { ok: false, error: 'Enlace inválido o incompleto', intent }
    }
    const { error } = await supabase.auth.setSession({ access_token, refresh_token })
    if (error) return { ok: false, error: error.message, intent }
    return data({ ok: true, intent }, { headers })
  }

  if (intent === 'set_password') {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'La sesión expiró. Abre de nuevo el enlace de tu correo.', intent }
    const password = fd.get('password') as string
    const confirm = fd.get('confirm') as string
    if (!password || password.length < 8) {
      return { ok: false, error: 'La contraseña debe tener al menos 8 caracteres', intent }
    }
    if (password !== confirm) {
      return { ok: false, error: 'Las contraseñas no coinciden', intent }
    }
    const { error } = await supabase.auth.updateUser({ password })
    if (error) return { ok: false, error: error.message, intent }
    throw redirect('/dashboard', { headers })
  }

  return { ok: false, error: 'Intent desconocido', intent }
}

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function AuthConfirmar() {
  const { hasSession } = useLoaderData<typeof loader>()
  const f = useFetcher()
  const [hashError, setHashError] = useState<string | null>(null)
  const [ready, setReady] = useState(hasSession)

  useEffect(() => {
    if (hasSession) return
    const params = new URLSearchParams(window.location.hash.slice(1))
    const errDesc = params.get('error_description')
    if (errDesc) {
      setHashError(decodeURIComponent(errDesc.replace(/\+/g, ' ')))
      return
    }
    const access_token = params.get('access_token')
    const refresh_token = params.get('refresh_token')
    if (access_token && refresh_token) {
      const fd = new FormData()
      fd.append('intent', 'session')
      fd.append('access_token', access_token)
      fd.append('refresh_token', refresh_token)
      f.submit(fd, { method: 'post' })
      // limpia los tokens de la URL
      window.history.replaceState(null, '', window.location.pathname)
    } else {
      setHashError('El enlace no es válido. Pide que te envíen una nueva invitación.')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSession])

  useEffect(() => {
    if (f.data?.ok && f.data.intent === 'session') setReady(true)
  }, [f.data])

  const sessionError = f.data && !f.data.ok && f.data.intent === 'session' ? f.data.error : null
  const passwordError = f.data && !f.data.ok && f.data.intent === 'set_password' ? f.data.error : null
  const error = hashError ?? sessionError

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Nin Dental Clinic</h1>
          <p className="text-sm text-gray-500 mt-1">Activa tu cuenta</p>
        </div>

        {error ? (
          <div className="space-y-4">
            <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
            <p className="text-xs text-gray-500">
              Los enlaces de invitación caducan. Si el tuyo expiró, pide al administrador
              de la clínica que te envíe una nueva invitación.
            </p>
          </div>
        ) : !ready ? (
          <p className="text-sm text-gray-500 text-center">Verificando invitación…</p>
        ) : (
          <f.Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="set_password" />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="password">
                Nueva contraseña
              </label>
              <input id="password" name="password" type="password" required minLength={8}
                autoComplete="new-password" autoFocus className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="confirm">
                Repite la contraseña
              </label>
              <input id="confirm" name="confirm" type="password" required minLength={8}
                autoComplete="new-password" className={inputCls} />
            </div>
            {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
            <button type="submit" disabled={f.state !== 'idle'}
              className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {f.state !== 'idle' ? 'Guardando…' : 'Guardar y entrar'}
            </button>
          </f.Form>
        )}
      </div>
    </div>
  )
}
