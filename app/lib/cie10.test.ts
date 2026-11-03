import { describe, it, expect } from 'vitest'
import {
  CIE10_CODIGO_RE,
  MAX_NOTAS_DIAGNOSTICO,
  MAX_DIAGNOSTICOS_POR_ENTRADA,
  esPiezaFdiValida,
  piezasFdi,
  cie10CodigoSchema,
  piezaDentalSchema,
  diagnosticoSchema,
  parsearDiagnosticos,
  validarDiagnosticoMinimo,
  etiquetaDiagnostico,
  titularEntrada,
} from './cie10'

describe('formato del código CIE-10', () => {
  it('acepta categorías de 3 caracteres y subcategorías de 4', () => {
    for (const codigo of ['K02', 'K02.1', 'K00.0', 'S02.5', 'K12.0']) {
      expect(cie10CodigoSchema.safeParse(codigo).success, codigo).toBe(true)
    }
  })

  it('normaliza espacios y minúsculas', () => {
    expect(cie10CodigoSchema.parse('  k02.1 ')).toBe('K02.1')
  })

  it('rechaza códigos ICD-10-CM de EE. UU. de 5+ caracteres', () => {
    // K02.51 es ICD-10-CM, no CIE-10 de la OMS: no sirve para reclamaciones.
    expect(cie10CodigoSchema.safeParse('K02.51').success).toBe(false)
    expect(CIE10_CODIGO_RE.test('K02.51')).toBe(false)
  })

  it('rechaza basura', () => {
    for (const codigo of ['', 'K', 'K2', 'KK2', '021', 'K02.', 'K02.A', 'caries', 'K02..1', '<script>']) {
      expect(cie10CodigoSchema.safeParse(codigo).success, codigo).toBe(false)
    }
  })
})

describe('piezas dentales (numeración FDI)', () => {
  it('acepta permanentes de los cuatro cuadrantes', () => {
    for (const pieza of [11, 18, 21, 28, 31, 38, 41, 48, 46]) {
      expect(esPiezaFdiValida(pieza), String(pieza)).toBe(true)
    }
  })

  it('acepta temporales de los cuatro cuadrantes', () => {
    for (const pieza of [51, 55, 61, 65, 71, 75, 81, 85]) {
      expect(esPiezaFdiValida(pieza), String(pieza)).toBe(true)
    }
  })

  it('rechaza números fuera del rango FDI', () => {
    // 19/29 no existen (los permanentes llegan a 8), 56/86 tampoco (los
    // temporales llegan a 5), y los cuadrantes van de 1 a 8.
    for (const pieza of [0, 1, 9, 10, 19, 20, 29, 39, 49, 50, 56, 66, 76, 86, 91, 99, 100, -11]) {
      expect(esPiezaFdiValida(pieza), String(pieza)).toBe(false)
    }
  })

  it('rechaza decimales', () => {
    expect(esPiezaFdiValida(46.5)).toBe(false)
  })

  it('genera exactamente las 52 piezas FDI', () => {
    const piezas = piezasFdi()
    expect(piezas).toHaveLength(32 + 20)
    expect(piezas.every(esPiezaFdiValida)).toBe(true)
  })

  it('el esquema acepta vacío como "sin pieza"', () => {
    expect(piezaDentalSchema.parse('')).toBeUndefined()
    expect(piezaDentalSchema.parse(null)).toBeUndefined()
    expect(piezaDentalSchema.parse(undefined)).toBeUndefined()
  })

  it('el esquema convierte texto a número y valida el rango', () => {
    expect(piezaDentalSchema.parse('46')).toBe(46)
    expect(piezaDentalSchema.safeParse('19').success).toBe(false)
    expect(piezaDentalSchema.safeParse('99').success).toBe(false)
  })
})

describe('diagnóstico completo', () => {
  it('acepta un diagnóstico con pieza y notas', () => {
    const r = diagnosticoSchema.safeParse({ cie10_codigo: 'K02.1', pieza_dental: '46', notas: ' dolor al frío ' })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data).toEqual({ cie10_codigo: 'K02.1', pieza_dental: 46, notas: 'dolor al frío' })
    }
  })

  it('acepta un diagnóstico general, sin pieza', () => {
    const r = diagnosticoSchema.safeParse({ cie10_codigo: 'K05.3' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.pieza_dental).toBeUndefined()
  })

  it('rechaza notas demasiado largas', () => {
    const r = diagnosticoSchema.safeParse({ cie10_codigo: 'K02.1', notas: 'x'.repeat(MAX_NOTAS_DIAGNOSTICO + 1) })
    expect(r.success).toBe(false)
  })
})

