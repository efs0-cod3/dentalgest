import { describe, it, expect, vi, beforeEach } from 'vitest'

// Pruebas del action de recetas: quién puede emitir y qué se rechaza antes de
// escribir nada. La inmutabilidad y la numeración se prueban en la base.

const estado = vi.hoisted(() => ({
  sesion: { clinicaId: 'clinica-1', rol: 'doctor', doctorId: 'doctor-1', userId: 'u1' },
  doctor: null as null | { id: string; nombre: string; exequatur: string | null; especialidad: string | null; firma_path: string | null },
  paciente: null as null | { nombre: string; fecha_nacimiento: string | null; cedula: string | null },
  rpcLlamadas: [] as string[],
}))

function crearSupabase() {
  function from(tabla: string) {
    const resultado =
      tabla === 'doctores' ? { data: estado.doctor, error: null }
      : tabla === 'pacientes' ? { data: estado.paciente, error: null }
      : tabla === 'clinicas' ? {
          data: {
            nombre: 'NDC', direccion: 'Calle 1', telefono: '809', email: null,
            rnc: null, sello_path: null, logo_path: null,
          },
          error: null,
        }
      : { data: null, error: null }

    const cadena: any = {
      select: () => cadena,
      eq: () => cadena,
      maybeSingle: () => Promise.resolve(resultado),
      single: () => Promise.resolve(resultado),
      then: (ok: any, mal: any) => Promise.resolve(resultado).then(ok, mal),
    }
    return cadena
  }

  return {
    from,
    rpc: async (fn: string) => {
      estado.rpcLlamadas.push(fn)
      return { data: 'receta-1', error: null }
    },
  }
}

vi.mock('~/lib/supabase.server', () => ({
  createSupabaseServerClient: () => ({ supabase: crearSupabase(), headers: new Headers() }),
}))

vi.mock('~/lib/clinica.server', () => ({
  getSesion: async () => estado.sesion,
}))

const { action } = await import('./api.recetas')

const PACIENTE = '11111111-1111-4111-8111-111111111111'

const itemValido = { medicamento: 'Amoxicilina', dosis: '1 cápsula', frecuencia: 'Cada 8 horas' }

function peticion(campos: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.append(k, v)
  return { request: new Request('http://localhost/api/recetas', { method: 'POST', body: fd }) } as any
}

const emisionValida = {
  intent: 'emitir',
  paciente_id: PACIENTE,
  items: JSON.stringify([itemValido]),
}

beforeEach(() => {
  estado.sesion = { clinicaId: 'clinica-1', rol: 'doctor', doctorId: 'doctor-1', userId: 'u1' }
  estado.doctor = { id: 'doctor-1', nombre: 'Dr. Nin', exequatur: '12345-6', especialidad: 'O. General', firma_path: null }
  estado.paciente = { nombre: 'Ana Pérez', fecha_nacimiento: '1990-05-10', cedula: '001-0000000-1' }
  estado.rpcLlamadas = []
})

describe('emitir receta', () => {
  it('emite cuando el doctor tiene exequátur', async () => {
    const r = await action(peticion(emisionValida))
    const json = await r.json()
    expect(json.ok).toBe(true)
    expect(json.id).toBe('receta-1')
    expect(estado.rpcLlamadas).toContain('emitir_prescripcion')
  })

  it('no deja emitir sin exequátur, y no llama a la base', async () => {
    estado.doctor = { ...estado.doctor!, exequatur: null }
    const r = await action(peticion(emisionValida))
    const json = await r.json()
    expect(json.ok).toBe(false)
    expect(json.error).toContain('exequátur')
    expect(estado.rpcLlamadas).toEqual([])
  })

  it('no deja emitir con el exequátur en blanco', async () => {
    estado.doctor = { ...estado.doctor!, exequatur: '   ' }
    const json = await (await action(peticion(emisionValida))).json()
    expect(json.ok).toBe(false)
    expect(estado.rpcLlamadas).toEqual([])
  })

  it('no deja emitir a recepción', async () => {
    estado.sesion = { ...estado.sesion, rol: 'recepcionista' }
    const r = await action(peticion(emisionValida))
    expect(r.status).toBe(403)
    const json = await r.json()
    expect(json.ok).toBe(false)
    expect(json.error).toContain('rol')
    expect(estado.rpcLlamadas).toEqual([])
  })

  it('no deja emitir a laboratorio', async () => {
    estado.sesion = { ...estado.sesion, rol: 'laboratorio' }
    const json = await (await action(peticion(emisionValida))).json()
    expect(json.ok).toBe(false)
    expect(estado.rpcLlamadas).toEqual([])
  })

  it('deja emitir al admin que también atiende', async () => {
    estado.sesion = { ...estado.sesion, rol: 'admin' }
    const json = await (await action(peticion(emisionValida))).json()
    expect(json.ok).toBe(true)
  })

  it('no deja emitir si la cuenta no está ligada a un doctor', async () => {
    estado.sesion = { ...estado.sesion, doctorId: null as any }
    estado.doctor = null
    const json = await (await action(peticion(emisionValida))).json()
    expect(json.ok).toBe(false)
    expect(json.error).toContain('no está ligada')
    expect(estado.rpcLlamadas).toEqual([])
  })

  it('rechaza una receta sin medicamentos', async () => {
    const json = await (await action(peticion({ ...emisionValida, items: '[]' }))).json()
    expect(json.ok).toBe(false)
    expect(json.error).toContain('al menos un medicamento')
    expect(estado.rpcLlamadas).toEqual([])
  })

  it('rechaza un medicamento sin dosis', async () => {
    const items = JSON.stringify([{ medicamento: 'Amoxicilina', frecuencia: 'Cada 8 horas' }])
    const json = await (await action(peticion({ ...emisionValida, items }))).json()
    expect(json.ok).toBe(false)
    expect(estado.rpcLlamadas).toEqual([])
  })

  it('rechaza un paciente que no es de la clínica', async () => {
    estado.paciente = null
    const json = await (await action(peticion(emisionValida))).json()
    expect(json.ok).toBe(false)
    expect(json.error).toContain('no existe en tu clínica')
    expect(estado.rpcLlamadas).toEqual([])
  })
})

describe('anular receta', () => {
  it('anula con motivo', async () => {
    const json = await (await action(peticion({
      intent: 'anular', id: 'receta-1', motivo: 'Dosis equivocada, se emite otra',
    }))).json()
    expect(json.ok).toBe(true)
    expect(estado.rpcLlamadas).toContain('anular_prescripcion')
  })

  it('no anula sin motivo', async () => {
    for (const motivo of ['', '  ', 'ab']) {
      estado.rpcLlamadas = []
      const json = await (await action(peticion({ intent: 'anular', id: 'receta-1', motivo }))).json()
      expect(json.ok, motivo).toBe(false)
      expect(estado.rpcLlamadas).toEqual([])
    }
  })
})

describe('intent desconocido', () => {
  it('se rechaza', async () => {
    const json = await (await action(peticion({ intent: 'borrar' }))).json()
    expect(json.ok).toBe(false)
  })
})
