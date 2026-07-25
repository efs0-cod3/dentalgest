import { useState } from 'react'
import { MessageCircle, Send } from 'lucide-react'
import { cn } from '~/lib/utils'

// Normaliza a formato internacional para wa.me: solo dígitos; a los números
// locales de 10 dígitos (RD) se les antepone el código de país 1.
export function telefonoWa(telefono: string) {
  const digits = telefono.replace(/\D/g, '')
  return digits.length === 10 ? `1${digits}` : digits
}

export function abrirWhatsapp(telefono: string, mensaje: string) {
  window.open(`https://wa.me/${telefonoWa(telefono)}?text=${encodeURIComponent(mensaje)}`, '_blank')
}

/**
 * Botón + panel para enviar un documento por WhatsApp: abre el chat con el
 * mensaje y el enlace verificable listos, y solo falta pulsar enviar.
 * No usa la API de WhatsApp Business (envío manual, sin configuración).
 */
export function WhatsappEnviar({
  telefono,
  mensaje,
  etiqueta = 'WhatsApp',
  ayuda = 'Se abre WhatsApp con el mensaje y el enlace listos — solo pulsa enviar.',
  className,
}: {
  telefono: string | null
  mensaje: string
  etiqueta?: string
  ayuda?: string
  className?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [numero, setNumero] = useState(telefono ?? '')

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(v => !v)}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors',
          abierto
            ? 'bg-green-600 text-white border-green-600'
            : 'text-gray-600 border-gray-200 hover:bg-gray-50',
          className,
        )}
      >
        <MessageCircle size={13} /> {etiqueta}
      </button>

      {abierto && (
        <div className="w-full mt-2 rounded-xl border border-green-100 bg-green-50 p-3 space-y-2">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Teléfono (WhatsApp)
              {telefono && <span className="ml-1 text-green-500 font-normal">(del cliente)</span>}
            </label>
            <input
              type="tel"
              value={numero}
              onChange={e => setNumero(e.target.value)}
              placeholder="809 555 1234"
              autoFocus
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <button
            type="button"
            onClick={() => abrirWhatsapp(numero, mensaje)}
            disabled={telefonoWa(numero).length < 10}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            <Send size={13} /> Abrir WhatsApp
          </button>
          <p className="text-xs text-gray-500">{ayuda}</p>
        </div>
      )}
    </>
  )
}
