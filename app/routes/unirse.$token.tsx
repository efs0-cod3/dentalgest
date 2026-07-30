import { Form, useLoaderData, useActionData, useNavigation, redirect } from 'react-router'
import type { Route } from './+types/unirse.$token'
import { createSupabaseAdminClient } from '~/lib/supabase.admin.server'
import { createSupabaseServerClient } from '~/lib/supabase.server'
import { UserPlus, XCircle } from 'lucide-react'

export function meta({ data }: Route.MetaArgs) {
  const nombre = (data as any)?.clinicaNombre
  return [{ title: nombre ? `Crear cuenta — ${nombre}` : 'Crear cuenta' }]
}

// Valida el enlace: debe existir, no estar usado y no estar vencido.
async function cargarInvitacion(token: string) {
  const admin = createSupabaseAdminClient()
  const { data: inv } = await admin
    .from('invitaciones')
    .select('id,clinica_id,rol,usada_at,expira_at,clinicas(nombre)')
    .eq('token', token)
    .maybeSingle()
  if (!inv) return { admin, inv: null as null, motivo: 'invalido' as const }
  if (inv.usada_at) return { admin, inv: null, motivo: 'usado' as const }
  if (new Date(inv.expira_at as string) < new Date()) return { admin, inv: null, motivo: 'vencido' as const }
  return { admin, inv, motivo: null }
}

export async function loader({ params }: Route.LoaderArgs) {
  const { inv, motivo } = await cargarInvitacion(params.token as string)
  if (!inv) return { valido: false as const, motivo }
  return {
    valido: true as const,
    rol: inv.rol as string,
    clinicaNombre: (inv.clinicas as any)?.nombre ?? 'la clínica',
  }
}

export async function action({ params, request }: Route.ActionArgs) {
  const { admin, inv, motivo } = await cargarInvitacion(params.token as string)
  if (!inv) {
    return { ok: false, error: motivo === 'usado' ? 'Este enlace ya fue utilizado.' : 'Este enlace no es válido o venció.' }
  }

  const fd = await request.formData()
  const nombre = ((fd.get('nombre') as string) ?? '').trim()
  const email = ((fd.get('email') as string) ?? '').trim().toLowerCase()
  const password = (fd.get('password') as string) ?? ''
  const confirm = (fd.get('confirm') as string) ?? ''

  if (!nombre || !email) return { ok: false, error: 'Completa tu nombre y correo.' }
  if (password.length < 8) return { ok: false, error: 'La contraseña debe tener al menos 8 caracteres.' }
  if (password !== confirm) return { ok: false, error: 'Las contraseñas no coinciden.' }

  // crea la cuenta ya confirmada: no se envía ningún correo, así que no
  // dependemos del proveedor de email ni de sus límites
  const { data: creado, error: crearErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { clinica_id: inv.clinica_id },
  })
  if (crearErr || !creado?.user) {
    const yaExiste = crearErr?.status === 422 || /already/i.test(crearErr?.message ?? '')
    return {
      ok: false,
      error: yaExiste
        ? 'Ya existe una cuenta con ese correo. Inicia sesión con tu contraseña.'
        : (crearErr?.message ?? 'No se pudo crear la cuenta.'),
    }
  }

  const { error: perfilErr } = await admin.from('perfiles').upsert(
    { id: creado.user.id, clinica_id: inv.clinica_id, rol: inv.rol, email, nombre },
    { onConflict: 'id' },
  )
  if (perfilErr) return { ok: false, error: perfilErr.message }

  // marca el enlace como usado (de un solo uso)
  await admin.from('invitaciones')
    .update({ usada_at: new Date().toISOString(), usada_por: creado.user.id })
    .eq('id', inv.id)

  // inicia sesión y entra al dashboard (ahí verá la bienvenida de su rol)
  const { supabase, headers } = createSupabaseServerClient(request)
  const { error: loginErr } = await supabase.auth.signInWithPassword({ email, password })
  if (loginErr) return { ok: false, error: 'Cuenta creada. Ya puedes iniciar sesión con tu correo y contraseña.' }
  throw redirect('/dashboard', { headers })
}

const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function Unirse() {
  const data = useLoaderData<typeof loader>()
  const actionData = useActionData<typeof action>()
  const navigation = useNavigation()
  const enviando = navigation.state === 'submitting'

  if (!data.valido) {
    const msg =
      data.motivo === 'usado' ? 'Este enlace ya fue utilizado para crear una cuenta.'
      : data.motivo === 'vencido' ? 'Este enlace venció.'
      : 'Este enlace no es válido.'
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-sm w-full bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <XCircle className="text-gray-400" size={24} />
          </div>
          <p className="font-semibold text-gray-900">Enlace no disponible</p>
          <p className="text-sm text-gray-500 mt-2">{msg}</p>
          <p className="text-xs text-gray-400 mt-3">
            Pide a la clínica que te envíe un enlace nuevo. Si ya tienes cuenta,{' '}
            <a href="/login" className="text-blue-600 hover:underline">inicia sesión</a>.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-sm mx-auto">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center mx-auto mb-3">
            <UserPlus className="text-white" size={24} />
          </div>
          <h1 className="text-xl font-bold text-gray-900">{data.clinicaNombre}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Crea tu cuenta para acceder al sistema</p>
          <span className="inline-block mt-3 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold capitalize">
            Rol asignado: {data.rol}
          </span>
        </div>

        <Form method="post" className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nombre completo <span className="text-red-500">*</span></label>
            <input name="nombre" required autoFocus placeholder="Tu nombre" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Correo electrónico <span className="text-red-500">*</span></label>
            <input name="email" type="email" required autoComplete="email" placeholder="correo@ejemplo.com" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Contraseña <span className="text-red-500">*</span></label>
            <input name="password" type="password" required minLength={8} autoComplete="new-password" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Repite la contraseña <span className="text-red-500">*</span></label>
            <input name="confirm" type="password" required minLength={8} autoComplete="new-password" className={inputCls} />
          </div>

          {actionData?.ok === false && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{actionData.error}</p>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {enviando ? 'Creando cuenta…' : 'Crear cuenta y entrar'}
          </button>
          <p className="text-xs text-gray-400 text-center">
            Este enlace es personal y de un solo uso.
          </p>
        </Form>
      </div>
    </div>
  )
}
