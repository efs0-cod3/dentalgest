import { calcularEdad } from './utils'
import type { DatosReceta, SnapshotReceta } from './prescripciones'
import { MAX_IMAGEN_BYTES, IMAGEN_TIPOS_PERMITIDOS } from './prescripciones'
import { motivoNoPuedeEmitir } from './permisos'

// Parte de servidor de las recetas: contexto del emisor, snapshot, emitir,
// anular y firmar las imágenes privadas.

export const BUCKET_CLINICA = 'documentos-clinica'

/** Las URLs firmadas duran poco: son firma y sello, no imágenes públicas. */
export const IMAGEN_URL_TTL_SEG = 10 * 60

export { MAX_IMAGEN_BYTES, IMAGEN_TIPOS_PERMITIDOS } from './prescripciones'

type ClienteSupabase = {
  from: (tabla: string) => any
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>
  storage: {
    from: (bucket: string) => {
      upload: (ruta: string, archivo: File, opciones?: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>
      createSignedUrl: (ruta: string, segundos: number) => PromiseLike<{ data: { signedUrl: string } | null }>
    }
  }
}

export type DoctorEmisor = {
  id: string
  nombre: string
  exequatur: string | null
  especialidad: string | null
  firma_path: string | null
}

export type ClinicaReceta = {
  nombre: string
  direccion: string | null
  telefono: string | null
  email: string | null
  rnc: string | null
  sello_path: string | null
  logo_path: string | null
}

/**
 * Datos del doctor ligado a la cuenta y de su clínica. Devuelve el doctor en
 * null cuando la cuenta no está ligada a ninguno, que es el caso de recepción
 * y también de una cuenta de doctor recién creada.
 */
export async function contextoReceta(
  supabase: ClienteSupabase,
  clinicaId: string,
  doctorId: string | null,
): Promise<{ doctor: DoctorEmisor | null; clinica: ClinicaReceta | null }> {
  const [{ data: doctor }, { data: clinica }] = await Promise.all([
    doctorId
      ? supabase
          .from('doctores')
          .select('id,nombre,exequatur,especialidad,firma_path')
          .eq('id', doctorId)
          .eq('clinica_id', clinicaId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('clinicas')
      .select('nombre,direccion,telefono,email,rnc,sello_path,logo_path')
      .eq('id', clinicaId)
      .maybeSingle(),
  ])

  return {
    doctor: (doctor as DoctorEmisor | null) ?? null,
    clinica: (clinica as ClinicaReceta | null) ?? null,
  }
}

/**
 * Congela los datos del doctor, la clínica y el paciente. Lo arma el servidor,
 * nunca el formulario: si el doctor cambia su exequátur o la clínica cambia de
 * sello, las recetas ya emitidas se reimprimen con lo de entonces.
 */
export function armarSnapshot(
  doctor: DoctorEmisor,
  clinica: ClinicaReceta,
  paciente: { nombre: string; fecha_nacimiento: string | null; cedula: string | null },
): SnapshotReceta {
  return {
    doctor: {
      nombre: doctor.nombre,
      exequatur: (doctor.exequatur ?? '').trim(),
      especialidad: doctor.especialidad,
      firma_path: doctor.firma_path,
    },
    clinica: {
      nombre: clinica.nombre,
      direccion: clinica.direccion,
      telefono: clinica.telefono,
      email: clinica.email,
      rnc: clinica.rnc,
      sello_path: clinica.sello_path,
      logo_path: clinica.logo_path,
    },
    paciente: {
      nombre: paciente.nombre,
      edad: paciente.fecha_nacimiento ? calcularEdad(paciente.fecha_nacimiento) : null,
      cedula: paciente.cedula,
    },
  }
}

/**
 * Emite la receta con sus medicamentos. La clínica y el doctor los pone la
 * función de la base a partir de la sesión, no este código.
 */
export async function emitirReceta(
  supabase: ClienteSupabase,
  receta: DatosReceta,
  snapshot: SnapshotReceta,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('emitir_prescripcion', {
    p_paciente_id: receta.paciente_id,
    p_consulta_id: receta.consulta_id ?? null,
    p_indicaciones: receta.indicaciones_generales ?? null,
    p_items: receta.items.map((it, i) => ({
      orden: i + 1,
      medicamento: it.medicamento,
      presentacion: it.presentacion ?? null,
      dosis: it.dosis,
      via: it.via ?? null,
      frecuencia: it.frecuencia,
      duracion: it.duracion ?? null,
      cantidad: it.cantidad ?? null,
      indicaciones: it.indicaciones ?? null,
    })),
    p_snapshot: snapshot,
  })

  if (error) return { ok: false, error: error.message }
  return { ok: true, id: data as string }
}

export async function anularReceta(
  supabase: ClienteSupabase,
  id: string,
  motivo: string,
): Promise<string | null> {
  const { error } = await supabase.rpc('anular_prescripcion', { p_id: id, p_motivo: motivo })
  return error ? error.message : null
}

/**
 * Comprueba antes de emitir. Duplica lo que ya valida la base a propósito: así
 * el mensaje en pantalla es claro en vez de un error de Postgres.
 */
export function revisarPuedeEmitir(
  rol: string | null | undefined,
  doctor: DoctorEmisor | null,
): string | null {
  return motivoNoPuedeEmitir(rol, doctor?.id ?? null, doctor?.exequatur ?? null)
}

/** Las imágenes son privadas: se muestran con URLs firmadas de corta duración. */
export async function firmarImagen(
  supabase: ClienteSupabase,
  ruta: string | null | undefined,
): Promise<string | null> {
  if (!ruta) return null
  const { data } = await supabase.storage.from(BUCKET_CLINICA).createSignedUrl(ruta, IMAGEN_URL_TTL_SEG)
  return data?.signedUrl ?? null
}

/** Valida tipo y tamaño en el servidor, no solo con el `accept` del input. */
export function revisarImagen(archivo: File | null): string | null {
  if (!archivo || archivo.size === 0) return 'Selecciona una imagen.'
  if (archivo.size > MAX_IMAGEN_BYTES) {
    return `La imagen pesa más de ${Math.round(MAX_IMAGEN_BYTES / 1024)} KB. Reduce su tamaño e intenta de nuevo.`
  }
  if (!IMAGEN_TIPOS_PERMITIDOS.includes(archivo.type)) {
    return 'Formato no permitido. Sube un PNG o un JPG (se recomienda PNG con fondo transparente).'
  }
  return null
}

/** `{clinica_id}/firmas/{doctor_id}/firma.png` */
export function rutaFirma(clinicaId: string, doctorId: string, archivo: File): string {
  const ext = archivo.type === 'image/png' ? 'png' : 'jpg'
  return `${clinicaId}/firmas/${doctorId}/firma.${ext}`
}

/** `{clinica_id}/sello/sello.png` */
export function rutaSello(clinicaId: string, archivo: File): string {
  const ext = archivo.type === 'image/png' ? 'png' : 'jpg'
  return `${clinicaId}/sello/sello.${ext}`
}
