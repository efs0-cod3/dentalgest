// Print-ready HTML builders for external lab jobs — same pattern as buildOrdenHtml
// (app/routes/dashboard/laboratorio.tsx) and buildReciboHtml (app/lib/recibo.ts):
// a self-contained HTML string with inline print CSS and an auto window.print().

type TrabajoParaImprimir = {
  id: string
  tipo_trabajo: string
  material: string | null
  paciente_referencia: string | null
  notas: string | null
  precio: number | null
  fecha_recibido: string
  fecha_prometida: string | null
  clientes_externos: { nombre: string } | null
}

type FacturaParaImprimir = {
  id: string
  periodo_inicio: string
  periodo_fin: string
  total: number
  estado: 'pendiente' | 'pagada'
  fecha_emision: string
  clientes_externos: { nombre: string } | null
}

function esc(s: string) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-DO', { dateStyle: 'long' })
}
function fmtMoney(n: number) {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(n)
}
function row(label: string, value: string | null | undefined, highlight = false) {
  if (!value) return ''
  return `<tr>
    <td style="padding:9px 0;border-bottom:1px solid #f1f5f9;width:40%;vertical-align:top;">
      <p style="margin:0;font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#94a3b8;">${label}</p>
    </td>
    <td style="padding:9px 0 9px 12px;border-bottom:1px solid #f1f5f9;vertical-align:top;">
      <p style="margin:0;font-size:13px;color:${highlight ? '#1e40af' : '#0f172a'};font-weight:${highlight ? '700' : '500'};">${esc(value)}</p>
    </td>
  </tr>`
}
function qrBlock(qrDataUrl: string, verifyLabel: string) {
  return `<div style="display:flex;align-items:center;gap:10px;">
    <img src="${qrDataUrl}" width="64" height="64" alt="QR" style="display:block;border-radius:6px;" />
    <p style="font-size:9px;color:#94a3b8;line-height:1.5;max-width:120px;margin:0;">${verifyLabel}</p>
  </div>`
}
function printCss() {
  return `*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#f1f5f9;padding:32px 20px;}
@media print{body{background:white;padding:0;}.no-print{display:none!important;}@page{margin:1.5cm;size:A5;}}`
}
function printFooterButtons() {
  return `<div class="no-print" style="padding:16px 0;display:flex;gap:10px;justify-content:center;">
  <button onclick="window.print()" style="padding:10px 28px;background:#1e40af;color:white;border:none;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">Imprimir</button>
  <button onclick="window.close()" style="padding:10px 24px;background:#f1f5f9;color:#475569;border:none;border-radius:9px;font-size:13px;cursor:pointer;font-family:inherit;">Cerrar</button>
</div>`
}

export function buildTrabajoHtml(trabajo: TrabajoParaImprimir, qrDataUrl: string, clinicaNombre: string): string {
  const folio = trabajo.id.slice(-8).toUpperCase()
  const today = new Date().toLocaleDateString('es-DO', { dateStyle: 'long' })

  return `<!DOCTYPE html><html lang="es"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Ficha de trabajo #${folio} — ${esc(clinicaNombre)}</title>
<script>window.onload=function(){setTimeout(function(){window.print()},500)}<\/script>
<style>${printCss()}</style></head><body>
<div style="max-width:520px;margin:0 auto;">
<div style="background:white;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,.10);">

  <div style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:22px 28px;display:flex;justify-content:space-between;align-items:flex-start;">
    <div>
      <p style="color:rgba(255,255,255,.7);font-size:10px;margin:0 0 2px;text-transform:uppercase;letter-spacing:.1em;">Ficha de trabajo externo</p>
      <p style="color:white;font-size:18px;font-weight:800;margin:0 0 2px;">${esc(clinicaNombre)}</p>
      <p style="color:rgba(255,255,255,.8);font-size:12px;margin:0;font-family:monospace;">Folio #${folio}</p>
    </div>
    <div style="text-align:right;">
      <p style="color:rgba(255,255,255,.7);font-size:10px;margin:0 0 2px;">Fecha de impresión</p>
      <p style="color:white;font-size:12px;font-weight:500;margin:0;">${today}</p>
    </div>
  </div>

  <div style="padding:20px 28px;">
    <p style="font-size:15px;font-weight:800;color:#0f172a;margin:0 0 16px;padding-bottom:12px;border-bottom:2px solid #e2e8f0;">${esc(trabajo.tipo_trabajo)}</p>
    <table style="width:100%;border-collapse:collapse;">
      ${row('Cliente externo', trabajo.clientes_externos?.nombre, true)}
      ${row('Referencia del paciente', trabajo.paciente_referencia)}
      ${row('Material', trabajo.material)}
      ${row('Fecha de recibido', fmtDate(trabajo.fecha_recibido))}
      ${row('Fecha prometida', trabajo.fecha_prometida ? fmtDate(trabajo.fecha_prometida) : null, true)}
      ${row('Precio', trabajo.precio != null ? fmtMoney(trabajo.precio) : null)}
    </table>
  </div>

  ${trabajo.notas ? `<div style="margin:0 28px 20px;padding:12px 14px;background:#f8fafc;border-radius:10px;border-left:3px solid #3b82f6;">
    <p style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#94a3b8;margin:0 0 4px;">Notas / Instrucciones</p>
    <p style="font-size:13px;color:#334155;margin:0;line-height:1.6;">${esc(trabajo.notas)}</p>
  </div>` : ''}

  <div style="padding:14px 28px;background:#fafafa;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
    ${qrBlock(qrDataUrl, 'Escanea para verificar la autenticidad de esta ficha')}
    <div>
      <p style="font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:#94a3b8;margin:0 0 3px;">Firma / Sello</p>
      <div style="width:140px;height:42px;border-bottom:1px solid #cbd5e1;margin-top:8px;"></div>
    </div>
  </div>

</div>
${printFooterButtons()}
</div></body></html>`
}

