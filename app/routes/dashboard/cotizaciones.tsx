import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Form, useLoaderData, useNavigation, useFetcher, useSubmit } from "react-router";
import type { Route } from "./+types/cotizaciones";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { getClinicaId } from "~/lib/clinica.server";
import { useCloseOnSubmit } from "~/lib/hooks";
import { ConfirmDeleteModal } from "~/components/ConfirmDeleteModal";
import {
  Plus,
  X,
  Pencil,
  Trash2,
  Printer,
  Clock,
  AlertCircle,
  XCircle,
  Snowflake,
  RotateCcw,
  CheckCircle,
  FileText,
} from "lucide-react";
import { cn, fmtMoney } from "~/lib/utils";

// ─── types ────────────────────────────────────────────────────────────────────

type CotizacionItem = {
  id: string;
  cotizacion_id: string;
  descripcion: string;
  tratamiento_id: string | null;
  cantidad: number;
  precio_unitario: number;
  precio_total: number;
};

type Cotizacion = {
  id: string;
  clinica_id: string;
  paciente_id: string | null;
  titulo: string | null;
  doctor: string | null;
  fecha: string;
  fecha_vencimiento: string;
  notas: string | null;
  estado: "activa" | "congelada";
  monto_total: number;
  monto_congelamiento: number | null;
  fecha_congelamiento: string | null;
  created_at: string;
  pacientes: { nombre: string; email: string | null; telefono: string | null } | null;
  cotizacion_items: CotizacionItem[];
};

type Paciente = { id: string; nombre: string; email: string | null; telefono: string | null };
type Tratamiento = { id: string; nombre: string; precio: number };
type ItemDraft = {
  tempId: string;
  tratamiento_id: string;
  descripcion: string;
  cantidad: string;
  precio_unitario: string;
};
type DisplayEstado = "activa" | "congelada" | "vencida" | "reevaluacion";

const METODOS = ["efectivo", "tarjeta", "transferencia"] as const;

// ─── utils ────────────────────────────────────────────────────────────────────

