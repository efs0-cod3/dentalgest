import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useLoaderData, useFetcher } from "react-router";
import type { Route } from "./+types/laboratorio";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { getClinicaId } from "~/lib/clinica.server";
import {
  Plus, X, Pencil, Trash2, Clock, CheckCircle, Package,
  AlertTriangle, FlaskConical, Calendar, Printer,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { ConfirmDeleteModal } from "~/components/ConfirmDeleteModal";

// ─── types ────────────────────────────────────────────────────────────────────

type EstadoOrden = "en_proceso" | "listo" | "entregado";

type OrdenLaboratorio = {
  id: string;
  clinica_id: string;
  paciente_id: string | null;
  titulo: string;
  laboratorio: string | null;
  tipo_trabajo: string | null;
  color_dental: string | null;
  doctor: string | null;
  fecha_solicitud: string;
  fecha_prometida: string | null;
  fecha_entrega: string | null;
  estado: EstadoOrden;
  notas: string | null;
  costo: number | null;
  created_at: string;
  pacientes: { nombre: string } | null;
};

type Paciente = { id: string; nombre: string };

// ─── utils ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("es-MX", { dateStyle: "medium" });
}
function fmtMXN(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
}
function isPastDue(orden: OrdenLaboratorio): boolean {
  if (orden.estado === "entregado") return false;
  if (!orden.fecha_prometida) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return new Date(orden.fecha_prometida + "T00:00:00") < today;
}
function diasRestantes(fechaPrometida: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(fechaPrometida + "T00:00:00").getTime() - today.getTime()) / 86400000);
}

const estadoConfig: Record<EstadoOrden, { label: string; color: string; Icon: any }> = {
  en_proceso: { label: "En proceso", color: "bg-blue-100 text-blue-700",   Icon: Clock },
  listo:      { label: "Listo",      color: "bg-green-100 text-green-700", Icon: CheckCircle },
  entregado:  { label: "Entregado",  color: "bg-gray-100 text-gray-500",   Icon: Package },
};

// ─── print html ───────────────────────────────────────────────────────────────

