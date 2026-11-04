import { useEffect, useState } from 'react'
import { data, redirect, useFetcher, useLoaderData } from 'react-router'
import type { Route } from './+types/auth.confirmar'
import { createSupabaseServerClient } from '~/lib/supabase.server'

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Activa tu cuenta — Nin Dental Clinic' }]
}

// Esta página atiende DOS flujos distintos de Supabase:
//
//  1. PKCE (el que usa hoy la recuperación de contraseña). El enlace llega con
//     el código en la QUERY: /auth/confirmar?code=… El canje se hace aquí, en
//     el servidor, con exchangeCodeForSession, y necesita el verificador que
//     quedó en una cookie cuando se pidió el enlace desde /login.
//
//  2. Tokens en el FRAGMENTO (#access_token=…), el flujo antiguo de las
//     invitaciones. El fragmento nunca llega al servidor, así que lo captura
//     el componente y lo manda al action.
//
// Se mantienen los dos para no romper ningún enlace que ya esté circulando.

type Flujo = 'recovery' | 'invite'

function leerFlujo(url: URL): Flujo {
  const v = url.searchParams.get('flujo') ?? url.searchParams.get('type')
  if (v === 'recovery') return 'recovery'
  if (v === 'invite' || v === 'signup') return 'invite'
  // El enlace PKCE no siempre trae `type`. En esta app las invitaciones van
  // por /unirse/:token y no por correo, así que un `code` es recuperación.
  return url.searchParams.has('code') ? 'recovery' : 'invite'
}

function mensajeDeCanje(error: string): string {
  const e = error.toLowerCase()
  if (e.includes('code verifier') || e.includes('invalid request')) {
    return 'Este enlace hay que abrirlo en el mismo navegador y dispositivo donde lo pediste. Pide uno nuevo desde ese equipo.'
  }
  if (e.includes('expired')) {
    return 'El enlace caducó. Pide uno nuevo desde la pantalla de inicio de sesión.'
  }
  if (e.includes('already') || e.includes('used')) {
    return 'Este enlace ya se usó. Pide uno nuevo desde la pantalla de inicio de sesión.'
  }
  return 'No se pudo validar el enlace. Pide uno nuevo desde la pantalla de inicio de sesión.'
}

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, headers } = createSupabaseServerClient(request)
  const url = new URL(request.url)
  const flujo = leerFlujo(url)

  // Supabase puede devolver el fallo en la query en vez de en el fragmento.
  const errDesc = url.searchParams.get('error_description')
  if (errDesc) {
    return data(
      { hasSession: false, flujo, errorInicial: decodeURIComponent(errDesc.replace(/\+/g, ' ')) },
      { headers },
    )
  }

  const code = url.searchParams.get('code')
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      return data({ hasSession: false, flujo, errorInicial: mensajeDeCanje(error.message) }, { headers })
    }
    // El código es de un solo uso: se quita de la URL y se vuelve a entrar ya
    // con la cookie de sesión puesta. Con headers, que es lo que la entrega.
    throw redirect(`/auth/confirmar?flujo=${flujo}`, { headers })
  }

  const { data: { user } } = await supabase.auth.getUser()
  return data({ hasSession: !!user, flujo, errorInicial: null as string | null }, { headers })
}

export async function action({ request }: Route.ActionArgs) {
  const { supabase, headers } = createSupabaseServerClient(request)
  const fd = await request.formData()
  const intent = fd.get('intent') as string

  if (intent === 'session') {
    const access_token = fd.get('access_token') as string
    const refresh_token = fd.get('refresh_token') as string
    const flow = fd.get('flow') === 'recovery' ? 'recovery' : 'invite'
    if (!access_token || !refresh_token) {
      return { ok: false, error: 'Enlace inválido o incompleto', intent }
    }
    const { error } = await supabase.auth.setSession({ access_token, refresh_token })
    if (error) return { ok: false, error: error.message, intent }
    return data({ ok: true, intent, flow }, { headers })
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
    const flow = fd.get('flow') === 'recovery' ? 'recovery' : 'invite'
    throw redirect(flow === 'recovery' ? '/login?password_updated=1' : '/dashboard', { headers })
  }

  return { ok: false, error: 'Intent desconocido', intent }
}

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function AuthConfirmar() {
  const { hasSession, flujo, errorInicial } = useLoaderData<typeof loader>()
  const f = useFetcher()
  const [hashError, setHashError] = useState<string | null>(null)
  const [ready, setReady] = useState(hasSession)
  const [recovery, setRecovery] = useState(flujo === 'recovery')

  // Solo para el flujo antiguo del fragmento. Si el servidor ya resolvió el
  // PKCE (hasSession) o ya hay un error, aquí no hay nada que hacer.
  useEffect(() => {
    if (hasSession || errorInicial) return
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
      fd.append('flow', params.get('type') === 'recovery' ? 'recovery' : 'invite')
      f.submit(fd, { method: 'post' })
      // limpia los tokens de la URL
      window.history.replaceState(null, '', window.location.pathname)
    } else {
      setHashError('El enlace no es válido o ya se usó. Pide uno nuevo desde la pantalla de inicio de sesión.')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSession, errorInicial])

  useEffect(() => {
    if (f.data?.ok && f.data.intent === 'session') {
      setRecovery(f.data.flow === 'recovery')
      setReady(true)
    }
  }, [f.data])

  const sessionError = f.data && !f.data.ok && f.data.intent === 'session' ? f.data.error : null
  const passwordError = f.data && !f.data.ok && f.data.intent === 'set_password' ? f.data.error : null
  const error = errorInicial ?? hashError ?? sessionError

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Nin Dental Clinic</h1>
          <p className="text-sm text-gray-500 mt-1">{recovery ? 'Restablece tu contraseña' : 'Activa tu cuenta'}</p>
        </div>

        {error ? (
          <div className="space-y-4">
            <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
            {recovery ? (
              <a href="/login"
                className="block w-full text-center bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
                Pedir un enlace nuevo
              </a>
            ) : (
              <p className="text-xs text-gray-500">
                Los enlaces de invitación caducan. Si el tuyo expiró, pide al administrador
                de la clínica que te envíe una nueva invitación.
              </p>
            )}
          </div>
        ) : !ready ? (
          <p className="text-sm text-gray-500 text-center">
            {recovery ? 'Verificando el enlace…' : 'Verificando invitación…'}
          </p>
        ) : (
          <f.Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="set_password" />
            <input type="hidden" name="flow" value={recovery ? 'recovery' : 'invite'} />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="password">
                {recovery ? 'Nueva contraseña' : 'Crea tu contraseña'}
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
              {f.state !== 'idle' ? 'Guardando…' : recovery ? 'Guardar nueva contraseña' : 'Guardar y entrar'}
            </button>
          </f.Form>
        )}
      </div>
    </div>
  )
}
