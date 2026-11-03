import { z } from 'zod'

// Validación de los diagnósticos CIE-10 de una entrada clínica.
//
// Todo lo de este archivo es puro (sin red ni base de datos) para poder
// probarlo, y se usa en el SERVIDOR: el navegador puede saltarse cualquier
// validación de formulario, así que la que cuenta es esta.

/**
 * Formato de la CIE-10 de la OMS: una letra, dos dígitos y una subcategoría
 * opcional de un dígito. Ej. `K02`, `K02.1`, `S02.5`.
 *
 * A propósito NO acepta ICD-10-CM de EE. UU. (`K02.51`), que es otra
 * clasificación y no sirve para reclamaciones aquí.
 */
export const CIE10_CODIGO_RE = /^[A-Z][0-9]{2}(\.[0-9])?$/

/** Tope de caracteres de la nota de un diagnóstico. */
export const MAX_NOTAS_DIAGNOSTICO = 500

/** Tope de diagnósticos por entrada clínica. */
export const MAX_DIAGNOSTICOS_POR_ENTRADA = 20

/**
 * Numeración FDI de las piezas dentales:
 * permanentes 11-18, 21-28, 31-38, 41-48;
 * temporales  51-55, 61-65, 71-75, 81-85.
 */
export function esPiezaFdiValida(n: number): boolean {
  if (!Number.isInteger(n)) return false
  const cuadrante = Math.floor(n / 10)
  const pieza = n % 10
  if (cuadrante >= 1 && cuadrante <= 4) return pieza >= 1 && pieza <= 8
  if (cuadrante >= 5 && cuadrante <= 8) return pieza >= 1 && pieza <= 5
  return false
}

/** Todas las piezas FDI válidas, para armar el selector. */
export function piezasFdi(): number[] {
  const piezas: number[] = []
  for (let cuadrante = 1; cuadrante <= 4; cuadrante++) {
    for (let pieza = 1; pieza <= 8; pieza++) piezas.push(cuadrante * 10 + pieza)
  }
  for (let cuadrante = 5; cuadrante <= 8; cuadrante++) {
    for (let pieza = 1; pieza <= 5; pieza++) piezas.push(cuadrante * 10 + pieza)
  }
  return piezas
}

export const cie10CodigoSchema = z
  .string({ message: 'Código CIE-10 inválido.' })
  .transform(s => s.trim().toUpperCase())
  .refine(s => CIE10_CODIGO_RE.test(s), { message: 'Código CIE-10 inválido.' })

export const piezaDentalSchema = z.preprocess(
  v => (v === '' || v === null || v === undefined ? undefined : typeof v === 'string' ? Number(v) : v),
  z
    .number({ message: 'Pieza dental inválida.' })
    .refine(esPiezaFdiValida, { message: 'Pieza dental fuera del rango FDI (11-48 o 51-85).' })
    .optional(),
)

export const notasDiagnosticoSchema = z.preprocess(
  v => {
    if (typeof v !== 'string') return undefined
    const limpio = v.trim()
    return limpio === '' ? undefined : limpio
  },
  z
    .string()
    .max(MAX_NOTAS_DIAGNOSTICO, { message: `La nota no puede pasar de ${MAX_NOTAS_DIAGNOSTICO} caracteres.` })
    .optional(),
)

export const diagnosticoSchema = z.object({
  cie10_codigo: cie10CodigoSchema,
  pieza_dental: piezaDentalSchema,
  notas: notasDiagnosticoSchema,
})

export const diagnosticosSchema = z
  .array(diagnosticoSchema)
  .max(MAX_DIAGNOSTICOS_POR_ENTRADA, {
    message: `No se pueden registrar más de ${MAX_DIAGNOSTICOS_POR_ENTRADA} diagnósticos en una entrada.`,
  })

export type Diagnostico = z.infer<typeof diagnosticoSchema>

/** Un diagnóstico ya guardado, tal como lo devuelve el loader. */
export type DiagnosticoGuardado = {
  cie10_codigo: string
  pieza_dental: number | null
  notas: string | null
  cie10_codigos: { descripcion: string } | null
}

/**
 * Lee los diagnósticos del formulario. Viajan como un solo campo oculto con
 * JSON, porque son una lista de objetos con campos opcionales.
 *
 * Devuelve la lista válida o un mensaje de error listo para mostrar.
 */
export function parsearDiagnosticos(
  raw: FormDataEntryValue | null | undefined,
): { ok: true; diagnosticos: Diagnostico[] } | { ok: false; error: string } {
  if (raw === null || raw === undefined || raw === '') return { ok: true, diagnosticos: [] }
  if (typeof raw !== 'string') return { ok: false, error: 'Diagnósticos inválidos.' }

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'Diagnósticos inválidos.' }
  }

  const resultado = diagnosticosSchema.safeParse(json)
  if (!resultado.success) {
    return { ok: false, error: resultado.error.issues[0]?.message ?? 'Diagnósticos inválidos.' }
  }

  // Un mismo código repetido en la misma pieza no aporta nada.
  const vistos = new Set<string>()
  for (const d of resultado.data) {
    const clave = `${d.cie10_codigo}#${d.pieza_dental ?? ''}`
    if (vistos.has(clave)) {
      return { ok: false, error: `El diagnóstico ${d.cie10_codigo} está repetido.` }
    }
    vistos.add(clave)
  }

  return { ok: true, diagnosticos: resultado.data }
}

/**
 * Regla de la clínica: una entrada necesita AL MENOS UNO de los dos, código
 * CIE-10 o texto libre. Ninguno de los dos es obligatorio por su cuenta, para
 * que un código que falte en el catálogo no deje al doctor trancado.
 */
export function validarDiagnosticoMinimo(
  titulo: string | null | undefined,
  diagnosticos: Diagnostico[],
): string | null {
  const hayTexto = (titulo ?? '').trim().length > 0
  if (!hayTexto && diagnosticos.length === 0) {
    return 'Agrega al menos un diagnóstico CIE-10 o escribe las notas del diagnóstico.'
  }
  return null
}

/** `K02.1 — Caries de la dentina · pieza 46` */
export function etiquetaDiagnostico(d: DiagnosticoGuardado): string {
  const descripcion = d.cie10_codigos?.descripcion
  const base = descripcion ? `${d.cie10_codigo} — ${descripcion}` : d.cie10_codigo
  return d.pieza_dental ? `${base} · pieza ${d.pieza_dental}` : base
}

/**
 * Titular de una entrada en el historial: el primer código si lo hay, y si no
 * el texto libre de siempre. Así las entradas antiguas se ven igual que antes.
 */
export function titularEntrada(
  titulo: string | null | undefined,
  diagnosticos: DiagnosticoGuardado[] | null | undefined,
): string {
  const primero = diagnosticos?.[0]
  if (primero) return etiquetaDiagnostico(primero)
  return (titulo ?? '').trim() || 'Sin diagnóstico'
}
