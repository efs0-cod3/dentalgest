import { useState, useEffect } from 'react'
import { useFetcher, useRevalidator } from 'react-router'
import { Plus, X, Trash2, ArrowUp, ArrowDown, AlertTriangle, Printer } from 'lucide-react'
import { cn } from '~/lib/utils'
import { VIAS, MAX_ITEMS_RECETA } from '~/lib/prescripciones'

// Formulario para emitir una receta. Las filas de medicamentos se agregan,
// quitan y reordenan en el cliente y viajan como un campo oculto con JSON; la
// validación que cuenta está en el servidor.

type Fila = {
  medicamento: string
  presentacion: string
  dosis: string
  via: string
  frecuencia: string
  duracion: string
  cantidad: string
  indicaciones: string
}

const FILA_VACIA: Fila = {
  medicamento: '', presentacion: '', dosis: '', via: 'Oral',
  frecuencia: '', duracion: '', cantidad: '', indicaciones: '',
}

const campoClase =
  'w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'

export function RecetaFormModal({
  pacienteId,
  pacienteNombre,
  consultaId,
  onClose,
}: {
  pacienteId: string
  pacienteNombre: string
  consultaId?: string | null
  onClose: () => void
}) {
  const fetcher = useFetcher<{ ok: boolean; id?: string; error?: string }>()
  const revalidator = useRevalidator()
  const [filas, setFilas] = useState<Fila[]>([{ ...FILA_VACIA }])
  const [generales, setGenerales] = useState('')
  const enviando = fetcher.state !== 'idle'

  // Al emitir: abrir la vista de impresión y cerrar. La receta ya no se puede
  // editar, así que no hay nada que dejar abierto.
  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.ok && fetcher.data.id) {
      window.open(`/recetas/${fetcher.data.id}/imprimir?auto=1`, '_blank', 'noopener')
      revalidator.revalidate()
      onClose()
    }
  }, [fetcher.state, fetcher.data])

  function cambiar(i: number, campo: keyof Fila, valor: string) {
    setFilas(prev => prev.map((f, j) => (j === i ? { ...f, [campo]: valor } : f)))
  }

  function mover(i: number, delta: number) {
    const destino = i + delta
    if (destino < 0 || destino >= filas.length) return
    setFilas(prev => {
      const copia = [...prev]
      ;[copia[i], copia[destino]] = [copia[destino], copia[i]]
      return copia
    })
  }

  function emitir() {
    const items = filas
      .filter(f => f.medicamento.trim() !== '')
      .map(f => ({
        medicamento: f.medicamento,
        presentacion: f.presentacion,
        dosis: f.dosis,
        via: f.via,
        frecuencia: f.frecuencia,
        duracion: f.duracion,
        cantidad: f.cantidad,
        indicaciones: f.indicaciones,
      }))

    fetcher.submit(
      {
        intent: 'emitir',
        paciente_id: pacienteId,
        consulta_id: consultaId ?? '',
        indicaciones_generales: generales,
        items: JSON.stringify(items),
      },
      { method: 'post', action: '/api/recetas' },
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[90vh]">
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="font-semibold text-gray-900">Nueva receta</h2>
            <p className="text-xs text-gray-500 mt-0.5">{pacienteNombre}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
            <span>
              Una vez emitida, la receta <b>no se puede editar ni borrar</b>: solo anular indicando el motivo.
            </span>
          </div>

          {filas.map((fila, i) => (
            <div key={i} className="border border-gray-200 rounded-xl p-3 space-y-2 bg-gray-50">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500">Medicamento {i + 1}</span>
                <div className="flex items-center gap-0.5">
                  <button type="button" onClick={() => mover(i, -1)} disabled={i === 0}
                    aria-label="Subir" title="Subir"
                    className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 cursor-pointer disabled:cursor-default">
                    <ArrowUp size={13} />
                  </button>
                  <button type="button" onClick={() => mover(i, 1)} disabled={i === filas.length - 1}
                    aria-label="Bajar" title="Bajar"
                    className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 cursor-pointer disabled:cursor-default">
                    <ArrowDown size={13} />
                  </button>
                  <button type="button" onClick={() => setFilas(prev => prev.filter((_, j) => j !== i))}
                    disabled={filas.length === 1} aria-label="Quitar" title="Quitar"
                    className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-30 cursor-pointer disabled:cursor-default">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="sm:col-span-2">
                  <label className="block text-xs text-gray-500 mb-0.5">
                    Medicamento <span className="text-red-500">*</span>
                  </label>
                  <input type="text" value={fila.medicamento} placeholder="Nombre genérico, ej. Amoxicilina"
                    onChange={e => cambiar(i, 'medicamento', e.target.value)} className={campoClase} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Presentación</label>
                  <input type="text" value={fila.presentacion} placeholder="Cápsulas 500 mg"
                    onChange={e => cambiar(i, 'presentacion', e.target.value)} className={campoClase} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">
                    Dosis <span className="text-red-500">*</span>
                  </label>
                  <input type="text" value={fila.dosis} placeholder="1 cápsula"
                    onChange={e => cambiar(i, 'dosis', e.target.value)} className={campoClase} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Vía</label>
                  <select value={fila.via} onChange={e => cambiar(i, 'via', e.target.value)}
                    className={cn(campoClase, 'cursor-pointer')}>
                    <option value="">—</option>
                    {VIAS.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">
                    Frecuencia <span className="text-red-500">*</span>
                  </label>
                  <input type="text" value={fila.frecuencia} placeholder="Cada 8 horas"
                    onChange={e => cambiar(i, 'frecuencia', e.target.value)} className={campoClase} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Duración</label>
                  <input type="text" value={fila.duracion} placeholder="7 días"
                    onChange={e => cambiar(i, 'duracion', e.target.value)} className={campoClase} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Cantidad a despachar</label>
                  <input type="text" value={fila.cantidad} placeholder="21 cápsulas"
                    onChange={e => cambiar(i, 'cantidad', e.target.value)} className={campoClase} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-gray-500 mb-0.5">Indicaciones</label>
                  <input type="text" value={fila.indicaciones} placeholder="Tomar después de comer"
                    onChange={e => cambiar(i, 'indicaciones', e.target.value)} className={campoClase} />
                </div>
              </div>
            </div>
          ))}

          <button type="button" onClick={() => setFilas(prev => [...prev, { ...FILA_VACIA }])}
            disabled={filas.length >= MAX_ITEMS_RECETA}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50 disabled:opacity-40 cursor-pointer disabled:cursor-default transition-colors">
            <Plus size={13} /> Agregar medicamento
          </button>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Indicaciones generales</label>
            <textarea rows={2} value={generales} onChange={e => setGenerales(e.target.value)}
              placeholder="Reposo 24 horas, abundante líquido…"
              className={cn(campoClase, 'resize-none')} />
          </div>

          <p className="text-xs text-gray-400 border-t border-gray-100 pt-3">
            Esta receta no sirve para sustancias controladas: esas requieren el recetario oficial
            correspondiente.
          </p>

          {fetcher.data?.ok === false && fetcher.data.error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {fetcher.data.error}
            </p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 flex-shrink-0">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors">
            Cancelar
          </button>
          <button type="button" onClick={emitir} disabled={enviando}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 cursor-pointer disabled:cursor-default transition-colors">
            <Printer size={14} />
            {enviando ? 'Emitiendo…' : 'Emitir e imprimir'}
          </button>
        </div>
      </div>
    </div>
  )
}
