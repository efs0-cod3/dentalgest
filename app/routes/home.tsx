import { useEffect } from 'react'

// Entrada del sitio.
//
// Supabase aterriza en el Site URL —o sea aquí— cada vez que el redirectTo del
// enlace no está en su lista de permitidos. Así que esta página tiene que
// saber reenviar lo que traiga, en las dos formas posibles:
//
//   * PKCE (la recuperación de contraseña de hoy): el código viene en la
//     QUERY, /?code=…
//   * El flujo antiguo de invitaciones: los tokens vienen en el FRAGMENTO,
//     /#access_token=…
//
// Por eso NO redirige desde el servidor: el fragmento nunca llega al servidor,
// y un redirect de servidor además se llevaría por delante la query. Si había
// sesión abierta, /dashboard cargaba y el enlace se perdía en silencio — que
// es exactamente por qué la recuperación terminaba devolviendo al login.

export default function Home() {
  useEffect(() => {
    const { hash, search } = window.location

    if (hash.includes('access_token') || hash.includes('error_description')) {
      window.location.replace('/auth/confirmar' + hash)
      return
    }

    const q = new URLSearchParams(search)
    if (q.has('code') || q.has('error_description')) {
      window.location.replace('/auth/confirmar' + search)
      return
    }

    window.location.replace('/dashboard')
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-sm text-gray-400">Abriendo…</p>
    </div>
  )
}
