import { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Form, useLoaderData, useNavigation, useFetcher, useSubmit, useActionData } from "react-router";
import type { Route } from "./+types/caja";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { getClinicaId } from "~/lib/clinica.server";
import { useCloseOnSubmit } from "~/lib/hooks";
import {
  Plus,
  X,
  Pencil,
  Trash2,
  TrendingUp,
  TrendingDown,
  DollarSign,
  FileText,
  CreditCard,
  CheckCircle,
  Clock,
  AlertCircle,
  Printer,
  Mail,
  Send,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { buildReciboHtml } from "~/lib/recibo";
import type { DeudaRecibo } from "~/lib/recibo";
import { ConfirmDeleteModal } from "~/components/ConfirmDeleteModal";

// ─── types ────────────────────────────────────────────────────────────────────

type Pago = {
  id: string;
  concepto: string;
  monto: number;
  tipo: "ingreso" | "egreso";
  metodo_pago: string;
  fecha: string;
  notas: string | null;
  cita_id: string | null;
  paciente_id: string | null;
  tratamiento_id: string | null;
  deuda_id: string | null;
  pacientes: { nombre: string; email: string | null } | null;
  citas: { fecha_hora: string; tratamientos: { nombre: string } | null } | null;
  tratamientos: { nombre: string; precio: number } | null;
};
type Deuda = {
  id: string;
  concepto: string;
  monto_total: number;
  estado: string;
  created_at: string;
  paciente_id: string | null;
  cita_id: string | null;
  tratamiento_id: string | null;
  pacientes: { nombre: string } | null;
  tratamientos: { nombre: string } | null;
  monto_pagado: number;
  saldo: number;
  porcentaje: number;
};
type Paciente = { id: string; nombre: string };
type Cita = {
  id: string;
  fecha_hora: string;
  pacientes: { nombre: string } | null;
  tratamientos: { nombre: string } | null;
};
type Tratamiento = { id: string; nombre: string; precio: number };

const METODOS = ["efectivo", "tarjeta", "transferencia"] as const;
const metodoBadge: Record<string, string> = {
  efectivo: "bg-green-100 text-green-700",
  tarjeta: "bg-purple-100 text-purple-700",
  transferencia: "bg-blue-100 text-blue-700",
};
const deudaEstadoStyle: Record<string, string> = {
  pendiente: "bg-yellow-100 text-yellow-700",
  liquidada: "bg-green-100 text-green-700",
  cancelada: "bg-gray-100 text-gray-500",
};

function fmt(n: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "DOP",
  }).format(n);
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", { dateStyle: "medium" });
}

export function meta(): Route.MetaDescriptors {
  return [{ title: "Caja — Nin Dental Clinic" }];
}

