import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Form, useLoaderData, useNavigation, useFetcher, useSubmit } from "react-router";
import type { Route } from "./+types/cotizaciones";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { requireSeccion } from "~/lib/clinica.server";
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
  Mail,
  Send,
} from "lucide-react";
import { cn, fmtMoney, convertirMoneda, drDateKey, drDateKeyMas, drDiasHasta, sumarDias, type Moneda } from "~/lib/utils";
import { buildCotizacionHtml, fmtDate } from "~/lib/cotizacion";

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
  moneda: Moneda;
  tasa_cambio: number | null;
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
// Se compara contra el día dominicano, no contra `new Date()`: el servidor
// corre en UTC y desde las 8 PM de RD ya está en el día siguiente, así que una
// cotización que vencía hoy salía "vencida" en el servidor y "activa" en el
// navegador. Comparar cadenas 'YYYY-MM-DD' ordena igual que las fechas.
function computeEstado(c: Cotizacion): DisplayEstado {
  const vencida = c.fecha_vencimiento < drDateKey();
  if (c.estado === "congelada") return vencida ? "reevaluacion" : "congelada";
  return vencida ? "vencida" : "activa";
}
const diasRestantes = drDiasHasta;

const estadoConfig: Record<DisplayEstado, { label: string; color: string; Icon: any }> = {
  activa:       { label: "Activa",       color: "bg-blue-100 text-blue-700",   Icon: Clock },
  congelada:    { label: "Congelada",    color: "bg-purple-100 text-purple-700", Icon: Snowflake },
  vencida:      { label: "Vencida",      color: "bg-red-100 text-red-700",     Icon: XCircle },
  reevaluacion: { label: "Re-evaluar",   color: "bg-orange-100 text-orange-700", Icon: AlertCircle },
};

// ─── meta ─────────────────────────────────────────────────────────────────────

export function meta(): Route.MetaDescriptors {
  return [{ title: "Cotizaciones — Nin Dental Clinic" }];
}

// ─── loader ───────────────────────────────────────────────────────────────────

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request);
  const { clinicaId } = await requireSeccion(request, 'cotizaciones');

  const [
    { data: cotizaciones },
    { data: pacientes },
    { data: tratamientos },
    { data: config },
    { data: clinica },
  ] = await Promise.all([
    supabase
      .from("cotizaciones")
      .select(
        "id,clinica_id,paciente_id,titulo,doctor,fecha,fecha_vencimiento,notas,estado,monto_total,monto_congelamiento,fecha_congelamiento,created_at,moneda,tasa_cambio,pacientes(nombre,email,telefono),cotizacion_items(id,cotizacion_id,descripcion,tratamiento_id,cantidad,precio_unitario,precio_total)"
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
    supabase
      .from("config_clinica")
      .select("caja_multimoneda,caja_tasa_usd,recibo_email_habilitado")
      .eq("clinica_id", clinicaId)
      .maybeSingle(),
    supabase
      .from("clinicas")
      .select("nombre")
      .eq("id", clinicaId)
      .maybeSingle(),
  ]);

  return {
    cotizaciones: (cotizaciones ?? []) as unknown as Cotizacion[],
    pacientes: (pacientes ?? []) as Paciente[],
    tratamientos: (tratamientos ?? []) as Tratamiento[],
    multimoneda: config?.caja_multimoneda ?? false,
    tasaUsd: (config?.caja_tasa_usd as number | null) ?? null,
    // mismo interruptor que los recibos: "Envío de documentos" en Configuración
    emailHabilitado: config?.recibo_email_habilitado ?? true,
    clinicaNombre: (clinica?.nombre as string | null) ?? "Nin Dental Clinic",
  };
}

// ─── action ───────────────────────────────────────────────────────────────────

