import { useState } from 'react'
import { Link, useFetcher } from 'react-router'
import { Bell, Check } from 'lucide-react'
import { cn } from '~/lib/utils'
import { abrirWhatsapp } from './WhatsappEnviar'

export type Reserva = {
  id: string
  fecha_hora: string
  nombre: string | null
  telefono: string | null
}

function fmtCita(iso: string) {
  return new Date(iso).toLocaleString('es-DO', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

export function NotificationBell({ reservas, clinicaNombre }: { reservas: Reserva[]; clinicaNombre: string }) {
  const [open, setOpen] = useState(false)
  const fetcher = useFetcher()
  const count = reservas.length

  // aceptar = pasar la cita a 'confirmada' (reutiliza la acción de Citas) y, si
  // hay teléfono, abrir WhatsApp con el aviso al paciente
  function confirmarYAvisar(r: Reserva) {
    const fd = new FormData()
    fd.append('intent', 'cambiar_estado')
    fd.append('id', r.id)
    fd.append('estado', 'confirmada')
    fetcher.submit(fd, { method: 'post', action: '/dashboard/citas' })
    if (r.telefono) {
      const msg =
        `Hola${r.nombre ? ' ' + r.nombre : ''}, le saluda ${clinicaNombre}. ` +
        `Su cita para el ${fmtCita(r.fecha_hora)} ha sido confirmada. ¡Le esperamos! ` +
        `Si necesita reprogramar, escríbanos por aquí.`
      abrirWhatsapp(r.telefono, msg)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title="Notificaciones"
        className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <Bell size={20} />
        {count > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-xl border border-gray-200 shadow-lg z-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900">Notificaciones</p>
              {count > 0 && (
                <span className="text-xs text-gray-400">{count} pendiente{count === 1 ? '' : 's'}</span>
              )}
            </div>
            <div className="max-h-[70vh] overflow-y-auto">
              {count === 0 ? (
                <p className="px-4 py-8 text-sm text-gray-400 text-center">Sin novedades por ahora.</p>
              ) : (
                reservas.map(r => (
                  <div key={r.id} className="px-4 py-3 border-b border-gray-50 last:border-0">
                    <span className="inline-block px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-medium mb-1">
                      Reserva en línea
                    </span>
                    <p className="text-sm font-medium text-gray-900">{r.nombre ?? 'Paciente'}</p>
                    <p className="text-xs text-gray-500 capitalize">{fmtCita(r.fecha_hora)}</p>
                    <div className="flex gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => confirmarYAvisar(r)}
                        disabled={fetcher.state !== 'idle'}
                        className="flex items-center gap-1 px-2.5 py-1 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                      >
                        <Check size={12} /> {r.telefono ? 'Confirmar y avisar' : 'Confirmar'}
                      </button>
                      <Link
                        to="/dashboard/citas"
                        onClick={() => setOpen(false)}
                        className={cn('px-2.5 py-1 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors')}
                      >
                        Ver en agenda
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
