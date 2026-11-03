import { useState, useEffect, useRef, useId } from 'react'
import { Search, X, Loader2, Stethoscope } from 'lucide-react'
import { cn } from '~/lib/utils'
import { piezasFdi, type DiagnosticoGuardado } from '~/lib/cie10'

// Combobox de diagnósticos CIE-10 con selección múltiple.
//
// Viaja al servidor como un solo campo oculto con JSON, porque es una lista de
// objetos con campos opcionales. La validación que cuenta está en el servidor
// (app/lib/cie10.ts); esto es solo la comodidad de elegirlos.

export type DiagnosticoSeleccionado = {
  cie10_codigo: string
  descripcion: string
  pieza_dental: number | null
  notas: string | null
}

type ResultadoCie10 = { codigo: string; descripcion: string }

/** Pasa los diagnósticos que vienen del loader al formato del selector. */
export function aSeleccionados(guardados: DiagnosticoGuardado[] | null | undefined): DiagnosticoSeleccionado[] {
  return (guardados ?? []).map(d => ({
    cie10_codigo: d.cie10_codigo,
    descripcion: d.cie10_codigos?.descripcion ?? '',
    pieza_dental: d.pieza_dental,
    notas: d.notas,
  }))
}

const PERMANENTES = piezasFdi().filter(p => p < 50)
const TEMPORALES = piezasFdi().filter(p => p >= 50)