export function buildFacturaExternaHtml(
  factura: FacturaParaImprimir, trabajos: TrabajoParaImprimir[], qrDataUrl: string, clinicaNombre: string
): string {
  const folio = factura.id.slice(-8).toUpperCase()
  const today = new Date().toLocaleDateString('es-DO', { dateStyle: 'long' })
  const estadoLabel = factura.estado === 'pagada' ? 'Pagada' : 'Pendiente de pago'
  const estadoColor = factura.estado === 'pagada' ? '#16a34a' : '#d97706'

  const filas = trabajos.map(t => `<tr>
    <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;">
      <p style="margin:0;font-size:13px;color:#0f172a;font-weight:500;">${esc(t.tipo_trabajo)}</p>
      ${t.paciente_referencia ? `<p style="margin:2px 0 0;font-size:11px;color:#94a3b8;">${esc(t.paciente_referencia)}</p>` : ''}
    </td>
    <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;text-align:right;">
      <p style="margin:0;font-size:13px;color:#0f172a;">${t.precio != null ? fmtMoney(t.precio) : '—'}</p>
    </td>
  </tr>`).join('')

  return `<!DOCTYPE html><html lang="es"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Factura #${folio} — ${esc(clinicaNombre)}</title>
<script>window.onload=function(){setTimeout(function(){window.print()},500)}<\/script>
<style>${printCss()}</style></head><body>
<div style="max-width:600px;margin:0 auto;">
<div style="background:white;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,.10);">

  <div style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:26px 32px;display:flex;justify-content:space-between;align-items:flex-start;">
    <div>
      <p style="color:rgba(255,255,255,.7);font-size:10px;margin:0 0 2px;text-transform:uppercase;letter-spacing:.1em;">Factura — trabajos externos</p>
      <p style="color:white;font-size:20px;font-weight:800;margin:0 0 2px;">${esc(clinicaNombre)}</p>
      <p style="color:rgba(255,255,255,.8);font-size:12px;margin:0;font-family:monospace;">Folio #${folio}</p>
    </div>
    <div style="text-align:right;">
      <p style="color:rgba(255,255,255,.7);font-size:10px;margin:0 0 2px;">Emitida</p>
      <p style="color:white;font-size:12px;font-weight:500;margin:0;">${fmtDate(factura.fecha_emision)}</p>
    </div>
  </div>

  <div style="padding:22px 32px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
    <div>
      <p style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#94a3b8;margin:0 0 3px;">Cliente</p>
      <p style="font-size:16px;font-weight:700;color:#0f172a;margin:0;">${esc(factura.clientes_externos?.nombre ?? '—')}</p>
      <p style="font-size:12px;color:#64748b;margin:4px 0 0;">Período: ${fmtDate(factura.periodo_inicio)} – ${fmtDate(factura.periodo_fin)}</p>
    </div>
    <span style="font-size:11px;font-weight:700;color:${estadoColor};background:${estadoColor}1a;padding:5px 12px;border-radius:999px;">${estadoLabel}</span>
  </div>

  <div style="padding:20px 32px;">
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr>
        <th style="text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#94a3b8;padding-bottom:8px;border-bottom:2px solid #e2e8f0;">Trabajo</th>
        <th style="text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#94a3b8;padding-bottom:8px;border-bottom:2px solid #e2e8f0;">Precio</th>
      </tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <div style="display:flex;justify-content:flex-end;margin-top:16px;padding-top:12px;border-top:2px solid #0f172a;">
      <p style="font-size:22px;font-weight:800;color:#0f172a;margin:0;">${fmtMoney(factura.total)}</p>
    </div>
  </div>

  <div style="padding:14px 32px;background:#fafafa;border-top:1px solid #e2e8f0;">
    ${qrBlock(qrDataUrl, 'Escanea para verificar la autenticidad de esta factura')}
  </div>

</div>
${printFooterButtons()}
</div></body></html>`
}