export async function action({ request }: Route.ActionArgs) {
  const { supabase } = createSupabaseServerClient(request);
  const { clinicaId } = await requireSeccion(request, 'cotizaciones');
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
      .select("id,monto_total,paciente_id,titulo,moneda,tasa_cambio")
      .eq("id", id)
      .eq("clinica_id", clinicaId)
      .single();

    if (!cot) return { ok: false };

    const deposito = Math.round(cot.monto_total * 0.1 * 100) / 100;
    const todayStr = drDateKey();
    const vencStr = drDateKeyMas(20);
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
        moneda: (cot as any).moneda ?? "DOP",
        tasa_cambio: (cot as any).tasa_cambio ?? null,
        notas: `Depósito 10% para reservar cotización #${folio}`,
      }),
    ]);
    const congelaError = congelarErr ?? pagoErr;
    if (congelaError) return { ok: false, error: congelaError.message };
    return { ok: true };
  }

  if (intent === "reactivar") {
    const id = fd.get("id") as string;
    const { error } = await supabase
      .from("cotizaciones")
      .update({
        estado: "activa",
        fecha: drDateKey(),
        fecha_vencimiento: drDateKeyMas(20),
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
  // 20 días desde la fecha del formulario, calculados sobre la cadena para que
  // no dependan de la zona en la que corra el servidor
  const vencimiento = sumarDias(fecha, 20);

  const moneda: Moneda = (fd.get("moneda") as string) === "USD" ? "USD" : "DOP";
  const tasaRaw = parseFloat(fd.get("tasa_cambio") as string);
  const tasaCambio = moneda === "USD" && Number.isFinite(tasaRaw) && tasaRaw > 0 ? tasaRaw : null;
  if (moneda === "USD" && !tasaCambio) {
    return { ok: false, error: "Ingresa una tasa de cambio válida para una cotización en dólares" };
  }

  const cotData = {
    clinica_id: clinicaId,
    paciente_id: (fd.get("paciente_id") as string) || null,
    titulo: (fd.get("titulo") as string) || null,
    doctor: (fd.get("doctor") as string) || null,
    fecha,
    fecha_vencimiento: vencimiento,
    notas: (fd.get("notas") as string) || null,
    monto_total: montoTotal,
    moneda,
    tasa_cambio: tasaCambio,
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
  moneda,
  tasa,
  onChange,
}: {
  items: ItemDraft[];
  tratamientos: Tratamiento[];
  moneda: Moneda;
  tasa: number | null;
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
      // el precio del catálogo está en pesos: convertir a USD con la tasa
      // cuando la cotización está en dólares, para que fluya automáticamente
      const convertido = moneda === "USD"
        ? convertirMoneda(t.precio, "DOP", "USD", tasa)
        : t.precio;
      const precio = convertido != null ? Math.round(convertido * 100) / 100 : t.precio;
      updateItem(tempId, {
        tratamiento_id: tratId,
        descripcion: t.nombre,
        precio_unitario: String(precio),
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
                  {tratamientos.map((t) => {
                    const conv = moneda === "USD" ? convertirMoneda(t.precio, "DOP", "USD", tasa) : t.precio;
                    const precioTxt = conv != null ? fmt(Math.round(conv * 100) / 100, moneda) : fmt(t.precio, "DOP");
                    return (
                      <option key={t.id} value={t.id}>
                        {t.nombre} · {precioTxt}
                      </option>
                    );
                  })}
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
                  <p className="text-sm font-semibold text-gray-900">{fmt(total, moneda)}</p>
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
              {fmt(items.reduce((s, i) => s + (parseInt(i.cantidad) || 0) * (parseFloat(i.precio_unitario) || 0), 0), moneda)}
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
  multimoneda,
  tasaUsd,
  onClose,
}: {
  cotizacion: Cotizacion | null;
  pacientes: Paciente[];
  tratamientos: Tratamiento[];
  multimoneda: boolean;
  tasaUsd: number | null;
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
  const [moneda, setMoneda] = useState<Moneda>(cotizacion?.moneda ?? "DOP");
  const [tasa, setTasa] = useState<string>(
    cotizacion?.tasa_cambio != null ? String(cotizacion.tasa_cambio) : (tasaUsd != null ? String(tasaUsd) : "")
  );

  const totalActual = items.reduce(
    (s, i) => s + (parseInt(i.cantidad) || 0) * (parseFloat(i.precio_unitario) || 0),
    0
  );
  const equivDop = moneda === "USD"
    ? convertirMoneda(totalActual, "USD", "DOP", parseFloat(tasa) || null)
    : null;

  // al cambiar la moneda, reconvertir todos los ítems con la tasa vigente para
  // que la cotización mantenga el mismo valor real (reversible en ambos sentidos)
  function cambiarMoneda(siguiente: Moneda) {
    if (siguiente === moneda) return;
    const r = parseFloat(tasa) || null;
    if (r && r > 0) {
      setItems((prev) =>
        prev.map((i) => {
          const p = parseFloat(i.precio_unitario) || 0;
          const c = convertirMoneda(p, moneda, siguiente, r);
          return c != null ? { ...i, precio_unitario: String(Math.round(c * 100) / 100) } : i;
        })
      );
    }
    setMoneda(siguiente);
  }

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
            <input type="hidden" name="moneda" value={moneda} />
            <input type="hidden" name="tasa_cambio" value={moneda === "USD" ? tasa : ""} />
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
                      : drDateKey()
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {multimoneda && (
              <div className="flex flex-wrap items-end gap-4 p-3 bg-blue-50/50 border border-blue-100 rounded-xl">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Moneda</label>
                  <select
                    value={moneda}
                    onChange={(e) => cambiarMoneda(e.target.value as Moneda)}
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="DOP">RD$ — Pesos</option>
                    <option value="USD">US$ — Dólares</option>
                  </select>
                </div>
                {moneda === "USD" && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Tasa (RD$ por US$1)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={tasa}
                        onChange={(e) => setTasa(e.target.value)}
                        placeholder="60.00"
                        className="w-28 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    {equivDop != null && (
                      <p className="text-xs text-gray-500 pb-2">≈ {fmtMoney(equivDop, "DOP")}</p>
                    )}
                  </>
                )}
                <p className="w-full text-xs text-gray-400">
                  Al cambiar de moneda, los precios de los ítems se reconvierten con la tasa.
                </p>
              </div>
            )}

            <ItemsEditor
              items={items}
              tratamientos={tratamientos}
              moneda={moneda}
              tasa={parseFloat(tasa) || null}
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
  emailHabilitado,
  clinicaNombre,
  onClose,
  onEdit,
}: {
  cotizacion: Cotizacion;
  emailHabilitado: boolean;
  clinicaNombre: string;
  onClose: () => void;
  onEdit: () => void;
}) {
  const navigation = useNavigation();
  const submit = useSubmit();
  const [showCongelar, setShowCongelar] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [envio, setEnvio] = useState<"idle" | "enviando" | "enviado" | "error">("idle");
  const [envioError, setEnvioError] = useState("");
  const displayEstado = computeEstado(cotizacion);
  const dias = diasRestantes(cotizacion.fecha_vencimiento);
  const { Icon, label, color } = estadoConfig[displayEstado];
  const deposito = Math.round(cotizacion.monto_total * 0.1 * 100) / 100;

  useCloseOnSubmit(() => { setShowCongelar(false); setConfirmDelete(false); });

  function handlePrint() {
    const w = window.open("", "_blank", "width=760,height=900");
    if (!w) { alert("Permite ventanas emergentes para imprimir"); return; }
    w.document.write(buildCotizacionHtml(cotizacion, false, clinicaNombre));
    w.document.close();
    w.focus();
  }

  async function handleSendEmail(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setEnvio("enviando");
    setEnvioError("");
    try {
      const res = await fetch("/api/send-cotizacion", { method: "POST", body: fd });
      const texto = await res.text();
      let datos: any;
      try {
        datos = JSON.parse(texto);
      } catch {
        setEnvio("error");
        setEnvioError(`Respuesta inesperada (${res.status}): ${texto.slice(0, 200)}`);
        return;
      }
      if (datos.emailSent) {
        setEnvio("enviado");
      } else {
        setEnvio("error");
        setEnvioError(datos.error ?? "Error al enviar");
      }
    } catch (err) {
      setEnvio("error");
      setEnvioError(err instanceof Error ? err.message : "Error de conexión");
    }
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
              {emailHabilitado && (
                <button
                  type="button"
                  onClick={() => { setShowEmail(v => !v); setEnvio("idle"); }}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors",
                    showEmail
                      ? "bg-blue-600 text-white border-blue-600"
                      : "text-gray-600 border-gray-200 hover:bg-gray-50",
                  )}
                >
                  <Mail size={13} /> Correo
                </button>
              )}
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
          {/* enviar por correo */}
          {showEmail && (
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
              {envio === "enviado" ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-green-700">
                    <CheckCircle size={17} className="flex-shrink-0" />
                    <p className="text-sm font-medium">Cotización enviada correctamente</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEnvio("idle")}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Enviar a otro correo
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSendEmail} className="space-y-3">
                  <input type="hidden" name="cotizacion_id" value={cotizacion.id} />
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Correo electrónico
                      {cotizacion.pacientes?.email && (
                        <span className="ml-1 text-blue-400 font-normal">(del paciente)</span>
                      )}
                    </label>
                    <input
                      type="email"
                      name="email"
                      required
                      disabled={envio === "enviando"}
                      defaultValue={cotizacion.pacientes?.email ?? ""}
                      placeholder="paciente@ejemplo.com"
                      autoFocus
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  {envio === "error" && (
                    <p className="text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
                      {envioError}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={envio === "enviando"}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    <Send size={13} />
                    {envio === "enviando" ? "Enviando…" : "Enviar cotización"}
                  </button>
                </form>
              )}
            </div>
          )}

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
                    <td className="px-4 py-2.5 text-right text-gray-600">{fmt(item.precio_unitario, cotizacion.moneda)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{fmt(item.precio_total, cotizacion.moneda)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-3 bg-blue-50 border-t border-blue-100 flex justify-between items-center">
              <span className="text-xs font-medium text-blue-600">Total de la cotización{cotizacion.moneda === "USD" ? " (USD)" : ""}</span>
              <span className="text-lg font-bold text-blue-700">{fmt(cotizacion.monto_total, cotizacion.moneda)}</span>
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
                Depósito pagado: <strong>{fmt(cotizacion.monto_congelamiento, cotizacion.moneda)}</strong> · Válida hasta: {fmtDate(cotizacion.fecha_vencimiento)}
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
                      Requiere depósito de <strong>{fmt(deposito, cotizacion.moneda)}</strong> (10%) · Extiende 20 días más
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
                    Registrar depósito de congelamiento: <span className="text-blue-600">{fmt(deposito, cotizacion.moneda)}</span>
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
        description={`${fmt(cotizacion.monto_total, cotizacion.moneda)} · vence ${fmtDate(cotizacion.fecha_vencimiento)}. Esta acción no se puede deshacer.`}
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
  const { cotizaciones, pacientes, tratamientos, multimoneda, tasaUsd, emailHabilitado, clinicaNombre } =
    useLoaderData<typeof loader>();
  const [detalle, setDetalle] = useState<Cotizacion | null>(null);
  const [formModal, setFormModal] = useState<{ open: boolean; cotizacion: Cotizacion | null }>({
    open: false,
    cotizacion: null,
  });

  // el modal de detalle guarda una copia local de la cotización: si se eliminó
  // hay que cerrarlo, y si cambió (congelar, reactivar, editar) refrescarlo para
  // no mostrar datos viejos
  useEffect(() => {
    if (!detalle) return;
    const fresh = cotizaciones.find((c) => c.id === detalle.id);
    if (!fresh) setDetalle(null);
    else if (fresh !== detalle) setDetalle(fresh);
  }, [cotizaciones]);

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
                      <td className="px-4 py-3 font-semibold text-blue-700 whitespace-nowrap">
                        {fmt(c.monto_total, c.moneda)}
                        {c.moneda === "USD" && <span className="ml-1 text-xs font-medium text-gray-400">USD</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold", color)}>
                          <Icon size={10} /> {label}
                        </span>
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setFormModal({ open: true, cotizacion: c })} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Editar"><Pencil size={14} /></button>
                          <button onClick={() => { const w = window.open("", "_blank", "width=760,height=900"); if (!w) return; w.document.write(buildCotizacionHtml(c, false, clinicaNombre)); w.document.close(); }} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="Imprimir"><Printer size={14} /></button>
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
                    <span className="text-sm font-semibold text-blue-700 whitespace-nowrap">
                      {fmt(c.monto_total, c.moneda)}
                      {c.moneda === "USD" && <span className="ml-1 text-xs font-medium text-gray-400">USD</span>}
                    </span>
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
          emailHabilitado={emailHabilitado}
          clinicaNombre={clinicaNombre}
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
          multimoneda={multimoneda}
          tasaUsd={tasaUsd}
          onClose={() => setFormModal({ open: false, cotizacion: null })}
        />
      )}
    </div>
  );
}
