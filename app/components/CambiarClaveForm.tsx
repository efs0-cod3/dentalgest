import { useFetcher } from 'react-router'
import { Link } from 'react-router'

// Formulario para cambiar la propia contraseña.
//
// Envía al action de /dashboard/cambiar-clave, así que la validación y el
// manejo de cookies de sesión viven en un solo sitio, lo use la página
// dedicada o la pestaña de Configuración.

export const MIN_LARGO_CLAVE = 8

const inputCls =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'

export function CambiarClaveForm({ conEnlaceAlInicio = false }: { conEnlaceAlInicio?: boolean }) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>()
  const guardando = fetcher.state !== 'idle'

  if (fetcher.data?.ok) {
    return (
      <div className="space-y-4">
        <div className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-3">
          <p className="font-medium">Contraseña cambiada</p>
          <p className="mt-1 text-green-700">
            A partir de ahora entra con la nueva. Si tenías la sesión abierta en otro dispositivo,
            puede seguir abierta; ciérrala desde ahí si hace falta.
          </p>
        </div>
        {conEnlaceAlInicio && (
          <Link to="/dashboard"
            className="block w-full text-center bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 cursor-pointer transition-colors">
            Volver al inicio
          </Link>
        )}
      </div>
    )
  }

  return (
    <fetcher.Form method="post" action="/dashboard/cambiar-clave" className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="actual">
          Contraseña actual
        </label>
        <input id="actual" name="actual" type="password" required autoComplete="current-password"
          className={inputCls} />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="nueva">
          Contraseña nueva
        </label>
        <input id="nueva" name="nueva" type="password" required minLength={MIN_LARGO_CLAVE}
          autoComplete="new-password" className={inputCls} />
        <p className="text-xs text-gray-400 mt-1">Al menos {MIN_LARGO_CLAVE} caracteres.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="confirmar">
          Repite la contraseña nueva
        </label>
        <input id="confirmar" name="confirmar" type="password" required minLength={MIN_LARGO_CLAVE}
          autoComplete="new-password" className={inputCls} />
      </div>

      {fetcher.data?.ok === false && fetcher.data.error && (
        <p className="text-sm text-red-600">{fetcher.data.error}</p>
      )}

      <button type="submit" disabled={guardando}
        className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 cursor-pointer disabled:cursor-default transition-colors">
        {guardando ? 'Guardando…' : 'Cambiar contraseña'}
      </button>
    </fetcher.Form>
  )
}
