import { createSupabaseServerClient } from '~/lib/supabase.server'
import { getClinicaId } from '~/lib/clinica.server'

function csvEscape(v: string | number): string {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function loader({ request }: { request: Request }) {
  const { supabase } = createSupabaseServerClient(request)
  const clinicaId = await getClinicaId(request)

  const { data: facturas } = await supabase
    .from('facturas_externas')
    .select('id,total,fecha_vencimiento,clientes_externos(nombre),pagos_externos(monto)')
    .eq('clinica_id', clinicaId)
    .in('estado', ['pendiente', 'parcial'])
    .order('fecha_vencimiento', { ascending: true })

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const headers = ['Cliente', 'Factura', 'Total', 'Pagado', 'Saldo', 'Vencimiento', 'Días vencido']
  const rows = (facturas ?? []).map((f: any) => {
    const pagado = (f.pagos_externos ?? []).reduce((s: number, p: any) => s + Number(p.monto), 0)
    const saldo = Math.max(0, Number(f.total) - pagado)
    const folio = (f.id as string).slice(-8).toUpperCase()
    let diasVencido = 0
    if (f.fecha_vencimiento) {
      const venc = new Date(f.fecha_vencimiento + 'T00:00:00')
      diasVencido = Math.max(0, Math.floor((today.getTime() - venc.getTime()) / 86400000))
    }
    return [
      f.clientes_externos?.nombre ?? '—',
      folio,
      Number(f.total).toFixed(2),
      pagado.toFixed(2),
      saldo.toFixed(2),
      f.fecha_vencimiento ?? '',
      String(diasVencido),
    ]
  })

  const csv = [headers, ...rows].map(row => row.map(csvEscape).join(',')).join('\n')
  const fecha = new Date().toISOString().slice(0, 10)

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="aging-facturas-externas-${fecha}.csv"`,
    },
  })
}
