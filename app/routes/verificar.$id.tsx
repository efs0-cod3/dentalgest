import type { Route } from "./+types/verificar.$id";
import { createSupabaseAdminClient } from "~/lib/supabase.admin.server";
import { CheckCircle, XCircle, ShieldCheck } from "lucide-react";

// ─── types ────────────────────────────────────────────────────────────────────

type PagoPublico = {
  id: string;
  concepto: string;
  monto: number;
  tipo: "ingreso" | "egreso";
  metodo_pago: string;
  fecha: string;
  pacientes: { nombre: string } | null;
};

// ─── meta ─────────────────────────────────────────────────────────────────────

export function meta({ data }: Route.MetaArgs) {
  if (!data?.pago) return [{ title: "Recibo no encontrado — Nin Dental Clinic" }];
  const folio = (data.pago as PagoPublico).id.slice(-8).toUpperCase();
  return [{ title: `Recibo #${folio} — Nin Dental Clinic` }];
}

// ─── loader ───────────────────────────────────────────────────────────────────

export async function loader({ params }: Route.LoaderArgs) {
  const pagoId = params.id as string;

  if (!pagoId || pagoId.length < 8) {
    return { pago: null };
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data: pago } = await supabase
      .from("pagos")
      .select("id,concepto,monto,tipo,metodo_pago,fecha,pacientes(nombre)")
      .eq("id", pagoId)
      .single();
    return { pago: pago as unknown as PagoPublico | null };
  } catch {
    return { pago: null };
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtMXN(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
}
function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("es-MX", { dateStyle: "long" });
}
const metodoMap: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta bancaria",
  transferencia: "Transferencia electrónica",
};

// ─── component ────────────────────────────────────────────────────────────────

export default function VerificarRecibo({ loaderData }: Route.ComponentProps) {
  const { pago } = loaderData;

  if (!pago) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg overflow-hidden text-center">
          <div className="bg-red-600 px-6 py-8">
            <XCircle size={40} className="text-white mx-auto mb-2" />
            <p className="text-white font-bold text-lg">Recibo no encontrado</p>
            <p className="text-red-200 text-sm mt-1">Este recibo no existe o no es válido</p>
          </div>
          <div className="px-6 py-6">
            <p className="text-sm text-gray-500">
              Si crees que es un error, contacta directamente a la clínica.
            </p>
            <p className="mt-4 text-xs text-gray-400 font-semibold tracking-widest uppercase">
              Nin Dental Clinic
            </p>
          </div>
        </div>
      </div>
    );
  }

  const folio = pago.id.slice(-8).toUpperCase();
  const esIngreso = pago.tipo === "ingreso";

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* header */}
        <div className="bg-gradient-to-br from-blue-800 to-blue-500 px-6 py-7 text-center">
          <div className="w-12 h-12 bg-white/15 rounded-2xl flex items-center justify-center mx-auto mb-3 text-2xl">
            🦷
          </div>
          <p className="text-white font-bold text-lg">Nin Dental Clinic</p>
          <p className="text-blue-200 text-xs mt-0.5">Verificación de recibo</p>
        </div>

        {/* verified badge */}
        <div className="flex items-center justify-center gap-2 bg-green-50 border-b border-green-100 px-4 py-3">
          <ShieldCheck size={16} className="text-green-600 flex-shrink-0" />
          <p className="text-sm font-semibold text-green-700">Recibo auténtico · #{folio}</p>
          <CheckCircle size={14} className="text-green-500 flex-shrink-0" />
        </div>

        {/* amount */}
        <div className="px-6 py-5 text-center border-b border-gray-100">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-1">
            {esIngreso ? "Monto pagado" : "Monto"}
          </p>
          <p className={`text-4xl font-extrabold ${esIngreso ? "text-green-600" : "text-red-600"}`}>
            {fmtMXN(pago.monto)}
          </p>
        </div>

        {/* details */}
        <div className="px-6 py-4 space-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-0.5">Concepto</p>
            <p className="text-sm font-semibold text-gray-900">{pago.concepto}</p>
          </div>
          {pago.pacientes && (
            <div>
              <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-0.5">Paciente</p>
              <p className="text-sm text-gray-800">{pago.pacientes.nombre}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-0.5">Fecha</p>
              <p className="text-xs text-gray-700">{fmtDate(pago.fecha)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-0.5">Método</p>
              <p className="text-xs text-gray-700">{metodoMap[pago.metodo_pago] ?? pago.metodo_pago}</p>
            </div>
          </div>
        </div>

        {/* footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-gray-100 text-center">
          <p className="text-[10px] text-gray-400 leading-relaxed">
            Este documento es un comprobante de pago emitido por Nin Dental Clinic.
            <br />Folio: <span className="font-mono font-semibold">{pago.id}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
