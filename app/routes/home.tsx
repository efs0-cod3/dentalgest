import { useEffect } from 'react'

// Entrada del sitio.
//
// NO redirige desde el servidor a propósito. Supabase manda los tokens de los
// enlaces de invitación y de recuperación en el FRAGMENTO de la URL
// (#access_token=…), y el fragmento nunca llega al servidor. Como Supabase
// aterriza en el Site URL —o sea aquí— cada vez que el redirectTo no está en
// su lista de permitidos, un redirect de servidor haría rebotar el enlace sin
// procesarlo: y si además había sesión abierta, /dashboard cargaría y el token
// se perdería en silencio.
//
// Así que el salto se hace en el cliente, que sí ve el fragmento.

export default function Home() {
  useEffect(() => {
    const hash = window.location.hash
    if (hash.includes('access_token') || hash.includes('error_description')) {
      window.location.replace('/auth/confirmar' + hash)
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