// ─── loader ───────────────────────────────────────────────────────────────────

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request);
  const clinicaId = await getClinicaId(request);

  const [
    { data: pagos },
    { data: pacientes },
    { data: citas },
    { data: tratamientos },
    { data: deudasRaw },
    { data: clinicaData },
  ] = await Promise.all([
    supabase
      .from("pagos")
      .select(
        "id,concepto,monto,tipo,metodo_pago,fecha,notas,cita_id,paciente_id,tratamiento_id,deuda_id,pacientes(nombre,email),citas(fecha_hora,tratamientos(nombre)),tratamientos(nombre,precio)",
      )
      .eq("clinica_id", clinicaId)
      .order("fecha", { ascending: false }),
    supabase
      .from("pacientes")
      .select("id,nombre")
      .eq("clinica_id", clinicaId)
      .order("nombre"),
    supabase
      .from("citas")
      .select("id,fecha_hora,pacientes(nombre),tratamientos(nombre)")
      .eq("clinica_id", clinicaId)
      .order("fecha_hora", { ascending: false })
      .limit(100),
    supabase
      .from("tratamientos")
      .select("id,nombre,precio")
      .eq("clinica_id", clinicaId)
      .order("nombre"),
    supabase
      .from("deudas")
      .select(
        "id,concepto,monto_total,estado,created_at,paciente_id,cita_id,tratamiento_id,pacientes(nombre),tratamientos(nombre),pagos(monto,tipo)",
      )
      .eq("clinica_id", clinicaId)
      .order("created_at", { ascending: false }),
    supabase.from("clinicas").select("nombre").eq("id", clinicaId).single(),
  ]);

  const deudas: Deuda[] = (deudasRaw ?? []).map((d: any) => {
    const monto_pagado = (d.pagos ?? [])
      .filter((p: any) => p.tipo === "ingreso")
      .reduce((s: number, p: any) => s + p.monto, 0);
    const saldo = Math.max(0, d.monto_total - monto_pagado);
    return {
      ...d,
      monto_pagado,
      saldo,
      porcentaje:
        d.monto_total > 0
          ? Math.min(100, (monto_pagado / d.monto_total) * 100)
          : 0,
    };
  });

  return {
    pagos: (pagos ?? []) as unknown as Pago[],
    pacientes: (pacientes ?? []) as Paciente[],
    citas: (citas ?? []) as unknown as Cita[],
    tratamientos: (tratamientos ?? []) as Tratamiento[],
    deudas,
    clinicaNombre: clinicaData?.nombre ?? 'Nin Dental Clinic',
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
      .from("pagos")
      .delete()
      .eq("id", fd.get("id") as string)
      .eq("clinica_id", clinicaId);
    return { ok: true };
  }

  if (intent === "create-deuda") {
    await supabase.from("deudas").insert({
      clinica_id: clinicaId,
      paciente_id: (fd.get("paciente_id") as string) || null,
      cita_id: (fd.get("cita_id") as string) || null,
      tratamiento_id: (fd.get("tratamiento_id") as string) || null,
      concepto: fd.get("concepto") as string,
      monto_total: Number(fd.get("monto_total")),
    });
    return { ok: true };
  }

  if (intent === "cancel-deuda") {
    await supabase
      .from("deudas")
      .update({ estado: "cancelada" })
      .eq("id", fd.get("id") as string)
      .eq("clinica_id", clinicaId);
    return { ok: true };
  }

  if (intent === "abono") {
    const deudaId = fd.get("deuda_id") as string;
    const monto = Number(fd.get("monto"));
    await supabase.from("pagos").insert({
      clinica_id: clinicaId,
      deuda_id: deudaId,
      paciente_id: (fd.get("paciente_id") as string) || null,
      tratamiento_id: (fd.get("tratamiento_id") as string) || null,
      concepto: fd.get("concepto") as string,
      monto,
      tipo: "ingreso",
      metodo_pago: fd.get("metodo_pago") as string,
      fecha: fd.get("fecha") as string,
      notas: (fd.get("notas") as string) || null,
    });
    // auto-liquidar si saldo cubierto
    const montoTotal = Number(fd.get("monto_total"));
    const montoPagado = Number(fd.get("monto_pagado")) + monto;
    if (montoPagado >= montoTotal) {
      await supabase
        .from("deudas")
        .update({ estado: "liquidada" })
        .eq("id", deudaId);
    }
    return { ok: true };
  }

  const data = {
    clinica_id: clinicaId,
    concepto: fd.get("concepto") as string,
    monto: Number(fd.get("monto")),
    tipo: fd.get("tipo") as string,
    metodo_pago: fd.get("metodo_pago") as string,
    fecha: fd.get("fecha") as string,
    notas: (fd.get("notas") as string) || null,
    paciente_id: (fd.get("paciente_id") as string) || null,
    cita_id: (fd.get("cita_id") as string) || null,
    tratamiento_id: (fd.get("tratamiento_id") as string) || null,
    deuda_id: (fd.get("deuda_id") as string) || null,
  };
  if (intent === "create") {
    const { data: created, error } = await supabase
      .from("pagos")
      .insert(data)
      .select(
        "id,concepto,monto,tipo,metodo_pago,fecha,notas,cita_id,paciente_id,tratamiento_id,deuda_id,pacientes(nombre,email),citas(fecha_hora,tratamientos(nombre)),tratamientos(nombre,precio)",
      )
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, intent: "create", pago: created as unknown as Pago };
  }
  if (intent === "update")
    await supabase
      .from("pagos")
      .update(data)
      .eq("id", fd.get("id") as string)
      .eq("clinica_id", clinicaId);
  return { ok: true };
}

// ─── deuda card ───────────────────────────────────────────────────────────────

function DeudaCard({
  deuda,
  onAbonar,
}: {
  deuda: Deuda;
  onAbonar: (d: Deuda) => void;
}) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const navigation = useNavigation();
  const submit = useSubmit();
  useCloseOnSubmit(() => setConfirmCancel(false));

  return (
    <>
    <div
      className={cn(
        "bg-white rounded-xl border p-4 space-y-3",
        deuda.estado === "liquidada"
          ? "border-green-200 opacity-75"
          : "border-gray-200",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-gray-900 truncate">
              {deuda.concepto}
            </p>
            <span
              className={cn(
                "px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0",
                deudaEstadoStyle[deuda.estado],
              )}
            >
              {deuda.estado}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {deuda.pacientes?.nombre ?? "Sin paciente"}
            {deuda.tratamientos ? ` · ${deuda.tratamientos.nombre}` : ""}
            {" · "}
            {fmtDate(deuda.created_at)}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-bold text-gray-900">
            {fmt(deuda.monto_total)}
          </p>
          {deuda.saldo > 0 && (
            <p className="text-xs text-red-500 font-medium">
              Saldo: {fmt(deuda.saldo)}
            </p>
          )}
        </div>
      </div>

      {/* progress bar */}
      <div>
        <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
          <span>Pagado: {fmt(deuda.monto_pagado)}</span>
          <span>{Math.round(deuda.porcentaje)}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-1.5">
          <div
            className={cn(
              "h-1.5 rounded-full transition-all",
              deuda.porcentaje >= 100 ? "bg-green-500" : "bg-blue-500",
            )}
            style={{ width: `${deuda.porcentaje}%` }}
          />
        </div>
      </div>

      {deuda.estado === "pendiente" && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">
            {deuda.saldo > 0 ? `Falta ${fmt(deuda.saldo)}` : "Monto cubierto"}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmCancel(true)}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              Cancelar
            </button>
            {deuda.saldo > 0 && (
              <button
                onClick={() => onAbonar(deuda)}
                className="flex items-center gap-1 px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <CreditCard size={11} /> Abonar
              </button>
            )}
          </div>
        </div>
      )}
    </div>

    {confirmCancel && (
      <ConfirmDeleteModal
        title="Cancelar cuenta"
        itemLabel={deuda.concepto}
        description={`${deuda.pacientes?.nombre ?? "Sin paciente"} · ${fmt(deuda.monto_total)}. Esta acción no se puede deshacer.`}
        confirmLabel="Cancelar cuenta"
        isSubmitting={navigation.state === "submitting"}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => submit({ intent: "cancel-deuda", id: deuda.id }, { method: "post" })}
      />
    )}
    </>
  );
}