const fmt = fmtMoney;
function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("es-DO", { dateStyle: "medium" });
}
function computeEstado(c: Cotizacion): DisplayEstado {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const venc = new Date(c.fecha_vencimiento + "T00:00:00");
  if (c.estado === "congelada") return venc < today ? "reevaluacion" : "congelada";
  return venc < today ? "vencida" : "activa";
}
function diasRestantes(fechaVenc: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const venc = new Date(fechaVenc + "T00:00:00");
  return Math.ceil((venc.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

const estadoConfig: Record<DisplayEstado, { label: string; color: string; Icon: any }> = {
  activa:       { label: "Activa",       color: "bg-blue-100 text-blue-700",   Icon: Clock },
  congelada:    { label: "Congelada",    color: "bg-purple-100 text-purple-700", Icon: Snowflake },
  vencida:      { label: "Vencida",      color: "bg-red-100 text-red-700",     Icon: XCircle },
  reevaluacion: { label: "Re-evaluar",   color: "bg-orange-100 text-orange-700", Icon: AlertCircle },
};

// ─── print html ───────────────────────────────────────────────────────────────

function esc(s: string) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function buildCotizacionHtml(c: Cotizacion): string {
  const folio = c.id.slice(-8).toUpperCase();
  const itemsHtml = c.cotizacion_items.map((item, i) => `
    <tr style="background:${i%2===0?"#fff":"#f8fafc"}">
      <td style="padding:11px 16px;font-size:13px;color:#334155;border-bottom:1px solid #f1f5f9;">${esc(item.descripcion)}</td>
      <td style="padding:11px 16px;font-size:13px;color:#334155;text-align:center;border-bottom:1px solid #f1f5f9;">${item.cantidad}</td>
      <td style="padding:11px 16px;font-size:13px;color:#334155;text-align:right;border-bottom:1px solid #f1f5f9;">${fmt(item.precio_unitario)}</td>
      <td style="padding:11px 16px;font-size:13px;font-weight:700;color:#0f172a;text-align:right;border-bottom:1px solid #f1f5f9;">${fmt(item.precio_total)}</td>
    </tr>`).join("");

  const congeladoHtml = c.monto_congelamiento && c.fecha_congelamiento
    ? `<div style="margin-top:10px;padding:10px 14px;background:#f5f3ff;border-radius:8px;border:1px solid #ddd6fe;">
        <p style="margin:0;font-size:12px;color:#7c3aed;font-weight:600;">❄️ Congelada el ${fmtDate(c.fecha_congelamiento)} — Depósito recibido: ${fmt(c.monto_congelamiento)}</p>
       </div>` : "";

  return `<!DOCTYPE html><html lang="es"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Cotización #${folio} — Nin Dental Clinic</title>
<style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#f1f5f9;padding:32px 20px;}
@media print{body{background:white;padding:0;}.no-print{display:none!important;}@page{margin:1.5cm;size:A4;}}</style>
</head><body>
<div style="max-width:680px;margin:0 auto;">
<div style="background:white;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.10);">

  <div style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:28px 36px;display:flex;justify-content:space-between;align-items:flex-start;">
    <div>
      <p style="color:rgba(255,255,255,.75);font-size:11px;margin:0 0 3px;text-transform:uppercase;letter-spacing:.1em;">Cotización / Presupuesto</p>
      <p style="color:white;font-size:22px;font-weight:800;margin:0 0 4px;">Nin Dental Clinic</p>
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
      <p style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin:0 0 4px;">Total de la cotización</p>
      <p style="font-size:34px;font-weight:800;color:#1e40af;margin:0;">${fmt(c.monto_total)}</p>
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
    <p style="font-size:11px;color:#94a3b8;margin:0;">Nin Dental Clinic · Cotización / Presupuesto — No tiene valor fiscal</p>
  </div>
</div>
<div class="no-print" style="padding:20px 0;display:flex;gap:10px;justify-content:center;">
  <button onclick="window.print()" style="padding:10px 28px;background:#1e40af;color:white;border:none;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">Imprimir</button>
  <button onclick="window.close()" style="padding:10px 24px;background:#f1f5f9;color:#475569;border:none;border-radius:9px;font-size:13px;cursor:pointer;font-family:inherit;">Cerrar</button>
</div>
</div></body></html>`;
}

// ─── meta ─────────────────────────────────────────────────────────────────────

export function meta(): Route.MetaDescriptors {
  return [{ title: "Cotizaciones — Nin Dental Clinic" }];
}

// ─── loader ───────────────────────────────────────────────────────────────────

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request);
  const clinicaId = await getClinicaId(request);

  const [{ data: cotizaciones }, { data: pacientes }, { data: tratamientos }] =
    await Promise.all([
      supabase
        .from("cotizaciones")
        .select(
          "id,clinica_id,paciente_id,titulo,doctor,fecha,fecha_vencimiento,notas,estado,monto_total,monto_congelamiento,fecha_congelamiento,created_at,pacientes(nombre,email,telefono),cotizacion_items(id,cotizacion_id,descripcion,tratamiento_id,cantidad,precio_unitario,precio_total)"
        )
        .eq("clinica_id", clinicaId)
        .order("created_at", { ascending: false }),
      supabase
        .from("pacientes")
        .select("id,nombre,email,telefono")
        .eq("clinica_id", clinicaId)
        .order("nombre"),
      supabase
        .from("tratamientos")
        .select("id,nombre,precio")
        .eq("clinica_id", clinicaId)
        .order("nombre"),
    ]);

  return {
    cotizaciones: (cotizaciones ?? []) as unknown as Cotizacion[],
    pacientes: (pacientes ?? []) as Paciente[],
    tratamientos: (tratamientos ?? []) as Tratamiento[],
  };
}

// ─── action ───────────────────────────────────────────────────────────────────

export async function action({ request }: Route.ActionArgs) {
  const { supabase } = createSupabaseServerClient(request);
  const clinicaId = await getClinicaId(request);
  const fd = await request.formData();
  const intent = fd.get("intent") as string;

  if (intent === "delete") {
    const { error } = await supabase
      .from("cotizaciones")
      .delete()
      .eq("id", fd.get("id") as string)
      .eq("clinica_id", clinicaId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  if (intent === "congelar") {
    const id = fd.get("id") as string;
    const metodoPago = fd.get("metodo_pago") as string;

    const { data: cot } = await supabase
      .from("cotizaciones")
      .select("id,monto_total,paciente_id,titulo")
      .eq("id", id)
      .eq("clinica_id", clinicaId)
      .single();

    if (!cot) return { ok: false };

    const deposito = Math.round(cot.monto_total * 0.1 * 100) / 100;
    const todayStr = new Date().toISOString().slice(0, 10);
    const venc = new Date();
    venc.setDate(venc.getDate() + 20);
    const vencStr = venc.toISOString().slice(0, 10);
    const folio = id.slice(-8).toUpperCase();

    const [{ error: congelarErr }, { error: pagoErr }] = await Promise.all([
      supabase
        .from("cotizaciones")
        .update({
          estado: "congelada",
          monto_congelamiento: deposito,
          fecha_congelamiento: todayStr,
          fecha_vencimiento: vencStr,
        })
        .eq("id", id)
        .eq("clinica_id", clinicaId),
      supabase.from("pagos").insert({
        clinica_id: clinicaId,
        paciente_id: (cot as any).paciente_id ?? null,
        concepto: `Congelamiento — ${(cot as any).titulo ?? "Cotización #" + folio}`,
        monto: deposito,
        tipo: "ingreso",
        metodo_pago: metodoPago,
        fecha: todayStr,
        notas: `Depósito 10% para reservar cotización #${folio}`,
      }),
    ]);
    const congelaError = congelarErr ?? pagoErr;
    if (congelaError) return { ok: false, error: congelaError.message };
    return { ok: true };
  }

  if (intent === "reactivar") {
    const id = fd.get("id") as string;
    const venc = new Date();
    venc.setDate(venc.getDate() + 20);
    const { error } = await supabase
      .from("cotizaciones")
      .update({
        estado: "activa",
        fecha: new Date().toISOString().slice(0, 10),
        fecha_vencimiento: venc.toISOString().slice(0, 10),
        monto_congelamiento: null,
        fecha_congelamiento: null,
      })
      .eq("id", id)
      .eq("clinica_id", clinicaId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  // create / update
  type ItemInput = { descripcion: string; tratamiento_id?: string; cantidad: number; precio_unitario: number; precio_total: number };
  let items: ItemInput[] = [];
  try {
    const raw = fd.get("items_json");
    const parsed = raw ? JSON.parse(raw as string) : [];
    items = Array.isArray(parsed) ? parsed : [];
  } catch {
    return { ok: false, error: "Error al procesar los ítems" };
  }

  const montoTotal = items.reduce((s, i) => s + i.precio_total, 0);
  const fecha = fd.get("fecha") as string;
  const venc = new Date(fecha + "T00:00:00");
  venc.setDate(venc.getDate() + 20);

  const cotData = {
    clinica_id: clinicaId,
    paciente_id: (fd.get("paciente_id") as string) || null,
    titulo: (fd.get("titulo") as string) || null,
    doctor: (fd.get("doctor") as string) || null,
    fecha,
    fecha_vencimiento: venc.toISOString().slice(0, 10),
    notas: (fd.get("notas") as string) || null,
    monto_total: montoTotal,
  };

  let cotId: string;
  if (intent === "create") {
    const { data: newCot, error: insertErr } = await supabase
      .from("cotizaciones")
      .insert({ ...cotData, estado: "activa" })
      .select("id")
      .single();
    if (!newCot) return { ok: false, error: insertErr?.message ?? "No se pudo crear la cotización" };
    cotId = newCot.id;
  } else {
    cotId = fd.get("id") as string;
    const { error: updateErr } = await supabase
      .from("cotizaciones")
      .update(cotData)
      .eq("id", cotId)
      .eq("clinica_id", clinicaId);
    if (updateErr) return { ok: false, error: updateErr.message };
    const { error: deleteItemsErr } = await supabase
      .from("cotizacion_items")
      .delete()
      .eq("cotizacion_id", cotId);
    if (deleteItemsErr) return { ok: false, error: deleteItemsErr.message };
  }

  if (items.length > 0) {
    const { error: itemsErr } = await supabase.from("cotizacion_items").insert(
      items.map((i) => ({
        cotizacion_id: cotId,
        descripcion: i.descripcion,
        tratamiento_id: i.tratamiento_id || null,
        cantidad: i.cantidad,
        precio_unitario: i.precio_unitario,
        precio_total: i.precio_total,
      }))
    );
    if (itemsErr) return { ok: false, error: itemsErr.message };
  }
  return { ok: true };
}

// ─── items editor ─────────────────────────────────────────────────────────────

function ItemsEditor({
  items,
  tratamientos,
  onChange,
}: {
  items: ItemDraft[];
  tratamientos: Tratamiento[];
  onChange: (items: ItemDraft[]) => void;
}) {
  function addItem() {
    onChange([
      ...items,
      { tempId: crypto.randomUUID(), tratamiento_id: "", descripcion: "", cantidad: "1", precio_unitario: "0" },
    ]);
  }

  function removeItem(tempId: string) {
    onChange(items.filter((i) => i.tempId !== tempId));
  }

  function updateItem(tempId: string, patch: Partial<ItemDraft>) {
    onChange(items.map((i) => (i.tempId === tempId ? { ...i, ...patch } : i)));
  }

  function selectTratamiento(tempId: string, tratId: string) {
    const t = tratamientos.find((t) => t.id === tratId);
    if (t) {
      updateItem(tempId, {
        tratamiento_id: tratId,
        descripcion: t.nombre,
        precio_unitario: String(t.precio),
      });
    } else {
      updateItem(tempId, { tratamiento_id: "" });
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-gray-600">Ítems / Tratamientos</label>
        <button
          type="button"
          onClick={addItem}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
        >
          <Plus size={13} /> Agregar ítem
        </button>
      </div>

      {items.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-4 border border-dashed border-gray-200 rounded-lg">
          Sin ítems — haz clic en "Agregar ítem"
        </p>
      )}

      {items.map((item) => {
        const cant = parseInt(item.cantidad) || 0;
        const precio = parseFloat(item.precio_unitario) || 0;
        const total = cant * precio;
        return (
          <div key={item.tempId} className="grid gap-2 p-3 bg-gray-50 rounded-xl border border-gray-100">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Del catálogo (opcional)</label>
                <select
                  value={item.tratamiento_id}
                  onChange={(e) => selectTratamiento(item.tempId, e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— Personalizado —</option>
                  {tratamientos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Descripción *</label>
                <input
                  type="text"
                  value={item.descripcion}
                  onChange={(e) => updateItem(item.tempId, { descripcion: e.target.value })}
                  placeholder="Ej. Extracción molar"
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 items-end">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Cantidad</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={item.cantidad}
                  onChange={(e) => updateItem(item.tempId, { cantidad: e.target.value })}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Precio unitario</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={item.precio_unitario}
                  onChange={(e) => updateItem(item.tempId, { precio_unitario: e.target.value })}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Total</p>
                  <p className="text-sm font-semibold text-gray-900">{fmt(total)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(item.tempId)}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {items.length > 0 && (
        <div className="flex justify-end pt-1">
          <p className="text-sm font-bold text-gray-900">
            Total:{" "}
            <span className="text-blue-700">
              {fmt(items.reduce((s, i) => s + (parseInt(i.cantidad) || 0) * (parseFloat(i.precio_unitario) || 0), 0))}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

// ─── form modal ───────────────────────────────────────────────────────────────

function CotizacionFormModal({
  cotizacion,
  pacientes,
  tratamientos,
  onClose,
}: {
  cotizacion: Cotizacion | null;
  pacientes: Paciente[];
  tratamientos: Tratamiento[];
  onClose: () => void;
}) {
  const fetcher = useFetcher<typeof action>();
  const isSubmitting = fetcher.state !== "idle";
  const fetcherData = fetcher.data as any;

  const [items, setItems] = useState<ItemDraft[]>(() =>
    cotizacion
      ? cotizacion.cotizacion_items.map((i) => ({
          tempId: i.id,
          tratamiento_id: i.tratamiento_id ?? "",
          descripcion: i.descripcion,
          cantidad: String(i.cantidad),
          precio_unitario: String(i.precio_unitario),
        }))
      : []
  );

  useEffect(() => {
    if (fetcher.state === "idle" && fetcherData?.ok) onClose();
  }, [fetcher.state, fetcherData]);

  const itemsJson = JSON.stringify(
    items.map((i) => {
      const cant = parseInt(i.cantidad) || 1;
      const precio = parseFloat(i.precio_unitario) || 0;
      return {
        descripcion: i.descripcion,
        tratamiento_id: i.tratamiento_id || undefined,
        cantidad: cant,
        precio_unitario: precio,
        precio_total: cant * precio,
      };
    })
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full sm:max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[95vh] sm:max-h-[92vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-semibold text-gray-900">
            {cotizacion ? "Editar cotización" : "Nueva cotización"}
          </h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          <fetcher.Form method="post" className="p-6 space-y-5">
            <input type="hidden" name="intent" value={cotizacion ? "update" : "create"} />
            {cotizacion && <input type="hidden" name="id" value={cotizacion.id} />}
            <input type="hidden" name="items_json" value={itemsJson} />
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Título / Concepto <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="titulo"
                  required
                  defaultValue={cotizacion?.titulo ?? ""}
                  placeholder="Ej. Plan de ortodoncia, Implante dental…"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Paciente</label>
                <select
                  name="paciente_id"
                  defaultValue={cotizacion?.paciente_id ?? ""}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— Sin paciente —</option>
                  {pacientes.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Doctor</label>
                <input
                  type="text"
                  name="doctor"
                  defaultValue={cotizacion?.doctor ?? ""}
                  placeholder="Dr. Nombre Apellido"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fecha</label>
                <input
                  type="date"
                  name="fecha"
                  defaultValue={
                    cotizacion
                      ? cotizacion.fecha
                      : new Date().toISOString().slice(0, 10)
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <ItemsEditor
              items={items}
              tratamientos={tratamientos}
              onChange={setItems}
            />

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
              <textarea
                name="notas"
                rows={3}
                defaultValue={cotizacion?.notas ?? ""}
                placeholder="Condiciones especiales, observaciones…"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            {fetcherData && !fetcherData.ok && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {fetcherData.error ?? "Error al guardar. Intenta de nuevo."}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting || items.length === 0}
                className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {isSubmitting ? "Guardando…" : cotizacion ? "Guardar cambios" : "Crear cotización"}
              </button>
            </div>
          </fetcher.Form>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── detalle modal ────────────────────────────────────────────────────────────

function CotizacionDetalleModal({
  cotizacion,
  onClose,
  onEdit,
}: {
  cotizacion: Cotizacion;
  onClose: () => void;
  onEdit: () => void;
}) {
  const navigation = useNavigation();
  const submit = useSubmit();
  const [showCongelar, setShowCongelar] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const displayEstado = computeEstado(cotizacion);
  const dias = diasRestantes(cotizacion.fecha_vencimiento);
  const { Icon, label, color } = estadoConfig[displayEstado];
  const deposito = Math.round(cotizacion.monto_total * 0.1 * 100) / 100;

  useCloseOnSubmit(() => { setShowCongelar(false); setConfirmDelete(false); });

  function handlePrint() {
    const w = window.open("", "_blank", "width=760,height=900");
    if (!w) { alert("Permite ventanas emergentes para imprimir"); return; }
    w.document.write(buildCotizacionHtml(cotizacion));
    w.document.close();
    w.focus();
  }

  return createPortal(
    <>
    <div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[95vh] sm:max-h-[92vh]">
        {/* header */}
        <div className="px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold", color)}>
                  <Icon size={11} /> {label}
                </span>
                {(displayEstado === "activa" || displayEstado === "congelada") && dias > 0 && (
                  <span className={cn("text-xs font-medium", dias <= 5 ? "text-orange-600" : "text-gray-400")}>
                    {dias === 1 ? "Vence mañana" : `${dias} días restantes`}
                  </span>
                )}
              </div>
              <h2 className="font-semibold text-gray-900 text-base truncate">
                {cotizacion.titulo ?? "Sin título"}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5 font-mono">
                #{cotizacion.id.slice(-8).toUpperCase()}
              </p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                type="button"
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Printer size={13} /> Imprimir
              </button>
              <button
                type="button"
                onClick={onEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Pencil size={13} /> Editar
              </button>
              <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-1">
                <X size={18} />
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* patient + doctor */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Paciente</p>
              <p className="font-medium text-gray-900">{cotizacion.pacientes?.nombre ?? "—"}</p>
              {cotizacion.pacientes?.telefono && (
                <p className="text-xs text-gray-500">{cotizacion.pacientes.telefono}</p>
              )}
              {cotizacion.pacientes?.email && (
                <p className="text-xs text-gray-500">{cotizacion.pacientes.email}</p>
              )}
            </div>
            <div>
              {cotizacion.doctor && (
                <>
                  <p className="text-xs text-gray-400 mb-0.5">Doctor</p>
                  <p className="font-medium text-gray-900">{cotizacion.doctor}</p>
                </>
              )}
              <p className="text-xs text-gray-400 mt-2 mb-0.5">Fecha</p>
              <p className="text-sm text-gray-700">{fmtDate(cotizacion.fecha)}</p>
              <p className="text-xs text-gray-400 mt-1 mb-0.5">Válida hasta</p>
              <p className="text-sm text-gray-700">{fmtDate(cotizacion.fecha_vencimiento)}</p>
            </div>
          </div>

          {/* items */}
          <div className="rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Concepto</th>
                  <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500">Cant.</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Precio</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {cotizacion.cotizacion_items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-2.5 text-gray-800">{item.descripcion}</td>
                    <td className="px-3 py-2.5 text-center text-gray-600">{item.cantidad}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{fmt(item.precio_unitario)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{fmt(item.precio_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-3 bg-blue-50 border-t border-blue-100 flex justify-between items-center">
              <span className="text-xs font-medium text-blue-600">Total de la cotización</span>
              <span className="text-lg font-bold text-blue-700">{fmt(cotizacion.monto_total)}</span>
            </div>
          </div>

          {/* congelamiento info */}
          {cotizacion.estado === "congelada" && cotizacion.monto_congelamiento && (
            <div className="rounded-xl border border-purple-100 bg-purple-50 px-4 py-3">
              <div className="flex items-center gap-2 text-purple-700">
                <Snowflake size={14} className="flex-shrink-0" />
                <p className="text-sm font-semibold">
                  Congelada el {fmtDate(cotizacion.fecha_congelamiento!)}
                </p>
              </div>
              <p className="text-xs text-purple-600 mt-1">
                Depósito pagado: <strong>{fmt(cotizacion.monto_congelamiento)}</strong> · Válida hasta: {fmtDate(cotizacion.fecha_vencimiento)}
              </p>
            </div>
          )}

          {/* notes */}
          {cotizacion.notas && (
            <div>
              <p className="text-xs text-gray-400 mb-1">Notas</p>
              <p className="text-sm text-gray-700 leading-relaxed">{cotizacion.notas}</p>
            </div>
          )}

          {/* congelar form (inline) */}
          {displayEstado === "activa" && (
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
              {!showCongelar ? (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-blue-800">¿Deseas congelar esta cotización?</p>
                    <p className="text-xs text-blue-600 mt-0.5">
                      Requiere depósito de <strong>{fmt(deposito)}</strong> (10%) · Extiende 20 días más
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCongelar(true)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors flex-shrink-0"
                  >
                    <Snowflake size={12} /> Congelar
                  </button>
                </div>
              ) : (
                <Form method="post" className="space-y-3">
                  <input type="hidden" name="intent" value="congelar" />
                  <input type="hidden" name="id" value={cotizacion.id} />
                  <p className="text-xs font-semibold text-blue-800">
                    Registrar depósito de congelamiento: <span className="text-blue-600">{fmt(deposito)}</span>
                  </p>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Método de pago</label>
                    <select
                      name="metodo_pago"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {METODOS.map((m) => (
                        <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCongelar(false)}
                      className="flex-1 px-3 py-2 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={navigation.state === "submitting"}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      <CheckCircle size={12} />
                      {navigation.state === "submitting" ? "Procesando…" : "Confirmar pago"}
                    </button>
                  </div>
                </Form>
              )}
            </div>
          )}

          {/* re-evaluar */}
          {(displayEstado === "vencida" || displayEstado === "reevaluacion") && (
            <div className="rounded-xl border border-orange-100 bg-orange-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-orange-800">
                    {displayEstado === "vencida" ? "Cotización vencida" : "Requiere re-evaluación"}
                  </p>
                  <p className="text-xs text-orange-600 mt-0.5">
                    {displayEstado === "vencida"
                      ? "El período de validez venció. Puedes re-evaluar para actualizar precios y reiniciar los 20 días."
                      : "El período de congelamiento venció. Se deben re-evaluar los precios antes de continuar."}
                  </p>
                </div>
                <div className="flex flex-col gap-1.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={onEdit}
                    className="flex items-center gap-1.5 px-3 py-2 bg-orange-600 text-white text-xs font-semibold rounded-lg hover:bg-orange-700 transition-colors"
                  >
                    <Pencil size={12} /> Re-evaluar
                  </button>
                  <Form method="post">
                    <input type="hidden" name="intent" value="reactivar" />
                    <input type="hidden" name="id" value={cotizacion.id} />
                    <button
                      type="submit"
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-orange-200 text-orange-700 text-xs font-medium rounded-lg hover:bg-orange-50 transition-colors"
                    >
                      <RotateCcw size={12} /> Mismo precio
                    </button>
                  </Form>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* footer delete */}
        <div className="px-5 py-3 border-t border-gray-100 flex-shrink-0 flex justify-end">
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
          >
            <Trash2 size={13} /> Eliminar
          </button>
        </div>
      </div>
    </div>

    {confirmDelete && (
      <ConfirmDeleteModal
        title="Eliminar cotización"
        itemLabel={cotizacion.titulo ?? (cotizacion.pacientes?.nombre ?? "Sin paciente")}
        description={`${fmt(cotizacion.monto_total)} · vence ${fmtDate(cotizacion.fecha_vencimiento)}. Esta acción no se puede deshacer.`}
        isSubmitting={navigation.state === "submitting"}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => submit({ intent: "delete", id: cotizacion.id }, { method: "post" })}
      />
    )}
    </>,
    document.body
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function Cotizaciones() {
  const { cotizaciones, pacientes, tratamientos } = useLoaderData<typeof loader>();
  const [detalle, setDetalle] = useState<Cotizacion | null>(null);
  const [formModal, setFormModal] = useState<{ open: boolean; cotizacion: Cotizacion | null }>({
    open: false,
    cotizacion: null,
  });

  const totales = {
    total: cotizaciones.length,
    activas: cotizaciones.filter((c) => computeEstado(c) === "activa").length,
    congeladas: cotizaciones.filter((c) => computeEstado(c) === "congelada").length,
    vencidas: cotizaciones.filter(
      (c) => computeEstado(c) === "vencida" || computeEstado(c) === "reevaluacion"
    ).length,
  };

  return (
    <div className="p-4 md:p-8">
      {/* header */}
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cotizaciones</h1>
          <p className="text-sm text-gray-400 mt-0.5">Presupuestos · válidos 20 días</p>
        </div>
        <button
          onClick={() => setFormModal({ open: true, cotizacion: null })}
          className="flex items-center gap-2 px-3 py-2 md:px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          <span className="hidden sm:inline">Nueva cotización</span>
          <span className="sm:hidden">Nueva</span>
        </button>
      </div>

      {/* kpi */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-4 md:mb-6">
        {[
          { label: "Total", value: totales.total, color: "text-gray-900" },
          { label: "Activas", value: totales.activas, color: "text-blue-700" },
          { label: "Congeladas", value: totales.congeladas, color: "text-purple-700" },
          { label: "Vencidas / Re-evaluar", value: totales.vencidas, color: "text-red-600" },
        ].map((k) => (
          <div key={k.label} className="bg-white rounded-2xl border border-gray-200 p-5">
            <p className="text-xs font-medium text-gray-400 mb-2">{k.label}</p>
            <p className={cn("text-3xl font-bold", k.color)}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* table / cards */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {cotizaciones.length === 0 ? (
          <div className="px-4 py-16 text-center text-gray-400">
            <FileText size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Sin cotizaciones aún.</p>
            <button onClick={() => setFormModal({ open: true, cotizacion: null })} className="mt-3 text-sm text-blue-600 hover:underline">
              Crear la primera
            </button>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <table className="hidden md:table w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Folio","Título","Paciente","Doctor","Fecha","Válida hasta","Total","Estado",""].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cotizaciones.map((c) => {
                  const estado = computeEstado(c);
                  const { label, color, Icon } = estadoConfig[estado];
                  const dias = diasRestantes(c.fecha_vencimiento);
                  return (
                    <tr key={c.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setDetalle(c)}>
                      <td className="px-4 py-3 font-mono text-xs text-gray-400">#{c.id.slice(-8).toUpperCase()}</td>
                      <td className="px-4 py-3 font-medium text-gray-900 max-w-[160px] truncate">{c.titulo ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-600">{c.pacientes?.nombre ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{c.doctor ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(c.fecha)}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        <span className={cn(dias <= 3 && (estado === "activa" || estado === "congelada") ? "text-orange-600 font-medium" : "")}>
                          {fmtDate(c.fecha_vencimiento)}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-blue-700 whitespace-nowrap">{fmt(c.monto_total)}</td>
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold", color)}>
                          <Icon size={10} /> {label}
                        </span>
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setFormModal({ open: true, cotizacion: c })} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Editar"><Pencil size={14} /></button>
                          <button onClick={() => { const w = window.open("", "_blank", "width=760,height=900"); if (!w) return; w.document.write(buildCotizacionHtml(c)); w.document.close(); }} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="Imprimir"><Printer size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {cotizaciones.map((c) => {
                const estado = computeEstado(c);
                const { label, color, Icon } = estadoConfig[estado];
                return (
                  <div key={c.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer" onClick={() => setDetalle(c)}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0", color)}>
                          <Icon size={9} /> {label}
                        </span>
                        <span className="text-xs text-gray-400 font-mono">#{c.id.slice(-6).toUpperCase()}</span>
                      </div>
                      <p className="text-sm font-medium text-gray-900 truncate">{c.titulo ?? c.pacientes?.nombre ?? "—"}</p>
                      <p className="text-xs text-gray-400 truncate">
                        {c.pacientes?.nombre ?? "—"} · Vence {fmtDate(c.fecha_vencimiento)}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-blue-700 whitespace-nowrap">{fmt(c.monto_total)}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {detalle && (
        <CotizacionDetalleModal
          cotizacion={detalle}
          onClose={() => setDetalle(null)}
          onEdit={() => {
            setFormModal({ open: true, cotizacion: detalle });
            setDetalle(null);
          }}
        />
      )}

      {formModal.open && (
        <CotizacionFormModal
          cotizacion={formModal.cotizacion}
          pacientes={pacientes}
          tratamientos={tratamientos}
          onClose={() => setFormModal({ open: false, cotizacion: null })}
        />
      )}
    </div>
  );
}