function esc(s: string) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildOrdenHtml(orden: OrdenLaboratorio): string {
  const folio = orden.id.slice(-8).toUpperCase();
  const today = new Date().toLocaleDateString("es-MX", { dateStyle: "long" });

  function row(label: string, value: string | null | undefined, highlight = false) {
    if (!value) return "";
    return `<tr>
      <td style="padding:9px 0;border-bottom:1px solid #f1f5f9;width:40%;vertical-align:top;">
        <p style="margin:0;font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#94a3b8;">${label}</p>
      </td>
      <td style="padding:9px 0 9px 12px;border-bottom:1px solid #f1f5f9;vertical-align:top;">
        <p style="margin:0;font-size:13px;color:${highlight ? "#1e40af" : "#0f172a"};font-weight:${highlight ? "700" : "500"};">${esc(value)}</p>
      </td>
    </tr>`;
  }

  return `<!DOCTYPE html><html lang="es"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Orden de Laboratorio #${folio} — Nin Dental Clinic</title>
<script>window.onload=function(){setTimeout(function(){window.print()},500)}<\/script>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#f1f5f9;padding:32px 20px;}
@media print{body{background:white;padding:0;}.no-print{display:none!important;}@page{margin:1.5cm;size:A5;}}
</style></head><body>
<div style="max-width:520px;margin:0 auto;">
<div style="background:white;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,.10);">

  <div style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:22px 28px;display:flex;justify-content:space-between;align-items:flex-start;">
    <div>
      <p style="color:rgba(255,255,255,.7);font-size:10px;margin:0 0 2px;text-transform:uppercase;letter-spacing:.1em;">Orden de Laboratorio</p>
      <p style="color:white;font-size:18px;font-weight:800;margin:0 0 2px;">Nin Dental Clinic</p>
      <p style="color:rgba(255,255,255,.8);font-size:12px;margin:0;font-family:monospace;">Folio #${folio}</p>
    </div>
    <div style="text-align:right;">
      <p style="color:rgba(255,255,255,.7);font-size:10px;margin:0 0 2px;">Fecha de impresión</p>
      <p style="color:white;font-size:12px;font-weight:500;margin:0;">${today}</p>
    </div>
  </div>

  <div style="padding:20px 28px;">
    <p style="font-size:15px;font-weight:800;color:#0f172a;margin:0 0 16px;padding-bottom:12px;border-bottom:2px solid #e2e8f0;">${esc(orden.titulo)}</p>
    <table style="width:100%;border-collapse:collapse;">
      ${row("Paciente", orden.pacientes?.nombre)}
      ${row("Doctor", orden.doctor)}
      ${row("Laboratorio", orden.laboratorio, true)}
      ${row("Tipo de trabajo", orden.tipo_trabajo)}
      ${row("Color dental", orden.color_dental, true)}
      ${row("Fecha de envío", orden.fecha_solicitud ? fmtDate(orden.fecha_solicitud) : null)}
      ${row("Fecha prometida", orden.fecha_prometida ? fmtDate(orden.fecha_prometida) : null, true)}
    </table>
  </div>

  ${orden.notas ? `<div style="margin:0 28px 20px;padding:12px 14px;background:#f8fafc;border-radius:10px;border-left:3px solid #3b82f6;">
    <p style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#94a3b8;margin:0 0 4px;">Notas / Instrucciones</p>
    <p style="font-size:13px;color:#334155;margin:0;line-height:1.6;">${esc(orden.notas)}</p>
  </div>` : ""}

  <div style="padding:14px 28px;background:#fafafa;border-top:1px solid #e2e8f0;display:flex;gap:32px;">
    <div>
      <p style="font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:#94a3b8;margin:0 0 3px;">Firma / Sello laboratorio</p>
      <div style="width:160px;height:42px;border-bottom:1px solid #cbd5e1;margin-top:8px;"></div>
    </div>
    <div>
      <p style="font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:#94a3b8;margin:0 0 3px;">Fecha de entrega real</p>
      <div style="width:120px;height:42px;border-bottom:1px solid #cbd5e1;margin-top:8px;"></div>
    </div>
  </div>

</div>
<div class="no-print" style="padding:16px 0;display:flex;gap:10px;justify-content:center;">
  <button onclick="window.print()" style="padding:10px 28px;background:#1e40af;color:white;border:none;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">Imprimir</button>
  <button onclick="window.close()" style="padding:10px 24px;background:#f1f5f9;color:#475569;border:none;border-radius:9px;font-size:13px;cursor:pointer;font-family:inherit;">Cerrar</button>
</div>
</div></body></html>`;
}

// ─── meta ─────────────────────────────────────────────────────────────────────

export function meta(): Route.MetaDescriptors {
  return [{ title: "Laboratorio — Nin Dental Clinic" }];
}

// ─── loader ───────────────────────────────────────────────────────────────────

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request);
  const clinicaId = await getClinicaId(request);

  const [{ data: ordenes }, { data: pacientes }] = await Promise.all([
    supabase
      .from("ordenes_laboratorio")
      .select(
        "id,clinica_id,paciente_id,titulo,laboratorio,tipo_trabajo,color_dental,doctor,fecha_solicitud,fecha_prometida,fecha_entrega,estado,notas,costo,created_at,pacientes(nombre)"
      )
      .eq("clinica_id", clinicaId)
      .order("created_at", { ascending: false }),
    supabase
      .from("pacientes")
      .select("id,nombre")
      .eq("clinica_id", clinicaId)
      .order("nombre"),
  ]);

  return {
    ordenes: (ordenes ?? []) as unknown as OrdenLaboratorio[],
    pacientes: (pacientes ?? []) as Paciente[],
  };
}

// ─── action ───────────────────────────────────────────────────────────────────

