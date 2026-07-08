import type { Route } from "./+types/verificar-trabajo.$id";
import { createSupabaseAdminClient } from "~/lib/supabase.admin.server";
import { CheckCircle, XCircle, ShieldCheck } from "lucide-react";

// ─── types ────────────────────────────────────────────────────────────────────

type TrabajoPublico = {
  id: string;
  tipo_trabajo: string;
  estado: "recibido" | "en_proceso" | "terminado" | "entregado";
  fecha_recibido: string;
  fecha_prometida: string | null;
  fecha_entregado: string | null;
  clientes_externos: { nombre: string } | null;
};

// ─── meta ─────────────────────────────────────────────────────────────────────

export function meta({ data }: Route.MetaArgs) {
  if (!data?.trabajo) return [{ title: "Trabajo no encontrado — Nin Dental Clinic" }];
  const folio = (data.trabajo as TrabajoPublico).id.slice(-8).toUpperCase();
  return [{ title: `Trabajo #${folio} — Nin Dental Clinic` }];
}

// ─── loader ───────────────────────────────────────────────────────────────────

export async function loader({ params, request }: Route.LoaderArgs) {
  const id = params.id as string;
  const token = new URL(request.url).searchParams.get("token");

  if (!id || !token) return { trabajo: null };

  try {
    const supabase = createSupabaseAdminClient();
    const { data: trabajo, error } = await supabase
      .from("trabajos_externos")
      .select("id,tipo_trabajo,estado,fecha_recibido,fecha_prometida,fecha_entregado,clientes_externos(nombre)")
      .eq("id", id)
      .eq("verification_token", token)
      .single();
    if (error) console.error("[verificar-trabajo] query error:", error.message, "id:", id);
    return { trabajo: trabajo as unknown as TrabajoPublico | null };
  } catch (e) {
    console.error("[verificar-trabajo] unexpected error:", e instanceof Error ? e.message : e);
    return { trabajo: null };
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("es-DO", { dateStyle: "long" });
}
const estadoMap: Record<string, { label: string; color: string }> = {
  recibido: { label: "Recibido", color: "text-gray-600" },
  en_proceso: { label: "En proceso", color: "text-amber-600" },
  terminado: { label: "Terminado", color: "text-blue-600" },
  entregado: { label: "Entregado", color: "text-green-600" },
};

// ─── component ────────────────────────────────────────────────────────────────

export default function VerificarTrabajo({ loaderData }: Route.ComponentProps) {
  const { trabajo } = loaderData;

  if (!trabajo) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg overflow-hidden text-center">
          <div className="bg-red-600 px-6 py-8">
            <XCircle size={40} className="text-white mx-auto mb-2" />
            <p className="text-white font-bold text-lg">Trabajo no encontrado</p>
            <p className="text-red-200 text-sm mt-1">Este trabajo no existe o el enlace no es válido</p>
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

  const folio = trabajo.id.slice(-8).toUpperCase();
  const estado = estadoMap[trabajo.estado];

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-gradient-to-br from-blue-800 to-blue-500 px-6 py-7 text-center">
          <div className="w-12 h-12 bg-white/15 rounded-2xl flex items-center justify-center mx-auto mb-3 text-2xl">
            🦷
          </div>
          <p className="text-white font-bold text-lg">Nin Dental Clinic</p>
          <p className="text-blue-200 text-xs mt-0.5">Verificación de trabajo externo</p>
        </div>

        <div className="flex items-center justify-center gap-2 bg-green-50 border-b border-green-100 px-4 py-3">
          <ShieldCheck size={16} className="text-green-600 flex-shrink-0" />
          <p className="text-sm font-semibold text-green-700">Ficha auténtica · #{folio}</p>
          <CheckCircle size={14} className="text-green-500 flex-shrink-0" />
        </div>

        <div className="px-6 py-5 text-center border-b border-gray-100">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-1">Estado</p>
          <p className={`text-2xl font-extrabold ${estado.color}`}>{estado.label}</p>
        </div>

        <div className="px-6 py-4 space-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-0.5">Tipo de trabajo</p>
            <p className="text-sm font-semibold text-gray-900">{trabajo.tipo_trabajo}</p>
          </div>
          {trabajo.clientes_externos && (
            <div>
              <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-0.5">Cliente</p>
              <p className="text-sm text-gray-800">{trabajo.clientes_externos.nombre}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-0.5">Recibido</p>
              <p className="text-xs text-gray-700">{fmtDate(trabajo.fecha_recibido)}</p>
            </div>
            {trabajo.fecha_entregado && (
              <div>
                <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-0.5">Entregado</p>
                <p className="text-xs text-gray-700">{fmtDate(trabajo.fecha_entregado)}</p>
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-gray-100 text-center">
          <p className="text-[10px] text-gray-400 leading-relaxed">
            Este documento es una ficha de trabajo emitida por Nin Dental Clinic.
            <br />Folio: <span className="font-mono font-semibold">{trabajo.id}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
