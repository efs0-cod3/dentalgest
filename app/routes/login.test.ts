import { describe, it, expect, vi, beforeEach } from 'vitest'

// Lo que le queda propio al login tras mover la recuperación a /recuperar:
// entrar con contraseña y el aviso al volver de un cambio.
//
// Igual que en recuperar.test.ts, se vigila que las cabeceras de Supabase
// sobrevivan a todas las salidas: ahí viajan las cookies de sesión.

const estado = vi.hoisted(() => ({
  cabeceras: new Headers(),
  errorLogin: null as null | { message: string },
  llamadas: [] as string[],
}))

function crearSupabase() {
  return {
    auth: {
      getUser: async () => ({ data: { user: null } }),
      signInWithPassword: async () => {
        estado.llamadas.push('login')
        estado.cabeceras.append('Set-Cookie', 'sb-auth-token=xyz; Path=/')
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
  estado.errorLogin = null
  estado.llamadas = []
})

describe('iniciar sesión', () => {
  it('entra y redirige al panel', async () => {
    const r = await action(peticion({ email: 'a@b.com', password: 'secreta123' }))
    expect(estado.llamadas).toContain('login')
    expect(r instanceof Response).toBe(true)
    expect((r as Response).status).toBe(302)
  })

  it('devuelve el error sin perder las cabeceras', async () => {
    estado.errorLogin = { message: 'Invalid login credentials' }
    const r = await action(peticion({ email: 'a@b.com', password: 'mala' }))

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
