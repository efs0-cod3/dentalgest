import { fmtMoney, convertirMoneda, type Moneda } from './utils'

// Documento imprimible de una cotización.
//
// Vive aquí y no dentro de la ruta para que el envío por correo y la
// impresión usen exactamente el mismo HTML: si se tocan los estilos o los
// textos, cambian los dos a la vez.

export type CotizacionItemHtml = {
  descripcion: string
  cantidad: number
  precio_unitario: number
  precio_total: number
}

export type CotizacionHtml = {
  id: string
  titulo: string | null
  doctor: string | null
  fecha: string
  fecha_vencimiento: string
  notas: string | null
  monto_total: number
  monto_congelamiento: number | null
  fecha_congelamiento: string | null
  moneda: Moneda
  tasa_cambio: number | null
  pacientes: { nombre: string; email: string | null; telefono: string | null } | null
  cotizacion_items: CotizacionItemHtml[]
}

const fmt = fmtMoney

export function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("es-DO", { dateStyle: "medium" });
}

export function esc(s: string) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

/**
 * HTML de la cotización.
 *
 * `paraEmail` quita los botones de Imprimir/Cerrar: en un correo no hay
 * ventana que cerrar ni window.print() que llamar, y muchos clientes de
 * correo borran el <button> dejando un hueco raro al final del documento.
 */
