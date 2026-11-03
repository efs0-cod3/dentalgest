import { parsearDiagnosticos, validarDiagnosticoMinimo, type Diagnostico } from './cie10'

// Parte de servidor de los diagnósticos CIE-10: comprobar contra el catálogo y
// guardar. Separado de cie10.ts para que aquel siga siendo puro y testeable.

/**
 * Cliente de Supabase, con lo justo que se usa aquí. PromiseLike y no Promise
 * porque los constructores de consulta de supabase-js son "thenables", no
 * promesas; así encaja tanto el cliente real como el doble de los tests.
 */
type ClienteSupabase = {
  from: (tabla: string) => any
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>
}

/**
 * Comprueba que todos los códigos existan en el catálogo y estén activos.
 * Devuelve un mensaje de error, o null si todo está bien.
 *
 * Va ANTES de escribir nada: un código inventado no debe llegar a la base
 * aunque la llave foránea también lo frenaría, porque así el mensaje es claro.
 */
export async function verificarCodigosActivos(
  supabase: ClienteSupabase,
  codigos: string[],
): Promise<string | null> {
  if (codigos.length === 0) return null

  const unicos = [...new Set(codigos)]
  const { data, error } = await supabase
    .from('cie10_codigos')
    .select('codigo')
    .eq('activo', true)
    .in('codigo', unicos)

  if (error) return 'No se pudo verificar el catálogo CIE-10. Intenta de nuevo.'

  const encontrados = new Set((data ?? []).map((r: { codigo: string }) => r.codigo))
  const faltantes = unicos.filter(c => !encontrados.has(c))
  if (faltantes.length > 0) {
    return `Código CIE-10 desconocido o inactivo: ${faltantes.join(', ')}.`
  }
  return null
}

/**
 * Lee los diagnósticos del formulario, aplica la regla de "al menos uno de los
 * dos" y comprueba los códigos contra el catálogo.
 *
 * El clinica_id NUNCA sale del formulario: lo pone guardar_diagnosticos_entrada
 * a partir de la sesión.
 */
export async function revisarDiagnosticosDelFormulario(
  supabase: ClienteSupabase,
  fd: FormData,
  titulo: string | null | undefined,
): Promise<{ ok: true; diagnosticos: Diagnostico[] } | { ok: false; error: string }> {
  const leidos = parsearDiagnosticos(fd.get('diagnosticos'))
  if (!leidos.ok) return leidos

  const falta = validarDiagnosticoMinimo(titulo, leidos.diagnosticos)
  if (falta) return { ok: false, error: falta }

  const invalido = await verificarCodigosActivos(
    supabase,
    leidos.diagnosticos.map(d => d.cie10_codigo),
  )
  if (invalido) return { ok: false, error: invalido }

  return { ok: true, diagnosticos: leidos.diagnosticos }
}

/**
 * Reemplaza el conjunto de diagnósticos de una entrada en una sola
 * transacción (borra los que se quitaron e inserta los nuevos).
 */
export async function guardarDiagnosticos(
  supabase: ClienteSupabase,
  entradaId: string,
  diagnosticos: Diagnostico[],
): Promise<string | null> {
  const { error } = await supabase.rpc('guardar_diagnosticos_entrada', {
    p_entrada_id: entradaId,
    p_diagnosticos: diagnosticos.map(d => ({
      cie10_codigo: d.cie10_codigo,
      pieza_dental: d.pieza_dental ?? null,
      notas: d.notas ?? null,
    })),
  })
  return error ? error.message : null
}
