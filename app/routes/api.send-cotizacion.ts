import { createSupabaseServerClient } from '~/lib/supabase.server'
import { requireSeccion } from '~/lib/clinica.server'
import { buildCotizacionHtml } from '~/lib/cotizacion'
import type { CotizacionHtml } from '~/lib/cotizacion'

// Enviar una cotización por correo al paciente.
//
// El guarda es el mismo de la sección: quien no puede ver cotizaciones
// tampoco puede mandarlas, y el `eq('clinica_id', clinicaId)` impide que
// alguien pida por id una cotización de otra clínica.

export async function action({ request }: { request: Request }) {
  const { supabase } = createSupabaseServerClient(request)
  const { clinicaId } = await requireSeccion(request, 'cotizaciones')
  const fd = await request.formData()
  const cotizacionId = String(fd.get('cotizacion_id') ?? '')
  const email = String(fd.get('email') ?? '').trim()

  if (!email) return Response.json({ ok: false, error: 'Email requerido' })
  if (!cotizacionId) return Response.json({ ok: false, error: 'Cotización no encontrada' })

  const { data: cotizacion } = await supabase
    .from('cotizaciones')
    .select(
      'id,titulo,doctor,fecha,fecha_vencimiento,notas,monto_total,monto_congelamiento,fecha_congelamiento,moneda,tasa_cambio,pacientes(nombre,email,telefono),cotizacion_items(descripcion,cantidad,precio_unitario,precio_total)',
    )
    .eq('id', cotizacionId)
    .eq('clinica_id', clinicaId)
    .single()

  if (!cotizacion) return Response.json({ ok: false, error: 'Cotización no encontrada' })

  const { data: clinicaData } = await supabase
    .from('clinicas')
    .select('nombre,email')
    .eq('id', clinicaId)
    .single()

  const clinicaNombre = clinicaData?.nombre ?? 'Nin Dental Clinic'
  const folio = cotizacionId.slice(-8).toUpperCase()

  try {
    const { sendReciboEmail } = await import('~/lib/email.server')
    const html = buildCotizacionHtml(cotizacion as unknown as CotizacionHtml, true, clinicaNombre)
    const asunto = (cotizacion as { titulo: string | null }).titulo
      ? `Cotización — ${(cotizacion as { titulo: string | null }).titulo}`
      : `Cotización #${folio}`
    await sendReciboEmail(email, asunto, html, {
      fromName: clinicaNombre,
      replyTo: clinicaData?.email,
    })
    return Response.json({ ok: true, emailSent: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    // a la vista del log: sin esto un fallo de Resend no deja rastro
    console.error('[send-cotizacion] fallo al enviar', msg)
    return Response.json({ ok: false, error: msg })
  }
}
