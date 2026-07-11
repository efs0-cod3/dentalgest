export type ReciboHtmlPago = {
  id: string
  concepto: string
  monto: number
  tipo: string
  metodo_pago: string
  fecha: string
  notas?: string | null
  pacientes?: { nombre: string } | null
  citas?: { tratamientos?: { nombre: string } | null } | null
  tratamientos?: { nombre: string } | null
}

export type DeudaRecibo = {
  monto_total: number
  monto_pagado: number
  saldo: number
}

function esc(s: string) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function fmtDOP(n: number) {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(n)
}

export function buildReciboHtml(pago: ReciboHtmlPago, forEmail = false, deuda?: DeudaRecibo, qrDataUrl?: string, clinicaNombre?: string, clinicaLogoUrl?: string, clinicaRnc?: string | null): string {
  const folio = pago.id.slice(-8).toUpperCase()
  const fechaStr = new Date(pago.fecha).toLocaleDateString('es-DO', { dateStyle: 'long' })
  const montoFmt = fmtDOP(pago.monto)
  const paciente = esc(pago.pacientes?.nombre ?? 'No especificado')
  const tratamiento = pago.tratamientos?.nombre ?? pago.citas?.tratamientos?.nombre ?? null
  const metodoMap: Record<string, string> = {
    efectivo: 'Efectivo',
    tarjeta: 'Tarjeta bancaria',
    transferencia: 'Transferencia electrónica',
  }
  const metodoLabel = metodoMap[pago.metodo_pago] ?? pago.metodo_pago
  const colorAmt = pago.tipo === 'ingreso' ? '#16a34a' : '#dc2626'
  const colorBadgeBg = pago.tipo === 'ingreso' ? '#dcfce7' : '#fee2e2'
  const colorBadgeText = pago.tipo === 'ingreso' ? '#15803d' : '#b91c1c'

  const baseRows = [
    { label: 'Concepto', value: esc(pago.concepto) },
    { label: 'Paciente', value: paciente },
    ...(tratamiento ? [{ label: 'Tratamiento', value: esc(tratamiento) }] : []),
    { label: 'Método de pago', value: esc(metodoLabel) },
    ...(pago.notas ? [{ label: 'Notas', value: esc(pago.notas) }] : []),
  ]

  const deudaRows: { label: string; value: string; highlight?: boolean }[] = deuda
    ? [
        { label: 'Total adeudado', value: fmtDOP(deuda.monto_total) },
        { label: 'Abono (este pago)', value: fmtDOP(pago.monto) },
        { label: 'Total pagado', value: fmtDOP(deuda.monto_pagado) },
        {
          label: deuda.saldo <= 0 ? 'Saldo (liquidado ✓)' : 'Saldo restante',
          value: fmtDOP(deuda.saldo),
          highlight: deuda.saldo <= 0,
        },
      ]
    : []

  const rowHtml = (r: { label: string; value: string; highlight?: boolean }) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #f8fafc;vertical-align:top;">
        <p style="margin:0 0 3px;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;">${r.label}</p>
        <p style="margin:0;font-size:14px;color:${r.highlight ? '#16a34a' : '#0f172a'};font-weight:${r.highlight ? '700' : '500'};">${r.value}</p>
      </td>
    </tr>`

  const dividerRow =
    deudaRows.length > 0
      ? `<tr><td style="padding:6px 0;"><div style="border-top:1px dashed #e2e8f0;margin:2px 0;"></div></td></tr>`
      : ''

  const rowsHtml = baseRows.map(rowHtml).join('') + dividerRow + deudaRows.map(rowHtml).join('')

  const autoScript = forEmail
    ? ''
    : `<script>window.onload=function(){setTimeout(function(){window.print()},500)}<\/script>`

  const folioBar = qrDataUrl
    ? `<div style="display:flex;align-items:center;gap:14px;padding:14px 28px;background:#fafafa;border-bottom:1px solid #f1f5f9;">
        <div style="flex-shrink:0;text-align:center;">
          <img src="${qrDataUrl}" width="60" height="60" alt="QR" style="display:block;border-radius:5px;" />
          <p style="margin:3px 0 0;font-size:7px;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;">Verificar</p>
        </div>
        <div style="flex:1;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <p style="margin:0 0 2px;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;">Folio</p>
            <p style="margin:0;font-size:15px;font-weight:700;color:#0f172a;font-family:monospace;">#${folio}</p>
          </div>
          <div style="text-align:right;">
            <p style="margin:0 0 2px;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;">Fecha</p>
            <p style="margin:0;font-size:13px;color:#334155;">${fechaStr}</p>
          </div>
        </div>
      </div>`
    : `<div style="display:flex;justify-content:space-between;align-items:center;padding:16px 28px;background:#fafafa;border-bottom:1px solid #f1f5f9;">
        <div>
          <p style="margin:0 0 2px;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;">Folio</p>
          <p style="margin:0;font-size:15px;font-weight:700;color:#0f172a;font-family:monospace;">#${folio}</p>
        </div>
        <div style="text-align:right;">
          <p style="margin:0 0 2px;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;">Fecha</p>
          <p style="margin:0;font-size:13px;color:#334155;">${fechaStr}</p>
        </div>
      </div>`;

  const actionBtns = forEmail
    ? ''
    : `<div style="padding:16px 28px 24px;display:flex;gap:10px;justify-content:center;" class="no-print">
    <button onclick="window.print()" style="padding:10px 24px;background:#1e40af;color:white;border:none;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">Imprimir</button>
    <button onclick="window.close()" style="padding:10px 24px;background:#f1f5f9;color:#475569;border:none;border-radius:9px;font-size:13px;cursor:pointer;font-family:inherit;">Cerrar</button>
  </div>`

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Recibo #${folio} — Nin Dental Clinic</title>
${autoScript}
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#f1f5f9;padding:40px 20px;min-height:100vh;}
@media print{body{background:white;padding:0;}.no-print{display:none!important;}@page{margin:1.2cm;}}
</style>
</head>
<body>
<div style="max-width:420px;margin:0 auto;">
<div style="background:white;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.12);">
  <div style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:28px 32px;text-align:center;">
    ${clinicaLogoUrl
      ? `<img src="${clinicaLogoUrl}" alt="Logo" style="height:56px;max-width:160px;object-fit:contain;margin:0 auto 10px;display:block;filter:brightness(0) invert(1);" />`
      : `<div style="width:52px;height:52px;background:rgba(255,255,255,.15);border-radius:14px;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;font-size:26px;">🦷</div>`}
    <p style="color:white;font-size:19px;font-weight:700;margin:0 0 3px;">${esc(clinicaNombre ?? 'Nin Dental Clinic')}</p>
    ${clinicaRnc ? `<p style="color:rgba(255,255,255,.8);font-size:11px;margin:0 0 3px;">RNC: ${esc(clinicaRnc)}</p>` : ''}
    <p style="color:rgba(255,255,255,.75);font-size:12px;margin:0;">Recibo de Pago</p>
  </div>
  ${folioBar}
  <div style="padding:24px 28px;text-align:center;background:#f8faff;border-bottom:1px solid #e2e8f0;">
    <p style="margin:0 0 6px;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;">Total pagado</p>
    <p style="margin:0;font-size:38px;font-weight:800;color:${colorAmt};">${montoFmt}</p>
    <span style="display:inline-block;margin-top:10px;padding:4px 14px;background:${colorBadgeBg};color:${colorBadgeText};border-radius:20px;font-size:12px;font-weight:600;text-transform:capitalize;">${pago.tipo}</span>
  </div>
  <div style="padding:8px 28px 4px;">
    <table style="width:100%;border-collapse:collapse;">${rowsHtml}</table>
  </div>
  <div style="padding:16px 28px;background:#f8faff;text-align:center;border-top:1px solid #e2e8f0;margin-top:8px;">
    <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;">¡Gracias por su preferencia!</p>
    <p style="margin:0;font-size:10px;color:#cbd5e1;">Nin Dental Clinic · Documento comprobante de pago</p>
  </div>

</div>
${actionBtns}
</div>
</body>
</html>`
}
