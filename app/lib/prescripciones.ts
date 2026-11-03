import { z } from 'zod'

// Validación y presentación de las recetas.
//
// Puro a propósito (sin red ni base de datos) para poder probarlo. Se usa en el
// SERVIDOR: el navegador puede saltarse cualquier validación de formulario.

export const MAX_ITEMS_RECETA = 20

// Firma y sello: el tope lo valida el servidor, pero también se muestra en el
// formulario, así que vive aquí y no en el módulo .server (que el cliente no
// puede importar).
export const MAX_IMAGEN_BYTES = 1024 * 1024
export const IMAGEN_TIPOS_PERMITIDOS = ['image/png', 'image/jpeg']

export const MAX_LARGO_CAMPO = 120
export const MAX_LARGO_INDICACIONES = 300
export const MAX_LARGO_INDICACIONES_GENERALES = 1000
export const MAX_LARGO_MOTIVO_ANULACION = 500

/** Tamaños de papel que la vista de impresión sabe manejar. */
export const TAMANOS_PAPEL = ['media-carta', 'carta'] as const
export type TamanoPapel = (typeof TAMANOS_PAPEL)[number]

export function esTamanoPapel(v: string | null | undefined): v is TamanoPapel {
  return !!v && (TAMANOS_PAPEL as readonly string[]).includes(v)
}

/** Vías de administración de uso corriente, para el desplegable. */
export const VIAS = ['Oral', 'Tópica', 'Sublingual', 'Intramuscular', 'Intravenosa', 'Inhalatoria', 'Rectal', 'Oftálmica', 'Ótica'] as const

const textoObligatorio = (etiqueta: string, max = MAX_LARGO_CAMPO) =>
  z.preprocess(
    v => (typeof v === 'string' ? v.trim() : v),
    z
      .string({ message: `Falta ${etiqueta}.` })
      .min(1, { message: `Falta ${etiqueta}.` })
      .max(max, { message: `${etiqueta} no puede pasar de ${max} caracteres.` }),
  )

const textoOpcional = (etiqueta: string, max = MAX_LARGO_CAMPO) =>
  z.preprocess(
    v => {
      if (typeof v !== 'string') return undefined
      const limpio = v.trim()
      return limpio === '' ? undefined : limpio
    },
    z
      .string()
      .max(max, { message: `${etiqueta} no puede pasar de ${max} caracteres.` })
      .optional(),
  )

export const itemRecetaSchema = z.object({
  medicamento: textoObligatorio('el nombre del medicamento'),
  presentacion: textoOpcional('La presentación'),
  dosis: textoObligatorio('la dosis'),
  via: textoOpcional('La vía'),
  frecuencia: textoObligatorio('la frecuencia'),
  duracion: textoOpcional('La duración'),
  cantidad: textoOpcional('La cantidad'),
  indicaciones: textoOpcional('Las indicaciones', MAX_LARGO_INDICACIONES),
})

export const itemsRecetaSchema = z
  .array(itemRecetaSchema)
  .min(1, { message: 'La receta necesita al menos un medicamento.' })
  .max(MAX_ITEMS_RECETA, { message: `Una receta no puede llevar más de ${MAX_ITEMS_RECETA} medicamentos.` })

export const recetaSchema = z.object({
  paciente_id: z.string().uuid({ message: 'Selecciona un paciente.' }),
  consulta_id: z.preprocess(
    v => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined),
    z.string().uuid({ message: 'Consulta inválida.' }).optional(),
  ),
  indicaciones_generales: textoOpcional('Las indicaciones generales', MAX_LARGO_INDICACIONES_GENERALES),
  items: itemsRecetaSchema,
})

export const motivoAnulacionSchema = z.preprocess(
  v => (typeof v === 'string' ? v.trim() : v),
  z
    .string({ message: 'Indica el motivo de la anulación.' })
    .min(3, { message: 'El motivo tiene que explicar por qué se anula.' })
    .max(MAX_LARGO_MOTIVO_ANULACION, { message: `El motivo no puede pasar de ${MAX_LARGO_MOTIVO_ANULACION} caracteres.` }),
)

export type ItemReceta = z.infer<typeof itemRecetaSchema>
export type DatosReceta = z.infer<typeof recetaSchema>

/**
 * Copia de los datos al momento de emitir. Si el doctor cambia su exequátur o
 * la clínica cambia de sello, las recetas ya emitidas se reimprimen igual.
 */
export type SnapshotReceta = {
  doctor: { nombre: string; exequatur: string; especialidad: string | null; firma_path: string | null }
  clinica: {
    nombre: string
    direccion: string | null
    telefono: string | null
    email: string | null
    rnc: string | null
    sello_path: string | null
    logo_path: string | null
  }
  paciente: { nombre: string; edad: number | null; cedula: string | null }
}

/** Lee los medicamentos del formulario (viajan como un campo oculto con JSON). */
export function parsearItems(
  raw: FormDataEntryValue | null | undefined,
): { ok: true; items: ItemReceta[] } | { ok: false; error: string } {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { ok: false, error: 'La receta necesita al menos un medicamento.' }
  }

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'Medicamentos inválidos.' }
  }

  const resultado = itemsRecetaSchema.safeParse(json)
  if (!resultado.success) {
    return { ok: false, error: resultado.error.issues[0]?.message ?? 'Medicamentos inválidos.' }
  }
  return { ok: true, items: resultado.data }
}

/** Lee la receta completa del formulario. */
export function parsearReceta(
  fd: FormData,
): { ok: true; receta: DatosReceta } | { ok: false; error: string } {
  const items = parsearItems(fd.get('items'))
  if (!items.ok) return items

  const resultado = recetaSchema.safeParse({
    paciente_id: fd.get('paciente_id'),
    consulta_id: fd.get('consulta_id'),
    indicaciones_generales: fd.get('indicaciones_generales'),
    items: items.items,
  })

  if (!resultado.success) {
    return { ok: false, error: resultado.error.issues[0]?.message ?? 'Receta inválida.' }
  }
  return { ok: true, receta: resultado.data }
}

/** `Receta #0007` */
export function folioReceta(numero: number): string {
  return `#${String(numero).padStart(4, '0')}`
}

/**
 * Una línea de medicamento tal como se lee en la receta impresa:
 * `Amoxicilina — Cápsulas 500 mg · 1 cápsula · Oral · Cada 8 horas · 7 días`
 */
export function lineaMedicamento(item: {
  medicamento: string
  presentacion?: string | null
  dosis: string
  via?: string | null
  frecuencia: string
  duracion?: string | null
}): string {
  const cabeza = item.presentacion ? `${item.medicamento} — ${item.presentacion}` : item.medicamento
  const resto = [item.dosis, item.via, item.frecuencia, item.duracion].filter(
    (p): p is string => !!p && p.trim() !== '',
  )
  return [cabeza, ...resto].join(' · ')
}
