import type { createSupabaseServerClient } from './supabase.server'

type Supabase = ReturnType<typeof createSupabaseServerClient>['supabase']

export async function fetchTodosLosDatos(supabase: Supabase, clinicaId: string) {
  const [
    pacientes, citas, pagos, cotizacionesRaw, ordenes, deudas,
    doctores, tratamientos, expedienteEntradas, documentos, odontogramas,
    clientesExternos, trabajosExternos, facturasExternas, pagosExternos,
  ] = await Promise.all([
    supabase.from('pacientes').select('*').eq('clinica_id', clinicaId),
    supabase.from('citas').select('*').eq('clinica_id', clinicaId),
    supabase.from('pagos').select('*').eq('clinica_id', clinicaId),
    supabase.from('cotizaciones').select('*, cotizacion_items(*)').eq('clinica_id', clinicaId),
    supabase.from('ordenes_laboratorio').select('*').eq('clinica_id', clinicaId),
    supabase.from('deudas').select('*').eq('clinica_id', clinicaId),
    supabase.from('doctores').select('*').eq('clinica_id', clinicaId),
    supabase.from('tratamientos').select('*').eq('clinica_id', clinicaId),
    supabase.from('expediente_entradas').select('*').eq('clinica_id', clinicaId),
    supabase.from('documentos').select('*').eq('clinica_id', clinicaId),
    supabase.from('odontogramas').select('*').eq('clinica_id', clinicaId),
    supabase.from('clientes_externos').select('*').eq('clinica_id', clinicaId),
    supabase.from('trabajos_externos').select('*').eq('clinica_id', clinicaId),
    supabase.from('facturas_externas').select('*').eq('clinica_id', clinicaId),
    supabase.from('pagos_externos').select('*').eq('clinica_id', clinicaId),
  ])

  const cotizacionItems = (cotizacionesRaw.data ?? []).flatMap((c: any) => c.cotizacion_items ?? [])
  const cotizaciones = (cotizacionesRaw.data ?? []).map((c: any) => {
    const { cotizacion_items, ...rest } = c
    return rest
  })

  return {
    pacientes: pacientes.data ?? [],
    citas: citas.data ?? [],
    pagos: pagos.data ?? [],
    cotizaciones,
    cotizacion_items: cotizacionItems,
    ordenes_laboratorio: ordenes.data ?? [],
    deudas: deudas.data ?? [],
    doctores: doctores.data ?? [],
    tratamientos: tratamientos.data ?? [],
    expediente_entradas: expedienteEntradas.data ?? [],
    documentos: documentos.data ?? [],
    odontogramas: odontogramas.data ?? [],
    clientes_externos: clientesExternos.data ?? [],
    trabajos_externos: trabajosExternos.data ?? [],
    facturas_externas: facturasExternas.data ?? [],
    pagos_externos: pagosExternos.data ?? [],
  }
}