export function buildCotizacionHtml(
  c: CotizacionHtml,
  paraEmail = false,
  clinicaNombre = 'Nin Dental Clinic',
): string {
  const clinica = esc(clinicaNombre)
  const folio = c.id.slice(-8).toUpperCase();
  const itemsHtml = c.cotizacion_items.map((item, i) => `
    <tr style="background:${i%2===0?"#fff":"#f8fafc"}">
      <td style="padding:11px 16px;font-size:13px;color:#334155;border-bottom:1px solid #f1f5f9;">${esc(item.descripcion)}</td>
      <td style="padding:11px 16px;font-size:13px;color:#334155;text-align:center;border-bottom:1px solid #f1f5f9;">${item.cantidad}</td>
      <td style="padding:11px 16px;font-size:13px;color:#334155;text-align:right;border-bottom:1px solid #f1f5f9;">${fmt(item.precio_unitario, c.moneda)}</td>
      <td style="padding:11px 16px;font-size:13px;font-weight:700;color:#0f172a;text-align:right;border-bottom:1px solid #f1f5f9;">${fmt(item.precio_total, c.moneda)}</td>
    </tr>`).join("");

  const congeladoHtml = c.monto_congelamiento && c.fecha_congelamiento
    ? `<div style="margin-top:10px;padding:10px 14px;background:#f5f3ff;border-radius:8px;border:1px solid #ddd6fe;">
        <p style="margin:0;font-size:12px;color:#7c3aed;font-weight:600;">❄️ Congelada el ${fmtDate(c.fecha_congelamiento)} — Depósito recibido: ${fmt(c.monto_congelamiento, c.moneda)}</p>
       </div>` : "";

  // equivalente de referencia en pesos cuando la cotización está en dólares
  const equivDop = c.moneda === "USD"
    ? convertirMoneda(c.monto_total, "USD", "DOP", c.tasa_cambio)
    : null;
  const equivHtml = equivDop != null
    ? `<p style="font-size:12px;color:#64748b;margin:4px 0 0;">≈ ${fmtMoney(equivDop, "DOP")} (tasa US$1 = RD$${c.tasa_cambio})</p>`
    : "";

  const botonesHtml = paraEmail
    ? ""
    : `<div class="no-print" style="padding:20px 0;display:flex;gap:10px;justify-content:center;">
  <button onclick="window.print()" style="padding:10px 28px;background:#1e40af;color:white;border:none;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">Imprimir</button>
  <button onclick="window.close()" style="padding:10px 24px;background:#f1f5f9;color:#475569;border:none;border-radius:9px;font-size:13px;cursor:pointer;font-family:inherit;">Cerrar</button>
</div>`;

  return `<!DOCTYPE html><html lang="es"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Cotización #${folio} — ${clinica}</title>
<style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#f1f5f9;padding:32px 20px;}
@media print{body{background:white;padding:0;}.no-print{display:none!important;}@page{margin:1.5cm;size:A4;}}</style>
</head><body>
<div style="max-width:680px;margin:0 auto;">
<div style="background:white;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.10);">

  <div style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:28px 36px;display:flex;justify-content:space-between;align-items:flex-start;">
    <div>
      <p style="color:rgba(255,255,255,.75);font-size:11px;margin:0 0 3px;text-transform:uppercase;letter-spacing:.1em;">Cotización / Presupuesto</p>
      <p style="color:white;font-size:22px;font-weight:800;margin:0 0 4px;">${clinica}</p>
      <p style="color:rgba(255,255,255,.8);font-size:13px;margin:0;font-family:monospace;">Folio #${folio}</p>
    </div>
    <div style="text-align:right;">
      <p style="color:rgba(255,255,255,.75);font-size:11px;margin:0 0 2px;">Fecha de emisión</p>
      <p style="color:white;font-size:14px;font-weight:600;margin:0 0 10px;">${fmtDate(c.fecha)}</p>
      <p style="color:rgba(255,255,255,.75);font-size:11px;margin:0 0 2px;">Válida hasta</p>
      <p style="color:white;font-size:14px;font-weight:600;margin:0;">${fmtDate(c.fecha_vencimiento)}</p>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #e2e8f0;">
    <div style="padding:20px 28px;border-right:1px solid #e2e8f0;">
      <p style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin:0 0 6px;">Paciente</p>
      ${c.pacientes
        ? `<p style="font-size:15px;font-weight:700;color:#0f172a;margin:0 0 2px;">${esc(c.pacientes.nombre)}</p>
           ${c.pacientes.telefono?`<p style="font-size:12px;color:#64748b;margin:0;">${esc(c.pacientes.telefono)}</p>`:""}
           ${c.pacientes.email?`<p style="font-size:12px;color:#64748b;margin:0;">${esc(c.pacientes.email)}</p>`:""}`
        : `<p style="font-size:13px;color:#94a3b8;margin:0;">No especificado</p>`}
    </div>
    <div style="padding:20px 28px;">
      ${c.doctor?`<p style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin:0 0 6px;">Doctor</p>
        <p style="font-size:15px;font-weight:700;color:#0f172a;margin:0 0 10px;">${esc(c.doctor)}</p>`:""}
      ${c.titulo?`<p style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin:0 0 4px;">Concepto</p>
        <p style="font-size:13px;color:#334155;margin:0;">${esc(c.titulo)}</p>`:""}
    </div>
  </div>

  <table style="width:100%;border-collapse:collapse;">
    <thead><tr style="background:#f8fafc;">
      <th style="padding:11px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#64748b;text-align:left;">Tratamiento / Concepto</th>
      <th style="padding:11px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#64748b;text-align:center;">Cant.</th>
      <th style="padding:11px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#64748b;text-align:right;">Precio unit.</th>
      <th style="padding:11px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#64748b;text-align:right;">Total</th>
    </tr></thead>
    <tbody>${itemsHtml}</tbody>
  </table>

  <div style="padding:20px 28px;background:#f8faff;border-top:2px solid #e2e8f0;display:flex;justify-content:flex-end;">
    <div style="text-align:right;">
      <p style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin:0 0 4px;">Total de la cotización${c.moneda === "USD" ? " (USD)" : ""}</p>
      <p style="font-size:34px;font-weight:800;color:#1e40af;margin:0;">${fmt(c.monto_total, c.moneda)}</p>
      ${equivHtml}
      ${congeladoHtml}
    </div>
  </div>

  ${c.notas?`<div style="padding:16px 28px;border-top:1px solid #e2e8f0;">
    <p style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin:0 0 6px;">Notas</p>
    <p style="font-size:13px;color:#475569;margin:0;line-height:1.6;">${esc(c.notas)}</p>
  </div>`:""}

  <div style="padding:14px 28px;background:#fffbeb;border-top:1px solid #fde68a;">
    <p style="font-size:12px;color:#92400e;margin:0;">⏱ Válida 20 días desde su emisión (hasta ${fmtDate(c.fecha_vencimiento)}). Puede reservarse abonando el 10% del total.</p>
  </div>
  <div style="padding:12px 28px;background:#f8faff;border-top:1px solid #e2e8f0;text-align:center;">
    <p style="font-size:11px;color:#94a3b8;margin:0;">${clinica} · Cotización / Presupuesto — No tiene valor fiscal</p>
  </div>
</div>
${botonesHtml}
</div></body></html>`;
}
