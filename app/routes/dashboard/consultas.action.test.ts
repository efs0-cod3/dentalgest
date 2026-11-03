import { describe, it, expect, vi, beforeEach } from 'vitest'

// Pruebas del action de Consultas centradas en una cosa: que un código CIE-10
// que no está en el catálogo NO se pueda guardar, y que no se escriba nada
// cuando la validación falla.

const estado = vi.hoisted(() => ({
  // códigos que el catálogo simulado da por buenos
  codigosEnCatalogo: ['K02.1', 'K05.3'] as string[],
  escrituras: [] as string[],
}))

function crearSupabase() {
  function from(tabla: string) {
    const resultado =
      tabla === 'cie10_codigos'
        ? { data: estado.codigosEnCatalogo.map(codigo => ({ codigo })), error: null }
        : { data: { id: 'entrada-1' }, error: null }

    const cadena: any = {
      select: () => cadena,
      eq: () => cadena,
      in: () => cadena,
      single: () => Promise.resolve(resultado),
      insert: () => { estado.escrituras.push(`insert:${tabla}`); return cadena },
      update: () => { estado.escrituras.push(`update:${tabla}`); return cadena },
      delete: () => { estado.escrituras.push(`delete:${tabla}`); return cadena },
      then: (ok: any, mal: any) => Promise.resolve(resultado).then(ok, mal),
    }
    return cadena
  }

  return {
    from,
    rpc: async (fn: string) => { estado.escrituras.push(`rpc:${fn}`); return { error: null } },
  }
}

vi.mock('~/lib/supabase.server', () => ({
  createSupabaseServerClient: () => ({ supabase: crearSupabase(), headers: new Headers() }),
}))

vi.mock('~/lib/clinica.server', () => ({
  requireSeccion: async () => ({ userId: 'u1', clinicaId: 'clinica-1', rol: 'admin', doctorId: null }),
}))

const { action } = await import('./consultas')

function peticion(campos: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.append(k, v)
  return { request: new Request('http://localhost/dashboard/consultas', { method: 'POST', body: fd }) } as any
}

const base = {
  intent: 'create',
  paciente_id: 'paciente-1',
  fecha: '2026-11-03T10:00',
  tipo: 'diagnostico',
}

beforeEach(() => {
  estado.codigosEnCatalogo = ['K02.1', 'K05.3']
  estado.escrituras = []
})

describe('action de consultas: diagnósticos CIE-10', () => {
  it('rechaza un código que no existe en el catálogo y no escribe nada', async () => {
    const r: any = await action(peticion({
      ...base,
      titulo: 'Algo',
      diagnosticos: JSON.stringify([{ cie10_codigo: 'K99.9' }]),
    }))

    expect(r.ok).toBe(false)
    expect(r.error).toContain('K99.9')
    expect(estado.escrituras).toEqual([])
  })

  it('rechaza un código desactivado en el catálogo', async () => {
    estado.codigosEnCatalogo = [] // como si estuviera activo = false
    const r: any = await action(peticion({
      ...base,
      titulo: 'Algo',
      diagnosticos: JSON.stringify([{ cie10_codigo: 'K02.1' }]),
    }))

    expect(r.ok).toBe(false)
    expect(estado.escrituras).toEqual([])
  })

  it('rechaza una pieza dental fuera del rango FDI', async () => {
    const r: any = await action(peticion({
      ...base,
      titulo: 'Algo',
      diagnosticos: JSON.stringify([{ cie10_codigo: 'K02.1', pieza_dental: 99 }]),
    }))

    expect(r.ok).toBe(false)
    expect(estado.escrituras).toEqual([])
  })

  it('rechaza una entrada sin código y sin texto libre', async () => {
    const r: any = await action(peticion({ ...base, titulo: '   ', diagnosticos: '[]' }))

    expect(r.ok).toBe(false)
    expect(estado.escrituras).toEqual([])
  })

  it('guarda cuando solo hay código, sin texto libre', async () => {
    const r: any = await action(peticion({
      ...base,
      titulo: '',
      diagnosticos: JSON.stringify([{ cie10_codigo: 'K02.1', pieza_dental: 46 }]),
    }))

    expect(r.ok).toBe(true)
    expect(estado.escrituras).toContain('insert:expediente_entradas')
    expect(estado.escrituras).toContain('rpc:guardar_diagnosticos_entrada')
  })

  it('guarda cuando solo hay texto libre, sin código (como las entradas de siempre)', async () => {
    const r: any = await action(peticion({
      ...base,
      titulo: 'Caries en molar inferior derecho',
      diagnosticos: '[]',
    }))

    expect(r.ok).toBe(true)
    expect(estado.escrituras).toContain('insert:expediente_entradas')
  })

  it('sigue exigiendo un paciente', async () => {
    const r: any = await action(peticion({ ...base, paciente_id: '', titulo: 'Algo' }))
    expect(r.ok).toBe(false)
    expect(estado.escrituras).toEqual([])
  })
})