export async function action({ request }: Route.ActionArgs) {
  const { supabase } = createSupabaseServerClient(request);
  const clinicaId = await getClinicaId(request);
  const fd = await request.formData();
  const intent = fd.get("intent") as string;

  if (intent === "delete") {
    await supabase
      .from("ordenes_laboratorio")
      .delete()
      .eq("id", fd.get("id") as string)
      .eq("clinica_id", clinicaId);
    return { ok: true };
  }

  if (intent === "cambiar_estado") {
    const nuevoEstado = fd.get("estado") as string;
    const updates: Record<string, string | null> = { estado: nuevoEstado };
    if (nuevoEstado === "entregado") {
      updates.fecha_entrega = new Date().toISOString().slice(0, 10);
    }
    await supabase
      .from("ordenes_laboratorio")
      .update(updates)
      .eq("id", fd.get("id") as string)
      .eq("clinica_id", clinicaId);
    return { ok: true };
  }

  const ordenData = {
    clinica_id: clinicaId,
    paciente_id: (fd.get("paciente_id") as string) || null,
    titulo: fd.get("titulo") as string,
    laboratorio: (fd.get("laboratorio") as string) || null,
    tipo_trabajo: (fd.get("tipo_trabajo") as string) || null,
    color_dental: (fd.get("color_dental") as string) || null,
    doctor: (fd.get("doctor") as string) || null,
    fecha_solicitud: (fd.get("fecha_solicitud") as string) || new Date().toISOString().slice(0, 10),
    fecha_prometida: (fd.get("fecha_prometida") as string) || null,
    notas: (fd.get("notas") as string) || null,
    costo: parseFloat(fd.get("costo") as string) || null,
  };

  if (intent === "create") {
    const { error } = await supabase
      .from("ordenes_laboratorio")
      .insert({ ...ordenData, estado: "en_proceso" });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  // update
  const estado = (fd.get("estado") as string) || undefined;
  const updates: Record<string, unknown> = { ...ordenData };
  if (estado) {
    updates.estado = estado;
    if (estado === "entregado") {
      updates.fecha_entrega = new Date().toISOString().slice(0, 10);
    }
  }

  const { error } = await supabase
    .from("ordenes_laboratorio")
    .update(updates)
    .eq("id", fd.get("id") as string)
    .eq("clinica_id", clinicaId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ─── form modal ───────────────────────────────────────────────────────────────

const TIPOS_TRABAJO = [
  "Corona",
  "Puente",
  "Prótesis total",
  "Prótesis parcial removible",
  "Retenedor / Guarda",
  "Carilla / Faceta",
  "Implante (componente)",
  "Otro",
];

function OrdenFormModal({
  orden,
  pacientes,
  onClose,
}: {
  orden: OrdenLaboratorio | null;
  pacientes: Paciente[];
  onClose: () => void;
}) {
  const fetcher = useFetcher<typeof action>();
  const isSubmitting = fetcher.state !== "idle";
  const fetcherData = fetcher.data as any;

  useEffect(() => {
    if (fetcher.state === "idle" && fetcherData?.ok) onClose();
  }, [fetcher.state, fetcherData]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full sm:max-w-xl bg-white rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[95vh] sm:max-h-[92vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-semibold text-gray-900">
            {orden ? "Editar orden" : "Nueva orden de laboratorio"}
          </h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          <fetcher.Form method="post" className="p-6 space-y-4">
            <input type="hidden" name="intent" value={orden ? "update" : "create"} />
            {orden && <input type="hidden" name="id" value={orden.id} />}

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Trabajo / Descripción <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="titulo"
                required
                defaultValue={orden?.titulo ?? ""}
                placeholder="Ej. Corona E-max pieza #14, Prótesis total superior…"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Paciente</label>
                <select
                  name="paciente_id"
                  defaultValue={orden?.paciente_id ?? ""}
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
                  defaultValue={orden?.doctor ?? ""}
                  placeholder="Dr. Nombre"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Laboratorio</label>
                <input
                  type="text"
                  name="laboratorio"
                  defaultValue={orden?.laboratorio ?? ""}
                  placeholder="Nombre del laboratorio"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de trabajo</label>
                <input
                  type="text"
                  name="tipo_trabajo"
                  list="tipos-trabajo-list"
                  defaultValue={orden?.tipo_trabajo ?? ""}
                  placeholder="Corona, Puente…"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <datalist id="tipos-trabajo-list">
                  {TIPOS_TRABAJO.map((t) => <option key={t} value={t} />)}
                </datalist>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Color dental</label>
                <input
                  type="text"
                  name="color_dental"
                  defaultValue={orden?.color_dental ?? ""}
                  placeholder="Ej. A2, B1, OM3…"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Costo del laboratorio</label>
                <input
                  type="number"
                  name="costo"
                  min={0}
                  step={1}
                  defaultValue={orden?.costo ?? ""}
                  placeholder="0"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fecha de envío</label>
                <input
                  type="date"
                  name="fecha_solicitud"
                  defaultValue={orden?.fecha_solicitud ?? new Date().toISOString().slice(0, 10)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fecha prometida</label>
                <input
                  type="date"
                  name="fecha_prometida"
                  defaultValue={orden?.fecha_prometida ?? ""}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {orden && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Estado</label>
                <select
                  name="estado"
                  defaultValue={orden.estado}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="en_proceso">En proceso</option>
                  <option value="listo">Listo para entregar</option>
                  <option value="entregado">Entregado</option>
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
              <textarea
                name="notas"
                rows={2}
                defaultValue={orden?.notas ?? ""}
                placeholder="Instrucciones especiales, observaciones…"
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
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {isSubmitting ? "Guardando…" : orden ? "Guardar cambios" : "Crear orden"}
              </button>
            </div>
          </fetcher.Form>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── orden card ───────────────────────────────────────────────────────────────

function OrdenCard({
  orden,
  onEdit,
}: {
  orden: OrdenLaboratorio;
  onEdit: () => void;
}) {
  const fetcher = useFetcher();
  const deleteFetcher = useFetcher();
  const pastDue = isPastDue(orden);
  const { label, color, Icon } = estadoConfig[orden.estado];
  const dias = orden.fecha_prometida ? diasRestantes(orden.fecha_prometida) : null;
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  function handlePrint() {
    const w = window.open("", "_blank", "width=600,height=800");
    if (!w) { alert("Permite ventanas emergentes para imprimir"); return; }
    w.document.write(buildOrdenHtml(orden));
    w.document.close();
    w.focus();
  }

  useEffect(() => {
    if (deleteFetcher.state === "idle" && deleteFetcher.data) setConfirmDeleteOpen(false);
  }, [deleteFetcher.state, deleteFetcher.data]);

  function confirmDelete() {
    const fd = new FormData();
    fd.set("intent", "delete");
    fd.set("id", orden.id);
    deleteFetcher.submit(fd, { method: "post" });
  }

  function cambiarEstado(nuevoEstado: EstadoOrden) {
    const fd = new FormData();
    fd.set("intent", "cambiar_estado");
    fd.set("id", orden.id);
    fd.set("estado", nuevoEstado);
    fetcher.submit(fd, { method: "post" });
  }

  return (
    <div
      className={cn(
        "bg-white rounded-2xl border p-4 flex flex-col gap-3 transition-shadow hover:shadow-md",
        pastDue ? "border-red-200" : "border-gray-100"
      )}
    >
      {/* top: status + actions */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
            <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold", color)}>
              <Icon size={10} /> {label}
            </span>
            {pastDue && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                <AlertTriangle size={10} /> Vencida
              </span>
            )}
          </div>
          <p className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2">
            {orden.titulo}
          </p>
          <div className="flex flex-wrap items-center gap-x-2 mt-0.5">
            {orden.pacientes && (
              <span className="text-xs text-gray-500">{orden.pacientes.nombre}</span>
            )}
            {orden.tipo_trabajo && (
              <span className="text-xs text-gray-400">· {orden.tipo_trabajo}</span>
            )}
            {orden.color_dental && (
              <span className="text-xs text-gray-400">· {orden.color_dental}</span>
            )}
          </div>
          {orden.laboratorio && (
            <p className="text-xs text-gray-400 mt-0.5">{orden.laboratorio}</p>
          )}
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            type="button"
            onClick={handlePrint}
            title="Imprimir orden"
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Printer size={13} />
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(true)}
            disabled={deleteFetcher.state !== "idle"}
            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {confirmDeleteOpen && (
        <ConfirmDeleteModal
          title="Eliminar orden"
          itemLabel={orden.titulo}
          description={`${orden.pacientes?.nombre ?? "Sin paciente"} · solicitada ${fmtDate(orden.fecha_solicitud)}. Esta acción no se puede deshacer.`}
          isSubmitting={deleteFetcher.state !== "idle"}
          onCancel={() => setConfirmDeleteOpen(false)}
          onConfirm={confirmDelete}
        />
      )}

      {/* dates + cost */}
      <div className="flex items-center justify-between text-xs">
        {orden.fecha_prometida ? (
          <div className={cn(
            "flex items-center gap-1",
            pastDue ? "text-red-600 font-semibold" : dias !== null && dias <= 2 ? "text-orange-600 font-medium" : "text-gray-500"
          )}>
            <Calendar size={11} />
            {pastDue
              ? `Venció ${fmtDate(orden.fecha_prometida)}`
              : dias === 0
                ? "Entrega hoy"
                : dias === 1
                  ? "Entrega mañana"
                  : `Entrega ${fmtDate(orden.fecha_prometida)}`}
          </div>
        ) : (
          <span className="text-gray-300 text-xs">Sin fecha prometida</span>
        )}
        {orden.costo != null && (
          <span className="font-medium text-gray-700">{fmtMXN(orden.costo)}</span>
        )}
      </div>

      {/* quick action buttons */}
      {orden.estado !== "entregado" && (
        <div className="flex gap-2 pt-1 border-t border-gray-50">
          {orden.estado === "en_proceso" && (
            <button
              type="button"
              onClick={() => cambiarEstado("listo")}
              disabled={fetcher.state !== "idle"}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors disabled:opacity-50"
            >
              <CheckCircle size={12} /> Marcar listo
            </button>
          )}
          {orden.estado === "listo" && (
            <>
              <button
                type="button"
                onClick={() => cambiarEstado("en_proceso")}
                disabled={fetcher.state !== "idle"}
                title="Regresar a en proceso"
                className="flex items-center justify-center gap-1 py-1.5 px-3 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
              >
                <Clock size={13} />
              </button>
              <button
                type="button"
                onClick={() => cambiarEstado("entregado")}
                disabled={fetcher.state !== "idle"}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-50"
              >
                <Package size={12} /> Marcar entregado
              </button>
            </>
          )}
        </div>
      )}

      {orden.estado === "entregado" && orden.fecha_entrega && (
        <p className="text-xs text-gray-400 border-t border-gray-50 pt-2">
          Entregado el {fmtDate(orden.fecha_entrega)}
        </p>
      )}
    </div>
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────

type FiltroEstado = "todas" | EstadoOrden;

export default function Laboratorio({ loaderData }: Route.ComponentProps) {
  const { ordenes, pacientes } = loaderData;
  const [filtro, setFiltro] = useState<FiltroEstado>("todas");
  const [formModal, setFormModal] = useState<{ open: boolean; orden: OrdenLaboratorio | null }>({
    open: false,
    orden: null,
  });

  const vencidas = ordenes.filter(isPastDue).length;

  const ordenesFiltradas =
    filtro === "todas" ? ordenes : ordenes.filter((o) => o.estado === filtro);

  const filtros: { key: FiltroEstado; label: string }[] = [
    { key: "todas",      label: `Todas (${ordenes.length})` },
    { key: "en_proceso", label: `En proceso (${ordenes.filter((o) => o.estado === "en_proceso").length})` },
    { key: "listo",      label: `Listos (${ordenes.filter((o) => o.estado === "listo").length})` },
    { key: "entregado",  label: `Entregados (${ordenes.filter((o) => o.estado === "entregado").length})` },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* header */}
      <div className="bg-white border-b border-gray-100 px-4 sm:px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <FlaskConical size={18} className="text-blue-600" />
          <h1 className="text-lg font-bold text-gray-900">Laboratorio</h1>
          {vencidas > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
              <AlertTriangle size={10} /> {vencidas} vencida{vencidas !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setFormModal({ open: true, orden: null })}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors"
        >
          <Plus size={15} /> Nueva orden
        </button>
      </div>

      {/* filter tabs */}
      <div className="bg-white border-b border-gray-100 px-3 sm:px-6 flex-shrink-0 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {filtros.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFiltro(key)}
              className={cn(
                "px-3 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                filtro === key
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* cards grid */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-6">
        {ordenesFiltradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
              <FlaskConical size={22} className="text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-500">
              {filtro === "todas"
                ? "Sin órdenes de laboratorio"
                : `Sin órdenes en "${filtros.find((f) => f.key === filtro)?.label ?? filtro}"`}
            </p>
            {filtro === "todas" && (
              <button
                type="button"
                onClick={() => setFormModal({ open: true, orden: null })}
                className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Crear primera orden
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {ordenesFiltradas.map((orden) => (
              <OrdenCard
                key={orden.id}
                orden={orden}
                onEdit={() => setFormModal({ open: true, orden })}
              />
            ))}
          </div>
        )}
      </div>

      {formModal.open && (
        <OrdenFormModal
          orden={formModal.orden}
          pacientes={pacientes}
          onClose={() => setFormModal({ open: false, orden: null })}
        />
      )}
    </div>
  );
}
