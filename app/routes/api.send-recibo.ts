import { createSupabaseServerClient } from '~/lib/supabase.server'
import { getClinicaId } from '~/lib/clinica.server'
import { buildReciboHtml } from '~/lib/recibo'
import type { DeudaRecibo, ReciboHtmlPago } from '~/lib/recibo'

export async function action({ request }: { request: Request }) {
  const { supabase } = createSupabaseServerClient(request)
  const clinicaId = await getClinicaId(request)
  const fd = await request.formData()
  const pagoId = fd.get('pago_id') as string
  const email = fd.get('email') as string

  if (!email) return Response.json({ ok: false, error: 'Email requerido' })
  if (!pagoId) return Response.json({ ok: false, error: 'Pago no encontrado' })

  const { data: pagoData } = await supabase
    .from('pagos')
    .select(
      'id,concepto,monto,tipo,metodo_pago,fecha,notas,deuda_id,pacientes(nombre),tratamientos(nombre,precio),citas(fecha_hora,tratamientos(nombre))',
    )
    .eq('id', pagoId)
    .eq('clinica_id', clinicaId)
    .single()

  if (!pagoData) return Response.json({ ok: false, error: 'Pago no encontrado' })

  const { data: clinicaData } = await supabase
    .from('clinicas')
    .select('nombre')
    .eq('id', clinicaId)
    .single()

  let deudaInfo: DeudaRecibo | undefined
  if (pagoData.deuda_id) {
    const { data: deudaData } = await supabase
      .from('deudas')
      .select('monto_total,pagos(monto,tipo)')
      .eq('id', pagoData.deuda_id)
      .eq('clinica_id', clinicaId)
      .single()
    if (deudaData) {
      const monto_pagado = ((deudaData.pagos as any[]) ?? [])
        .filter((p: any) => p.tipo === 'ingreso')
        .reduce((s: number, p: any) => s + p.monto, 0)
      deudaInfo = {
        monto_total: deudaData.monto_total,
        monto_pagado,
        saldo: Math.max(0, deudaData.monto_total - monto_pagado),
      }
    }
  }

  try {
    const { sendReciboEmail } = await import('~/lib/email.server')
    const QRCode = (await import('qrcode')).default
    const qrUrl = `${new URL(request.url).origin}/verificar/${pagoId}`
    const qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 176, margin: 1, color: { dark: '#1e293b', light: '#ffffff' } })
    const origin = new URL(request.url).origin
    const html = buildReciboHtml(pagoData as unknown as ReciboHtmlPago, true, deudaInfo, qrDataUrl, clinicaData?.nombre ?? 'Nin Dental Clinic', `${origin}/ninlogo.png`)
    await sendReciboEmail(email, `Recibo de pago — ${pagoData.concepto}`, html)
    return Response.json({ ok: true, emailSent: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    return Response.json({ ok: false, error: msg })
  }
}
