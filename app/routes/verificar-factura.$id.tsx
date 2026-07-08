import type { Route } from "./+types/verificar-factura.$id";
import { createSupabaseAdminClient } from "~/lib/supabase.admin.server";
import { CheckCircle, XCircle, ShieldCheck } from "lucide-react";

// ─── types ────────────────────────────────────────────────────────────────────

type FacturaPublica = {
  id: string;
  periodo_inicio: string;
  periodo_fin: string;
  estado: "pendiente" | "pagada";
  fecha_emision: string;
  clientes_externos: { nombre: string } | null;
};

// ─── meta ─────────────────────────────────────────────────────────────────────

export function meta({ data }: Route.MetaArgs) {
  if (!data?.factura) return [{ title: "Factura no encontrada — Nin Dental Clinic" }];
  const folio = (data.factura as FacturaPublica).id.slice(-8).toUpperCase();
  return [{ title: `Factura #${folio} — Nin Dental Clinic` }];
}

// ─── loader ───────────────────────────────────────────────────────────────────

export async function loader({ params, request }: Route.LoaderArgs) {
  const id = params.id as string;
  const token = new URL(request.url).searchParams.get("token");

  if (!id || !token) return { factura: null };

  try {
    const supabase = createSupabaseAdminClient();
    const { data: factura } = await supabase
      .from("facturas_externas")
      .select("id,periodo_inicio,periodo_fin,estado,fecha_emision,clientes_externos(nombre)")
      .eq("id", id)
      .eq("verification_token", token)
      .single();
    return { factura: factura as unknown as FacturaPublica | null };
  } catch {
    return { factura: null };
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("es-DO", { dateStyle: "long" });
}

// ─── component ────────────────────────────────────────────────────────────────

export default function VerificarFactura({ loaderData }: Route.ComponentProps) {
  const { factura } = loaderData;

  if (!factura) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg overflow-hidden text-center">
          <div className="bg-red-600 px-6 py-8">
            <XCircle size={40} className="text-white mx-auto mb-2" />
            <p className="text-white font-bold text-lg">Factura no encontrada</p>
            <p className="text-red-200 text-sm mt-1">Esta factura no existe o el enlace no es válido</p>
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

  const folio = factura.id.slice(-8).toUpperCase();
  const esPagada = factura.estado === "pagada";

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-gradient-to-br from-blue-800 to-blue-500 px-6 py-7 text-center">
          <div className="w-12 h-12 bg-white/15 rounded-2xl flex items-center justify-center mx-auto mb-3 text-2xl">
            🦷
          </div>
          <p className="text-white font-bold text-lg">Nin Dental Clinic</p>
          <p className="text-blue-200 text-xs mt-0.5">Verificación de factura — trabajos externos</p>
        </div>

        <div className="flex items-center justify-center gap-2 bg-green-50 border-b border-green-100 px-4 py-3">
          <ShieldCheck size={16} className="text-green-600 flex-shrink-0" />
          <p className="text-sm font-semibold text-green-700">Factura auténtica · #{folio}</p>
          <CheckCircle size={14} className="text-green-500 flex-shrink-0" />
        </div>

        <div className="px-6 py-5 text-center border-b border-gray-100">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-1">Estado</p>
          <p className={`text-2xl font-extrabold ${esPagada ? "text-green-600" : "text-amber-600"}`}>
            {esPagada ? "Pagada" : "Pendiente de pago"}
          </p>
        </div>

        <div className="px-6 py-4 space-y-3">
          {factura.clientes_externos && (
            <div>
              <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-0.5">Cliente</p>
              <p className="text-sm font-semibold text-gray-900">{factura.clientes_externos.nombre}</p>
            </div>
          )}
          <div>
            <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-0.5">Período</p>
            <p className="text-sm text-gray-800">{fmtDate(factura.periodo_inicio)} – {fmtDate(factura.periodo_fin)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-0.5">Fecha de emisión</p>
            <p className="text-xs text-gray-700">{fmtDate(factura.fecha_emision)}</p>
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-gray-100 text-center">
          <p className="text-[10px] text-gray-400 leading-relaxed">
            Este documento es una factura emitida por Nin Dental Clinic por trabajos de laboratorio externos.
            <br />Folio: <span className="font-mono font-semibold">{factura.id}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
