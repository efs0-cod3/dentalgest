import { createSupabaseServerClient } from '~/lib/supabase.server'

// Marca la bienvenida como vista para el usuario actual, para que no vuelva a
// mostrarse, y guarda su nombre si lo escribió ahí. Cada uno solo puede
// modificar su propia fila (RLS: auth.uid() = id).
export async function action({ request }: { request: Request }) {
  const { supabase } = createSupabaseServerClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ ok: false }, { status: 401 })

  const fd = await request.formData().catch(() => null)
  const nombre = ((fd?.get('nombre') as string) ?? '').trim()

  const updates: Record<string, unknown> = { onboarding_visto_at: new Date().toISOString() }
  if (nombre) updates.nombre = nombre

  const { error } = await supabase
    .from('perfiles')
    .update(updates)
    .eq('id', user.id)

  return Response.json({ ok: !error })
}
