import { createSupabaseServerClient } from '~/lib/supabase.server'

// Autocompletado del catálogo CIE-10.
//
// El filtrado, el orden y el tope de 20 viven en la función buscar_cie10 de la
// base: así el acento ("pulpítis" / "pulpitis") y la prioridad por prefijo se
// resuelven en SQL. La función es security invoker, así que la RLS del
// catálogo (lectura solo para autenticados) sigue aplicando.
export async function loader({ request }: { request: Request }) {
  const { supabase } = createSupabaseServerClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ resultados: [] }, { status: 401 })

  const q = (new URL(request.url).searchParams.get('q') ?? '').trim()
  // con una sola letra el listado no dice nada útil
  if (q.length < 2) return Response.json({ resultados: [] })

  const { data, error } = await supabase.rpc('buscar_cie10', { q })
  if (error) return Response.json({ resultados: [], error: error.message }, { status: 500 })

  return Response.json({ resultados: data ?? [] })
}