export function Cie10Selector({
  name = 'diagnosticos',
  defaultValue = [],
}: {
  name?: string
  defaultValue?: DiagnosticoSeleccionado[]
}) {
  const [seleccionados, setSeleccionados] = useState<DiagnosticoSeleccionado[]>(defaultValue)
  const [q, setQ] = useState('')
  const [resultados, setResultados] = useState<ResultadoCie10[]>([])
  const [abierto, setAbierto] = useState(false)
  const [activo, setActivo] = useState(0)
  const [cargando, setCargando] = useState(false)
  const contenedorRef = useRef<HTMLDivElement>(null)
  const listaId = useId()

  // Búsqueda con espera de 250 ms: no dispara una petición por cada tecla.
  useEffect(() => {
    const termino = q.trim()
    if (termino.length < 2) {
      setResultados([])
      setCargando(false)
      return
    }
    setCargando(true)
    const control = new AbortController()
    const temporizador = window.setTimeout(async () => {
      try {
        const respuesta = await fetch(`/api/cie10?q=${encodeURIComponent(termino)}`, { signal: control.signal })
        const json = await respuesta.json()
        if (control.signal.aborted) return
        setResultados(json.resultados ?? [])
        setActivo(0)
        setCargando(false)
      } catch {
        // petición cancelada o red caída: se deja el listado como estaba
        if (!control.signal.aborted) setCargando(false)
      }
    }, 250)
    return () => {
      window.clearTimeout(temporizador)
      control.abort()
    }
  }, [q])

  // Cerrar el desplegable al hacer clic fuera.
  useEffect(() => {
    if (!abierto) return
    function alHacerClic(e: MouseEvent) {
      if (!contenedorRef.current?.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', alHacerClic)
    return () => document.removeEventListener('mousedown', alHacerClic)
  }, [abierto])

  const yaElegido = (codigo: string) => seleccionados.some(s => s.cie10_codigo === codigo && s.pieza_dental === null)
  const visibles = resultados.filter(r => !yaElegido(r.codigo))

  function agregar(r: ResultadoCie10) {
    setSeleccionados(prev =>
      prev.some(s => s.cie10_codigo === r.codigo && s.pieza_dental === null)
        ? prev
        : [...prev, { cie10_codigo: r.codigo, descripcion: r.descripcion, pieza_dental: null, notas: null }],
    )
    setQ('')
    setResultados([])
    setAbierto(false)
  }

  function quitar(indice: number) {
    setSeleccionados(prev => prev.filter((_, i) => i !== indice))
  }

  function cambiarPieza(indice: number, valor: string) {
    const pieza = valor === '' ? null : Number(valor)
    setSeleccionados(prev => prev.map((s, i) => (i === indice ? { ...s, pieza_dental: pieza } : s)))
  }

  function alTeclear(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setAbierto(true)
      setActivo(i => Math.min(i + 1, visibles.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActivo(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      // no debe enviar el formulario mientras se elige un diagnóstico
      if (abierto && visibles[activo]) {
        e.preventDefault()
        agregar(visibles[activo])
      }
    } else if (e.key === 'Escape') {
      setAbierto(false)
    }
  }

  return (
    <div className="space-y-2">
      {/* lo que de verdad se envía */}
      <input
        type="hidden"
        name={name}
        value={JSON.stringify(
          seleccionados.map(s => ({
            cie10_codigo: s.cie10_codigo,
            pieza_dental: s.pieza_dental,
            notas: s.notas,
          })),
        )}
      />

      <div className="relative" ref={contenedorRef}>
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          role="combobox"
          aria-expanded={abierto}
          aria-controls={listaId}
          aria-autocomplete="list"
          autoComplete="off"
          value={q}
          onChange={e => { setQ(e.target.value); setAbierto(true) }}
          onFocus={() => setAbierto(true)}
          onKeyDown={alTeclear}
          placeholder="Buscar diagnóstico: caries, K02, pulpitis…"
          className="w-full pl-9 pr-9 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {cargando && (
          <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />
        )}

        {abierto && q.trim().length >= 2 && (
          <ul
            id={listaId}
            role="listbox"
            className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg py-1"
          >
            {visibles.length === 0 && !cargando && (
              <li className="px-3 py-3 text-xs text-gray-400">
                Sin resultados. Puedes describirlo en las notas de abajo.
              </li>
            )}
            {visibles.map((r, i) => (
              <li key={r.codigo} role="option" aria-selected={i === activo}>
                <button
                  type="button"
                  onMouseEnter={() => setActivo(i)}
                  onClick={() => agregar(r)}
                  className={cn(
                    'w-full text-left px-3 py-2 text-sm cursor-pointer transition-colors',
                    i === activo ? 'bg-blue-50 text-blue-900' : 'text-gray-700 hover:bg-gray-50',
                  )}
                >
                  <span className="font-semibold">{r.codigo}</span>
                  <span className="text-gray-400"> — </span>
                  {r.descripcion}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {seleccionados.length === 0 ? (
        <p className="text-xs text-gray-400 flex items-center gap-1.5">
          <Stethoscope size={12} />
          Opcional. Si no encuentras el código, escribe las notas más abajo.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {seleccionados.map((s, i) => (
            <li
              key={`${s.cie10_codigo}-${s.pieza_dental ?? 'general'}-${i}`}
              className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-2.5 py-1.5"
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-blue-900 truncate">
                  {s.cie10_codigo}
                  {s.descripcion ? <span className="font-normal text-blue-800"> — {s.descripcion}</span> : null}
                </p>
              </div>
              <select
                value={s.pieza_dental ?? ''}
                onChange={e => cambiarPieza(i, e.target.value)}
                aria-label={`Pieza dental para ${s.cie10_codigo}`}
                className="flex-shrink-0 px-2 py-1 border border-blue-200 rounded-md text-xs text-gray-900 bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Sin pieza</option>
                <optgroup label="Permanentes">
                  {PERMANENTES.map(p => <option key={p} value={p}>{p}</option>)}
                </optgroup>
                <optgroup label="Temporales">
                  {TEMPORALES.map(p => <option key={p} value={p}>{p}</option>)}
                </optgroup>
              </select>
              <button
                type="button"
                onClick={() => quitar(i)}
                aria-label={`Quitar ${s.cie10_codigo}`}
                className="flex-shrink-0 p-1 text-blue-400 hover:text-red-600 rounded cursor-pointer transition-colors"
              >
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