// ─── tratamiento selector ─────────────────────────────────────────────────────

function TratamientoSelector({
  tratamientos,
  selected,
  onChange,
}: {
  tratamientos: Tratamiento[];
  selected: Tratamiento[];
  onChange: (items: Tratamiento[]) => void;
}) {
  const available = tratamientos.filter(
    (t) => !selected.some((s) => s.id === t.id),
  );

  function add(id: string) {
    const t = tratamientos.find((t) => t.id === id);
    if (t) onChange([...selected, t]);
  }

  function remove(id: string) {
    onChange(selected.filter((t) => t.id !== id));
  }

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-gray-600">
        Tratamientos
      </label>

      {/* chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium"
            >
              {t.nombre}
              <span className="text-blue-400 font-normal">
                · {fmt(t.precio)}
              </span>
              <button
                type="button"
                onClick={() => remove(t.id)}
                className="ml-0.5 text-blue-400 hover:text-blue-700 transition-colors"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* hidden fields for form submission */}
      {selected.map((t) => (
        <input key={t.id} type="hidden" name="tratamiento_ids[]" value={t.id} />
      ))}

      {/* add dropdown */}
      {available.length > 0 && (
        <select
          value=""
          onChange={(e) => {
            add(e.target.value);
            e.target.value = "";
          }}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">+ Agregar tratamiento…</option>
          {available.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre} — {fmt(t.precio)}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

// ─── nueva deuda modal ────────────────────────────────────────────────────────

function NuevaDeudaModal({
  pacientes,
  tratamientos,
  citas,
  onClose,
}: {
  pacientes: Paciente[];
  tratamientos: Tratamiento[];
  citas: Cita[];
  onClose: () => void;
}) {
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const [selectedTrats, setSelectedTrats] = useState<Tratamiento[]>([]);
  const [monto, setMonto] = useState("");
  const [concepto, setConcepto] = useState("");
  useCloseOnSubmit(onClose);

  function handleTratsChange(items: Tratamiento[]) {
    setSelectedTrats(items);
    const total = items.reduce((s, t) => s + t.precio, 0);
    if (total > 0) setMonto(String(total));
    if (items.length > 0) setConcepto(items.map((t) => t.nombre).join(" + "));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">
            Nueva cuenta por cobrar
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>
        <Form method="post" className="p-6 space-y-4">
          <input type="hidden" name="intent" value="create-deuda" />
          {/* single tratamiento_id: first selected (or empty) */}
          <input
            type="hidden"
            name="tratamiento_id"
            value={selectedTrats[0]?.id ?? ""}
          />

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Concepto <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="concepto"
              required
              placeholder="Ej. Ortodoncia — plan completo"
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Paciente
            </label>
            <select
              name="paciente_id"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Sin paciente —</option>
              {pacientes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>

          <TratamientoSelector
            tratamientos={tratamientos}
            selected={selectedTrats}
            onChange={handleTratsChange}
          />

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Monto total <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              name="monto_total"
              required
              min={0}
              step={1}
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {selectedTrats.length > 1 && (
              <p className="text-xs text-blue-500 mt-1">
                Suma de {selectedTrats.length} tratamientos auto-calculada.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
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
              {isSubmitting ? "Guardando…" : "Crear cuenta"}
            </button>
          </div>
        </Form>
      </div>
    </div>
  );
}

// ─── abono modal ──────────────────────────────────────────────────────────────

function AbonoModal({ deuda, onClose }: { deuda: Deuda; onClose: () => void }) {
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  useCloseOnSubmit(onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">Registrar abono</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {deuda.concepto} · Saldo: {fmt(deuda.saldo)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>

        {/* mini progress */}
        <div className="px-6 pt-4">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Pagado: {fmt(deuda.monto_pagado)}</span>
            <span>Total: {fmt(deuda.monto_total)}</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 mb-4">
            <div
              className="h-2 rounded-full bg-blue-500"
              style={{ width: `${deuda.porcentaje}%` }}
            />
          </div>
        </div>

        <Form method="post" className="px-6 pb-6 space-y-4">
          <input type="hidden" name="intent" value="abono" />
          <input type="hidden" name="deuda_id" value={deuda.id} />
          <input type="hidden" name="monto_total" value={deuda.monto_total} />
          <input type="hidden" name="monto_pagado" value={deuda.monto_pagado} />
          {deuda.paciente_id && (
            <input type="hidden" name="paciente_id" value={deuda.paciente_id} />
          )}
          {deuda.tratamiento_id && (
            <input
              type="hidden"
              name="tratamiento_id"
              value={deuda.tratamiento_id}
            />
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Monto del abono <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="monto"
                required
                min={0.01}
                step={0.01}
                defaultValue={deuda.saldo > 0 ? deuda.saldo : ""}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Método de pago
              </label>
              <select
                name="metodo_pago"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {METODOS.map((m) => (
                  <option key={m} value={m}>
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Concepto
            </label>
            <input
              type="text"
              name="concepto"
              defaultValue={`Abono — ${deuda.concepto}`}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Fecha
            </label>
            <input
              type="date"
              name="fecha"
              defaultValue={new Date().toISOString().slice(0, 10)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Notas
            </label>
            <textarea
              name="notas"
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
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
              {isSubmitting ? "Guardando…" : "Registrar abono"}
            </button>
          </div>
        </Form>
      </div>
    </div>
  );
}

// ─── pago detail modal ────────────────────────────────────────────────────────

function PagoDetalleModal({
  pago,
  onClose,
  onEdit,
  onRecibo,
}: {
  pago: Pago;
  onClose: () => void;
  onEdit: () => void;
  onRecibo: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const navigation = useNavigation();
  const submit = useSubmit();
  useCloseOnSubmit(() => setConfirmDelete(false));

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-start justify-between">
            <div>
              <span
                className={cn(
                  "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold",
                  pago.tipo === "ingreso"
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700",
                )}
              >
                {pago.tipo === "ingreso" ? (
                  <TrendingUp size={11} />
                ) : (
                  <TrendingDown size={11} />
                )}
                {pago.tipo}
              </span>
              <h2 className="font-semibold text-gray-900 text-lg mt-2">
                {pago.concepto}
              </h2>
              <p
                className={cn(
                  "text-2xl font-bold mt-1",
                  pago.tipo === "ingreso" ? "text-green-600" : "text-red-600",
                )}
              >
                {pago.tipo === "egreso" ? "−" : "+"}
                {fmt(pago.monto)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onRecibo}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Printer size={13} /> Recibo
              </button>
              <button
                onClick={onEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Pencil size={13} /> Editar
              </button>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        </div>
        <div className="px-6 py-4 space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-400">Fecha</p>
              <p className="font-medium text-gray-900 mt-0.5">
                {fmtDate(pago.fecha)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Método de pago</p>
              <span
                className={cn(
                  "inline-block mt-0.5 px-2 py-0.5 rounded-full text-xs font-medium capitalize",
                  metodoBadge[pago.metodo_pago],
                )}
              >
                {pago.metodo_pago}
              </span>
            </div>
          </div>
          {pago.pacientes && (
            <div>
              <p className="text-xs text-gray-400">Paciente</p>
              <p className="font-medium text-gray-900 mt-0.5">
                {pago.pacientes.nombre}
              </p>
            </div>
          )}
          {pago.tratamientos && (
            <div>
              <p className="text-xs text-gray-400">Tratamiento</p>
              <p className="font-medium text-gray-900 mt-0.5">
                {pago.tratamientos.nombre}
              </p>
            </div>
          )}
          {pago.citas && (
            <div>
              <p className="text-xs text-gray-400">Cita vinculada</p>
              <p className="font-medium text-gray-900 mt-0.5">
                {pago.citas.tratamientos?.nombre ?? "Cita"} ·{" "}
                {new Date(pago.citas.fecha_hora).toLocaleDateString("es-MX", {
                  dateStyle: "medium",
                })}
              </p>
            </div>
          )}
          {pago.notas && (
            <div>
              <p className="text-xs text-gray-400">Notas</p>
              <p className="text-gray-700 mt-0.5">{pago.notas}</p>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
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
        title="Eliminar movimiento"
        itemLabel={pago.concepto}
        description={`${pago.tipo === "egreso" ? "−" : "+"}${fmt(pago.monto)} · ${fmtDate(pago.fecha)}${pago.pacientes ? ` · ${pago.pacientes.nombre}` : ""}. Esta acción no se puede deshacer.`}
        isSubmitting={navigation.state === "submitting"}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => submit({ intent: "delete", id: pago.id }, { method: "post" })}
      />
    )}
    </>
  );
}

// ─── pago edit modal ──────────────────────────────────────────────────────────

function PagoEditModal({
  pago,
  pacientes,
  citas,
  tratamientos,
  onClose,
  onCreated,
}: {
  pago: Pago | null;
  pacientes: Paciente[];
  citas: Cita[];
  tratamientos: Tratamiento[];
  onClose: () => void;
  onCreated: (pago: Pago) => void;
}) {
  const navigation = useNavigation();
  const actionData = useActionData<typeof action>();
  const isSubmitting = navigation.state === "submitting";

  const initialTrat = pago?.tratamiento_id
    ? tratamientos.filter((t) => t.id === pago.tratamiento_id)
    : [];
  const [selectedTrats, setSelectedTrats] =
    useState<Tratamiento[]>(initialTrat);
  const [monto, setMonto] = useState(pago ? String(pago.monto) : "");
  const [concepto, setConcepto] = useState(pago?.concepto ?? "");

  // on a fresh "create" (not edit), jump straight to the receipt instead of
  // just closing — no need to hunt the new entry down in the table afterward
  const wasSubmitting = useRef(false);
  useEffect(() => {
    if (navigation.state === "submitting") wasSubmitting.current = true;
    else if (navigation.state === "idle" && wasSubmitting.current) {
      wasSubmitting.current = false;
      if (!pago && actionData?.ok && "pago" in actionData && actionData.pago) {
        onCreated(actionData.pago);
      } else {
        onClose();
      }
    }
  }, [navigation.state]);

  function handleTratsChange(items: Tratamiento[]) {
    setSelectedTrats(items);
    const total = items.reduce((s, t) => s + t.precio, 0);
    if (total > 0) setMonto(String(total));
    if (items.length > 0 && !pago)
      setConcepto(items.map((t) => t.nombre).join(" + "));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">
            {pago ? "Editar movimiento" : "Nuevo movimiento"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>
        <Form method="post" className="p-6 space-y-4">
          <input
            type="hidden"
            name="intent"
            value={pago ? "update" : "create"}
          />
          {pago && <input type="hidden" name="id" value={pago.id} />}
          {/* single tratamiento_id: first selected */}
          <input
            type="hidden"
            name="tratamiento_id"
            value={selectedTrats[0]?.id ?? ""}
          />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Tipo
              </label>
              <select
                name="tipo"
                defaultValue={pago?.tipo ?? "ingreso"}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ingreso">Ingreso</option>
                <option value="egreso">Egreso</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Método
              </label>
              <select
                name="metodo_pago"
                defaultValue={pago?.metodo_pago ?? "efectivo"}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {METODOS.map((m) => (
                  <option key={m} value={m}>
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Concepto <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="concepto"
              required
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              placeholder="Ej. Limpieza dental"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <TratamientoSelector
            tratamientos={tratamientos}
            selected={selectedTrats}
            onChange={handleTratsChange}
          />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Monto <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="monto"
                required
                min={0}
                step={1}
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Fecha
              </label>
              <input
                type="date"
                name="fecha"
                defaultValue={
                  pago
                    ? new Date(pago.fecha).toISOString().slice(0, 10)
                    : new Date().toISOString().slice(0, 10)
                }
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Paciente
            </label>
            <select
              name="paciente_id"
              defaultValue={pago?.paciente_id ?? ""}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Sin paciente —</option>
              {pacientes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Cita vinculada
            </label>
            <select
              name="cita_id"
              defaultValue={pago?.cita_id ?? ""}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Sin cita —</option>
              {citas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.pacientes?.nombre ?? "?"} ·{" "}
                  {c.tratamientos?.nombre ?? "Sin trat."} ·{" "}
                  {new Date(c.fecha_hora).toLocaleDateString("es-MX", {
                    dateStyle: "short",
                  })}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Notas
            </label>
            <textarea
              name="notas"
              rows={2}
              defaultValue={pago?.notas ?? ""}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {actionData?.ok === false && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {actionData.error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
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
              {isSubmitting ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </Form>
      </div>
    </div>
  );
}

// ─── recibo modal ─────────────────────────────────────────────────────────────

function ReciboModal({
  pago,
  deuda,
  onClose,
  clinicaNombre,
}: {
  pago: Pago;
  deuda?: DeudaRecibo | null;
  onClose: () => void;
  clinicaNombre: string;
}) {
  const [showEmail, setShowEmail] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [errMsg, setErrMsg] = useState("");
  const pacienteEmail = pago.pacientes?.email ?? "";

  async function handlePrint() {
    const QRCode = (await import("qrcode")).default;
    const qrUrl = `${window.location.origin}/verificar/${pago.id}`;
    const qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 176, margin: 1, color: { dark: "#1e293b", light: "#ffffff" } });
    const logoUrl = `${window.location.origin}/ninlogo.png`
    const html = buildReciboHtml(pago, false, deuda ?? undefined, qrDataUrl, clinicaNombre, logoUrl);
    const w = window.open("", "_blank", "width=520,height=820");
    if (!w) {
      alert("Permite ventanas emergentes para imprimir");
      return;
    }
    w.document.write(html);
    w.document.close();
    w.focus();
  }

  async function handleSendEmail(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setStatus("sending");
    setErrMsg("");
    try {
      const res = await fetch("/api/send-recibo", {
        method: "POST",
        body: fd,
      });
      const text = await res.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        setStatus("error");
        setErrMsg(`Respuesta inesperada (${res.status}): ${text.slice(0, 200)}`);
        return;
      }
      if (data.emailSent) {
        setStatus("sent");
      } else {
        setStatus("error");
        setErrMsg(data.error ?? "Error al enviar");
      }
    } catch (err) {
      setStatus("error");
      setErrMsg(err instanceof Error ? err.message : "Error de conexión");
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-semibold text-gray-900">Recibo de pago</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {/* mini receipt preview */}
          <div className="rounded-xl overflow-hidden border border-blue-100">
            <div className="bg-gradient-to-r from-blue-700 to-blue-500 px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-blue-200 mb-0.5">Nin Dental Clinic</p>
                  <p className="text-sm font-bold text-white truncate">
                    {pago.concepto}
                  </p>
                  {pago.pacientes && (
                    <p className="text-xs text-blue-200 mt-1 truncate">
                      {pago.pacientes.nombre}
                    </p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-lg font-bold text-white">
                    {fmt(pago.monto)}
                  </p>
                  <p className="text-xs text-blue-200 mt-0.5">
                    {fmtDate(pago.fecha)}
                  </p>
                </div>
              </div>
              <p className="text-xs text-blue-300 mt-3 font-mono">
                #{pago.id.slice(-8).toUpperCase()}
              </p>
            </div>
            <div className="bg-white px-5 py-2.5 flex items-center gap-3 flex-wrap text-xs">
              <span
                className={cn(
                  "px-2 py-0.5 rounded-full font-medium capitalize",
                  pago.tipo === "ingreso"
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700",
                )}
              >
                {pago.tipo}
              </span>
              <span
                className={cn(
                  "px-2 py-0.5 rounded-full font-medium capitalize",
                  metodoBadge[pago.metodo_pago],
                )}
              >
                {pago.metodo_pago}
              </span>
              {pago.tratamientos && (
                <span className="text-gray-400 truncate">
                  {pago.tratamientos.nombre}
                </span>
              )}
            </div>
          </div>

          {/* action buttons */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-colors"
            >
              <Printer size={14} /> Imprimir
            </button>
            <button
              type="button"
              onClick={() => {
                setShowEmail((v) => !v);
                setStatus("idle");
              }}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl border transition-colors",
                showEmail
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50",
              )}
            >
              <Mail size={14} /> Correo
            </button>
          </div>

          {/* email section */}
          {showEmail && (
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
              {status === "sent" ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-green-700">
                    <CheckCircle size={17} className="flex-shrink-0" />
                    <p className="text-sm font-medium">
                      Recibo enviado correctamente
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowEmail(false);
                      setStatus("idle");
                    }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Enviar a otro correo
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSendEmail} className="space-y-3">
                  <input type="hidden" name="intent" value="send-recibo" />
                  <input type="hidden" name="pago_id" value={pago.id} />
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Correo electrónico
                      {pacienteEmail && (
                        <span className="ml-1 text-blue-400 font-normal">
                          (del paciente)
                        </span>
                      )}
                    </label>
                    <input
                      key={showEmail ? "email-open" : "email-closed"}
                      type="email"
                      name="email"
                      disabled={status === "sending"}
                      defaultValue={pacienteEmail}
                      placeholder="paciente@ejemplo.com"
                      autoFocus
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  {status === "error" && (
                    <p className="text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
                      {errMsg}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={status === "sending"}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    <Send size={13} />
                    {status === "sending" ? "Enviando…" : "Enviar recibo"}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function Caja() {
  const { pagos, pacientes, citas, tratamientos, deudas, clinicaNombre } =
    useLoaderData<typeof loader>();
  const [tipoFilter, setTipoFilter] = useState("todos");
  const [deudaTab, setDeudaTab] = useState<"pendiente" | "liquidada">(
    "pendiente",
  );
  const [detalle, setDetalle] = useState<Pago | null>(null);
  const [editModal, setEditModal] = useState<{
    open: boolean;
    pago: Pago | null;
  }>({ open: false, pago: null });
  const [nuevaDeudaOpen, setNuevaDeudaOpen] = useState(false);
  const [abonoDeuda, setAbonoDeuda] = useState<Deuda | null>(null);
  const [reciboModal, setReciboModal] = useState<Pago | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Pago | null>(null);
  const navigation = useNavigation();
  const submit = useSubmit();
  useCloseOnSubmit(() => setDeleteTarget(null));

  const filtered = useMemo(() => {
    if (tipoFilter === "todos") return pagos;
    return pagos.filter((p) => p.tipo === tipoFilter);
  }, [pagos, tipoFilter]);

  const filteredDeudas = useMemo(
    () => deudas.filter((d) => d.estado === deudaTab),
    [deudas, deudaTab],
  );

  const now = new Date();
  const mesActual = pagos.filter((p) => {
    const d = new Date(p.fecha);
    return (
      d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    );
  });
  const ingresosMes = mesActual
    .filter((p) => p.tipo === "ingreso")
    .reduce((s, p) => s + p.monto, 0);
  const egresosMes = mesActual
    .filter((p) => p.tipo === "egreso")
    .reduce((s, p) => s + p.monto, 0);
  const balanceMes = ingresosMes - egresosMes;

  const hoy = pagos.filter((p) => {
    const d = new Date(p.fecha);
    return (
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear()
    );
  });
  const ingresosHoy = hoy
    .filter((p) => p.tipo === "ingreso")
    .reduce((s, p) => s + p.monto, 0);
  const egresosHoy = hoy
    .filter((p) => p.tipo === "egreso")
    .reduce((s, p) => s + p.monto, 0);
  const balanceHoy = ingresosHoy - egresosHoy;

  const ingresosTotal = pagos
    .filter((p) => p.tipo === "ingreso")
    .reduce((s, p) => s + p.monto, 0);
  const egresosTotal = pagos
    .filter((p) => p.tipo === "egreso")
    .reduce((s, p) => s + p.monto, 0);
  const saldoTotalPendiente = deudas
    .filter((d) => d.estado === "pendiente")
    .reduce((s, d) => s + d.saldo, 0);

  return (
    <div className="p-4 md:p-8">
      {/* header */}
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Caja</h1>
        <button
          onClick={() => setEditModal({ open: true, pago: null })}
          className="flex items-center gap-2 px-3 py-2 md:px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          <span className="hidden sm:inline">Nuevo movimiento</span>
          <span className="sm:hidden">Nuevo</span>
        </button>
      </div>

      {/* KPI cards */}
      <div className="space-y-3 mb-6">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Hoy
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                <TrendingUp size={15} className="text-green-600" />
              </div>
              <span className="text-xs font-medium text-gray-500">
                Ingresos
              </span>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {fmt(ingresosHoy)}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {hoy.filter((p) => p.tipo === "ingreso").length} movimientos
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                <TrendingDown size={15} className="text-red-600" />
              </div>
              <span className="text-xs font-medium text-gray-500">Egresos</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {fmt(egresosHoy)}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {hoy.filter((p) => p.tipo === "egreso").length} movimientos
            </p>
          </div>
          <div
            className={cn(
              "rounded-2xl border p-5",
              balanceHoy >= 0
                ? "bg-blue-50 border-blue-100"
                : "bg-red-50 border-red-100",
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              <div
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center",
                  balanceHoy >= 0 ? "bg-blue-100" : "bg-red-100",
                )}
              >
                <DollarSign
                  size={15}
                  className={balanceHoy >= 0 ? "text-blue-600" : "text-red-600"}
                />
              </div>
              <span className="text-xs font-medium text-gray-500">Balance</span>
            </div>
            <p
              className={cn(
                "text-2xl font-bold",
                balanceHoy >= 0 ? "text-blue-700" : "text-red-700",
              )}
            >
              {fmt(balanceHoy)}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {hoy.length} movimientos totales
            </p>
          </div>
        </div>

        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-2">
          Este mes
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                <TrendingUp size={15} className="text-green-600" />
              </div>
              <span className="text-xs font-medium text-gray-500">
                Ingresos
              </span>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {fmt(ingresosMes)}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Total histórico: {fmt(ingresosTotal)}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                <TrendingDown size={15} className="text-red-600" />
              </div>
              <span className="text-xs font-medium text-gray-500">Egresos</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {fmt(egresosMes)}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Total histórico: {fmt(egresosTotal)}
            </p>
          </div>
          <div
            className={cn(
              "rounded-2xl border p-5",
              balanceMes >= 0
                ? "bg-blue-50 border-blue-100"
                : "bg-red-50 border-red-100",
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              <div
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center",
                  balanceMes >= 0 ? "bg-blue-100" : "bg-red-100",
                )}
              >
                <DollarSign
                  size={15}
                  className={balanceMes >= 0 ? "text-blue-600" : "text-red-600"}
                />
              </div>
              <span className="text-xs font-medium text-gray-500">Balance</span>
            </div>
            <p
              className={cn(
                "text-2xl font-bold",
                balanceMes >= 0 ? "text-blue-700" : "text-red-700",
              )}
            >
              {fmt(balanceMes)}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {balanceMes >= 0 ? "Utilidad" : "Pérdida"}
            </p>
          </div>
        </div>
      </div>

      {/* cuentas por cobrar */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-6">
        <div className="flex flex-wrap items-start gap-3 px-4 sm:px-5 py-4 border-b border-gray-100">
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-gray-900 text-sm">
              Cuentas por cobrar
            </h2>
            {saldoTotalPendiente > 0 && (
              <p className="text-xs text-orange-500 font-medium mt-0.5">
                Saldo pendiente total: {fmt(saldoTotalPendiente)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {(["pendiente", "liquidada"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setDeudaTab(t)}
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium rounded-md transition-colors capitalize whitespace-nowrap",
                    deudaTab === t
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700",
                  )}
                >
                  {t === "pendiente"
                    ? `Pendientes (${deudas.filter((d) => d.estado === "pendiente").length})`
                    : `Liquidadas (${deudas.filter((d) => d.estado === "liquidada").length})`}
                </button>
              ))}
            </div>
            <button
              onClick={() => setNuevaDeudaOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={13} /> Nueva
            </button>
          </div>
        </div>
        <div className="p-3 sm:p-4">
          {filteredDeudas.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">
              {deudaTab === "pendiente"
                ? "No hay cuentas pendientes."
                : "No hay cuentas liquidadas."}
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredDeudas.map((d) => (
                <DeudaCard key={d.id} deuda={d} onAbonar={setAbonoDeuda} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* movimientos */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {["todos", "ingreso", "egreso"].map((t) => (
            <button
              key={t}
              onClick={() => setTipoFilter(t)}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-md transition-colors capitalize",
                tipoFilter === t
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700",
              )}
            >
              {t === "todos"
                ? "Todos"
                : t === "ingreso"
                  ? "Ingresos"
                  : "Egresos"}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400 ml-auto">
          {filtered.length} movimientos
        </span>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-gray-400">
            <FileText size={32} className="mx-auto mb-2 opacity-30" />
            No hay movimientos.
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <table className="hidden md:table w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Fecha","Concepto","Paciente","Tratamiento","Método","Tipo","Monto",""].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setDetalle(p)}>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(p.fecha)}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {p.concepto}
                      {p.deuda_id && <span className="ml-1 text-xs text-blue-500">· abono</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{p.pacientes?.nombre ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{p.tratamientos?.nombre ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium capitalize", metodoBadge[p.metodo_pago])}>{p.metodo_pago}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("flex items-center gap-1 w-fit px-2 py-0.5 rounded-full text-xs font-medium", p.tipo === "ingreso" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}>
                        {p.tipo === "ingreso" ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                        {p.tipo}
                      </span>
                    </td>
                    <td className={cn("px-4 py-3 font-semibold whitespace-nowrap", p.tipo === "ingreso" ? "text-green-600" : "text-red-600")}>
                      {p.tipo === "egreso" ? "−" : "+"}{fmt(p.monto)}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setReciboModal(p)} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="Ver recibo"><Printer size={14} /></button>
                        <button onClick={() => setEditModal({ open: true, pago: p })} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Pencil size={14} /></button>
                        <button onClick={() => setDeleteTarget(p)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {filtered.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer" onClick={() => setDetalle(p)}>
                  <div className={cn("w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0", p.tipo === "ingreso" ? "bg-green-100" : "bg-red-100")}>
                    {p.tipo === "ingreso" ? <TrendingUp size={14} className="text-green-600" /> : <TrendingDown size={14} className="text-red-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {p.concepto}
                      {p.deuda_id && <span className="ml-1 text-xs text-blue-500">· abono</span>}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {fmtDate(p.fecha)}
                      {p.pacientes?.nombre ? ` · ${p.pacientes.nombre}` : ''}
                    </p>
                  </div>
                  <span className={cn("text-sm font-semibold whitespace-nowrap", p.tipo === "ingreso" ? "text-green-600" : "text-red-600")}>
                    {p.tipo === "egreso" ? "−" : "+"}{fmt(p.monto)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {detalle && (
        <PagoDetalleModal
          pago={detalle}
          onClose={() => setDetalle(null)}
          onEdit={() => {
            setEditModal({ open: true, pago: detalle });
            setDetalle(null);
          }}
          onRecibo={() => {
            setReciboModal(detalle);
            setDetalle(null);
          }}
        />
      )}
      {reciboModal && (
        <ReciboModal
          pago={reciboModal}
          deuda={
            reciboModal.deuda_id
              ? deudas.find((d) => d.id === reciboModal.deuda_id) ?? null
              : null
          }
          onClose={() => setReciboModal(null)}
          clinicaNombre={clinicaNombre}
        />
      )}
      {editModal.open && (
        <PagoEditModal
          pago={editModal.pago}
          pacientes={pacientes}
          citas={citas}
          tratamientos={tratamientos}
          onClose={() => setEditModal({ open: false, pago: null })}
          onCreated={(pago) => {
            setEditModal({ open: false, pago: null });
            setReciboModal(pago);
          }}
        />
      )}
      {nuevaDeudaOpen && (
        <NuevaDeudaModal
          pacientes={pacientes}
          tratamientos={tratamientos}
          citas={citas}
          onClose={() => setNuevaDeudaOpen(false)}
        />
      )}
      {abonoDeuda && (
        <AbonoModal deuda={abonoDeuda} onClose={() => setAbonoDeuda(null)} />
      )}
      {deleteTarget && (
        <ConfirmDeleteModal
          title="Eliminar movimiento"
          itemLabel={deleteTarget.concepto}
          description={`${deleteTarget.tipo === "egreso" ? "−" : "+"}${fmt(deleteTarget.monto)} · ${fmtDate(deleteTarget.fecha)}${deleteTarget.pacientes ? ` · ${deleteTarget.pacientes.nombre}` : ""}. Esta acción no se puede deshacer.`}
          isSubmitting={navigation.state === "submitting"}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => submit({ intent: "delete", id: deleteTarget.id }, { method: "post" })}
        />
      )}
    </div>
  );
}
