import { describe, it, expect, vi, beforeEach } from 'vitest'

// Regresión del flujo de recuperación de contraseña.
//
// El fallo que esto vigila: el action de "reset" devolvía un objeto pelado y
// descartaba las cabeceras del cliente de Supabase. En el flujo PKCE,
// resetPasswordForEmail escribe el VERIFICADOR en una cookie
// (`${storageKey}-code-verifier`, lo pone getCodeChallengeAndMethod), y
// _exchangeCodeForSession lo lee de ahí. Sin esa cookie el enlace del correo
// nunca se puede canjear por una sesión: el usuario acaba de vuelta en el
// login, que es el síntoma que se reportó.
//
// Por eso la prueba no mira el texto de la respuesta sino que las cabeceras
// sobrevivan a TODAS las salidas del action.

const estado = vi.hoisted(() => ({
  cabeceras: new Headers(),
  errorReset: null as null | { message: string },
  errorLogin: null as null | { message: string },
  llamadas: [] as string[],
}))

function crearSupabase() {
  return {
    auth: {
      getUser: async () => ({ data: { user: null } }),
      resetPasswordForEmail: async (_email: string, opciones: { redirectTo?: string }) => {
        estado.llamadas.push(`reset:${opciones?.redirectTo ?? ''}`)
        // Imita lo que hace el cliente real: guardar el verificador PKCE,
        // que el adaptador de cookies traduce en un Set-Cookie.
        estado.cabeceras.append('Set-Cookie', 'sb-auth-token-code-verifier=abc123; Path=/')
        return { error: estado.errorReset }
      },
      signInWithPassword: async () => {
        estado.llamadas.push('login')
        return { error: estado.errorLogin }
      },
    },
  }
}

vi.mock('~/lib/supabase.server', () => ({
  createSupabaseServerClient: () => ({ supabase: crearSupabase(), headers: estado.cabeceras }),
}))

const { action, loader } = await import('./login')

function peticion(campos: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.append(k, v)
  return {
    request: new Request('https://www.dentigest.com/login', { method: 'POST', body: fd }),
  } as any
}

/** Saca las cabeceras tanto de un data() como de un Response. */
function cabecerasDe(resultado: any): Headers | null {
  if (resultado instanceof Response) return resultado.headers
  if (resultado?.init?.headers) return new Headers(resultado.init.headers)
  return null
}

function datosDe(resultado: any) {
  return resultado?.data ?? resultado
}

beforeEach(() => {
  estado.cabeceras = new Headers()
  estado.errorReset = null
  estado.errorLogin = null
  estado.llamadas = []
})

describe('pedir el enlace de recuperación', () => {
  it('entrega las cookies de sesión, que es donde va el verificador PKCE', async () => {
    const r = await action(peticion({ intent: 'reset', email: 'alguien@ejemplo.com' }))
    const cabeceras = cabecerasDe(r)

    expect(cabeceras, 'el action tiene que devolver cabeceras').not.toBeNull()
    expect(cabeceras!.get('Set-Cookie')).toContain('code-verifier')
  })

  it('tampoco pierde las cookies cuando Supabase falla', async () => {
    estado.errorReset = { message: 'rate limit' }
    const r = await action(peticion({ intent: 'reset', email: 'alguien@ejemplo.com' }))

    expect(cabecerasDe(r)!.get('Set-Cookie')).toContain('code-verifier')
    expect(datosDe(r).error).toBe('rate limit')
  })

  it('apunta el enlace al mismo host desde el que se pidió', async () => {
    // Si el verificador queda en www.dentigest.com y el enlace vuelve a
    // dentigest.com, la cookie no viaja y el canje falla.
    await action(peticion({ intent: 'reset', email: 'alguien@ejemplo.com' }))
    expect(estado.llamadas[0]).toBe('reset:https://www.dentigest.com/auth/confirmar')
  })

  it('exige el correo sin llamar a Supabase', async () => {
    const r = await action(peticion({ intent: 'reset', email: '   ' }))
    expect(datosDe(r).error).toBeTruthy()
    expect(estado.llamadas).toEqual([])
  })

  it('no revela si el correo tiene cuenta', async () => {
    const r = await action(peticion({ intent: 'reset', email: 'noexiste@ejemplo.com' }))
    expect(datosDe(r).resetSent).toBe(true)
    expect(datosDe(r).error).toBeNull()
  })
})

describe('inicio de sesión', () => {
  it('sigue funcionando y entrega sus cookies', async () => {
    const r = await action(peticion({ intent: 'login', email: 'a@b.com', password: 'secreta123' }))
    expect(estado.llamadas).toContain('login')
    expect(r instanceof Response).toBe(true)
    expect((r as Response).status).toBe(302)
  })

  it('devuelve el error sin perder las cabeceras', async () => {
    estado.errorLogin = { message: 'Invalid login credentials' }
    estado.cabeceras.append('Set-Cookie', 'sb-algo=1; Path=/')
    const r = await action(peticion({ intent: 'login', email: 'a@b.com', password: 'mala' }))

    expect(datosDe(r).error).toBe('Invalid login credentials')
    expect(cabecerasDe(r)!.get('Set-Cookie')).toBeTruthy()
  })
})

describe('aviso de contraseña actualizada', () => {
  it('se enciende con ?password_updated=1', async () => {
    const r: any = await loader({
      request: new Request('https://www.dentigest.com/login?password_updated=1'),
    } as any)
    expect(datosDe(r).claveActualizada).toBe(true)
  })

  it('está apagado en una visita normal', async () => {
    const r: any = await loader({
      request: new Request('https://www.dentigest.com/login'),
    } as any)
    expect(datosDe(r).claveActualizada).toBe(false)
  })
})