describe('parsearDiagnosticos', () => {
  it('trata el campo vacío como lista vacía', () => {
    expect(parsearDiagnosticos('')).toEqual({ ok: true, diagnosticos: [] })
    expect(parsearDiagnosticos(null)).toEqual({ ok: true, diagnosticos: [] })
  })

  it('lee una lista válida', () => {
    const r = parsearDiagnosticos(JSON.stringify([{ cie10_codigo: 'K02.1', pieza_dental: 46 }]))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.diagnosticos).toHaveLength(1)
  })

  it('rechaza JSON mal formado', () => {
    expect(parsearDiagnosticos('{no es json').ok).toBe(false)
  })

  it('rechaza un código inválido dentro de la lista', () => {
    const r = parsearDiagnosticos(JSON.stringify([{ cie10_codigo: 'K02.1' }, { cie10_codigo: 'XXX' }]))
    expect(r.ok).toBe(false)
  })

  it('rechaza el mismo código repetido en la misma pieza', () => {
    const r = parsearDiagnosticos(JSON.stringify([
      { cie10_codigo: 'K02.1', pieza_dental: 46 },
      { cie10_codigo: 'K02.1', pieza_dental: 46 },
    ]))
    expect(r.ok).toBe(false)
  })

  it('permite el mismo código en piezas distintas', () => {
    const r = parsearDiagnosticos(JSON.stringify([
      { cie10_codigo: 'K02.1', pieza_dental: 46 },
      { cie10_codigo: 'K02.1', pieza_dental: 36 },
    ]))
    expect(r.ok).toBe(true)
  })

  it('rechaza más diagnósticos que el tope', () => {
    const muchos = Array.from({ length: MAX_DIAGNOSTICOS_POR_ENTRADA + 1 }, (_, i) => ({
      cie10_codigo: 'K02.1',
      pieza_dental: piezasFdi()[i],
    }))
    expect(parsearDiagnosticos(JSON.stringify(muchos)).ok).toBe(false)
  })
})

describe('regla de al menos uno de los dos', () => {
  it('deja guardar solo con código', () => {
    expect(validarDiagnosticoMinimo('', [{ cie10_codigo: 'K02.1' }])).toBeNull()
  })

  it('deja guardar solo con texto libre', () => {
    expect(validarDiagnosticoMinimo('Caries en molar inferior derecho', [])).toBeNull()
  })

  it('no deja guardar sin ninguno de los dos', () => {
    expect(validarDiagnosticoMinimo('   ', [])).not.toBeNull()
    expect(validarDiagnosticoMinimo(null, [])).not.toBeNull()
  })
})

describe('presentación', () => {
  it('arma la etiqueta con descripción y pieza', () => {
    expect(etiquetaDiagnostico({
      cie10_codigo: 'K02.1', pieza_dental: 46, notas: null,
      cie10_codigos: { descripcion: 'Caries de la dentina' },
    })).toBe('K02.1 — Caries de la dentina · pieza 46')
  })

  it('omite la pieza en un diagnóstico general', () => {
    expect(etiquetaDiagnostico({
      cie10_codigo: 'K05.3', pieza_dental: null, notas: null,
      cie10_codigos: { descripcion: 'Periodontitis crónica' },
    })).toBe('K05.3 — Periodontitis crónica')
  })

  it('usa el código si falta la descripción', () => {
    expect(etiquetaDiagnostico({ cie10_codigo: 'K02.1', pieza_dental: null, notas: null, cie10_codigos: null }))
      .toBe('K02.1')
  })

  it('una entrada antigua sin códigos conserva su texto como titular', () => {
    expect(titularEntrada('Caries en molar inferior derecho', [])).toBe('Caries en molar inferior derecho')
    expect(titularEntrada('Caries en molar inferior derecho', null)).toBe('Caries en molar inferior derecho')
  })

  it('una entrada con código usa el código como titular', () => {
    expect(titularEntrada('nota cualquiera', [
      { cie10_codigo: 'K02.1', pieza_dental: 46, notas: null, cie10_codigos: { descripcion: 'Caries de la dentina' } },
    ])).toBe('K02.1 — Caries de la dentina · pieza 46')
  })
})
