import { useState, useCallback } from 'react'
import { cn } from '~/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export type Condicion =
  | 'sano' | 'caries' | 'restaurado' | 'corona' | 'ausente'
  | 'implante' | 'sellante' | 'endodoncia' | 'fractura' | 'extraccion_indicada'

export type Sup = 'v' | 'm' | 'd' | 'p' | 'o'

export type DienteData = {
  v: Condicion; m: Condicion; d: Condicion; p: Condicion; o: Condicion
}

export type OdontogramaData = Record<string, DienteData>

// ─── Conditions palette ───────────────────────────────────────────────────────

type CondDef = { id: Condicion; label: string; fill: string; stroke: string; text: string }

const CONDS: CondDef[] = [
  { id: 'sano',                label: 'Sano',           fill: '#FFFFFF', stroke: '#D1D5DB', text: '#374151' },
  { id: 'caries',              label: 'Caries',         fill: '#EF4444', stroke: '#DC2626', text: '#FFFFFF' },
  { id: 'restaurado',          label: 'Restaurado',     fill: '#3B82F6', stroke: '#2563EB', text: '#FFFFFF' },
  { id: 'corona',              label: 'Corona',         fill: '#F59E0B', stroke: '#D97706', text: '#FFFFFF' },
  { id: 'sellante',            label: 'Sellante',       fill: '#BAE6FD', stroke: '#7DD3FC', text: '#1E3A5F' },
  { id: 'endodoncia',          label: 'Endodoncia',     fill: '#A855F7', stroke: '#9333EA', text: '#FFFFFF' },
  { id: 'fractura',            label: 'Fractura',       fill: '#F97316', stroke: '#EA580C', text: '#FFFFFF' },
  { id: 'ausente',             label: 'Ausente',        fill: '#E5E7EB', stroke: '#9CA3AF', text: '#374151' },
  { id: 'implante',            label: 'Implante',       fill: '#10B981', stroke: '#059669', text: '#FFFFFF' },
  { id: 'extraccion_indicada', label: 'Extrac. ind.',   fill: '#FCA5A5', stroke: '#F87171', text: '#7F1D1D' },
]

function condFill(c: Condicion) { return CONDS.find(x => x.id === c)?.fill ?? '#FFFFFF' }
function condStroke(c: Condicion) { return CONDS.find(x => x.id === c)?.stroke ?? '#D1D5DB' }

// ─── FDI layout (patient's right = viewer's left) ─────────────────────────────
// Upper: Q1 (18→11) then Q2 (21→28)
// Lower: Q4 (48→41) then Q3 (31→38)

const UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28]
const LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38]

// ─── SVG constants ────────────────────────────────────────────────────────────

const S = 48      // tooth size
const IN = 11     // inset for center zone
const STEP = S + 4
const CGAP = 16   // center (midline) gap
const LH = 15     // label height

function tx(i: number) { return i * STEP + (i >= 8 ? CGAP : 0) }

const VW = tx(15) + S       // total svg width
const VH = LH + S + 28 + S + LH  // total svg height

const emptyDiente = (): DienteData => ({ v: 'sano', m: 'sano', d: 'sano', p: 'sano', o: 'sano' })

// ─── Tooth SVG element ────────────────────────────────────────────────────────

type ToothProps = {
  id: string
  data: DienteData
  x: number
  y: number
  labelTop: boolean
  readOnly: boolean
  onSurface: (id: string, sup: Sup) => void
  active: boolean
}

function Tooth({ id, data, x, y, labelTop, readOnly, onSurface, active }: ToothProps) {
  const absent = data.v === 'ausente' && data.o === 'ausente'
  const cur = readOnly ? 'default' : 'crosshair'

  return (
    <g transform={`translate(${x},${y})`} style={{ cursor: cur }}>
      {/* Number label */}
      <text
        x={S / 2} y={labelTop ? -3 : S + 11}
        textAnchor="middle" fontSize={9} fontFamily="monospace"
        fill={active ? '#2563EB' : '#9CA3AF'}
        fontWeight={active ? '700' : '400'}
      >{id}</text>

      {/* Vestibular — top triangle */}
      <polygon
        points={`0,0 ${S},0 ${S - IN},${IN} ${IN},${IN}`}
        fill={absent ? '#F9FAFB' : condFill(data.v)}
        stroke={condStroke(data.v)} strokeWidth={0.4}
        onClick={() => !readOnly && onSurface(id, 'v')}
      />
      {/* Palatino/Lingual — bottom triangle */}
      <polygon
        points={`${IN},${S - IN} ${S - IN},${S - IN} ${S},${S} 0,${S}`}
        fill={absent ? '#F9FAFB' : condFill(data.p)}
        stroke={condStroke(data.p)} strokeWidth={0.4}
        onClick={() => !readOnly && onSurface(id, 'p')}
      />
      {/* Mesial — left triangle */}
      <polygon
        points={`0,0 ${IN},${IN} ${IN},${S - IN} 0,${S}`}
        fill={absent ? '#F9FAFB' : condFill(data.m)}
        stroke={condStroke(data.m)} strokeWidth={0.4}
        onClick={() => !readOnly && onSurface(id, 'm')}
      />
      {/* Distal — right triangle */}
      <polygon
        points={`${S},0 ${S - IN},${IN} ${S - IN},${S - IN} ${S},${S}`}
        fill={absent ? '#F9FAFB' : condFill(data.d)}
        stroke={condStroke(data.d)} strokeWidth={0.4}
        onClick={() => !readOnly && onSurface(id, 'd')}
      />
      {/* Oclusal/Incisal — center */}
      <rect
        x={IN} y={IN} width={S - 2 * IN} height={S - 2 * IN}
        fill={absent ? '#E5E7EB' : condFill(data.o)}
        stroke={condStroke(data.o)} strokeWidth={0.4}
        onClick={() => !readOnly && onSurface(id, 'o')}
      />

      {/* Outer border */}
      <rect x={0} y={0} width={S} height={S} rx={1.5}
        fill="none"
        stroke={active ? '#2563EB' : '#C4C9D4'}
        strokeWidth={active ? 1.5 : 0.5}
        style={{ pointerEvents: 'none' }}
      />

      {/* Absent X overlay */}
      {absent && (
        <g style={{ pointerEvents: 'none' }}>
          <line x1={5} y1={5} x2={S - 5} y2={S - 5} stroke="#9CA3AF" strokeWidth={1.5} />
          <line x1={S - 5} y1={5} x2={5} y2={S - 5} stroke="#9CA3AF" strokeWidth={1.5} />
        </g>
      )}
    </g>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export type OdontogramaProps = {
  value: OdontogramaData
  onChange?: (data: OdontogramaData) => void
  readOnly?: boolean
}

export function Odontograma({ value, onChange, readOnly = false }: OdontogramaProps) {
  const [brush, setBrush] = useState<Condicion>('caries')
  const [lastId, setLastId] = useState<string | null>(null)

  const get = (id: string): DienteData => value[id] ?? emptyDiente()

  const handleSurface = useCallback((toothId: string, sup: Sup) => {
    if (!onChange) return
    const cur = get(toothId)
    // Whole-tooth conditions fill every surface at once
    const wholeTooth = brush === 'ausente' || brush === 'corona' || brush === 'implante' || brush === 'extraccion_indicada'
    const next: DienteData = wholeTooth
      ? { v: brush, m: brush, d: brush, p: brush, o: brush }
      : { ...cur, [sup]: brush }
    onChange({ ...value, [toothId]: next })
    setLastId(toothId)
  }, [brush, value, onChange])

  const upperY = LH
  const lowerY = LH + S + 28

  return (
    <div className="space-y-3">
      {/* Brush selector */}
      {!readOnly && (
        <div className="flex flex-wrap gap-1.5 px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-200">
          <span className="text-[11px] font-semibold text-gray-400 self-center mr-1 shrink-0">Pintar:</span>
          {CONDS.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => setBrush(c.id)}
              className={cn(
                'px-2.5 py-0.5 rounded-lg text-[11px] font-medium border transition-all whitespace-nowrap',
                brush === c.id
                  ? 'ring-2 ring-blue-500 ring-offset-1 shadow-sm scale-105'
                  : 'opacity-75 hover:opacity-100 hover:shadow-sm'
              )}
              style={{ backgroundColor: c.fill, borderColor: c.stroke, color: c.text }}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {/* SVG odontogram */}
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-6">
        <svg
          viewBox={`-2 -${LH + 6} ${VW + 4} ${VH + 36}`}
          width="100%"
          style={{ display: 'block' }}
        >
          {/* SUPERIOR label */}
          <text x={VW / 2} y={-LH - 1} textAnchor="middle" fontSize={8.5} fill="#C4C9D4" fontWeight="600" letterSpacing="1.5">
            SUPERIOR
          </text>

          {/* Vertical midline */}
          <line
            x1={tx(8) - CGAP / 2} y1={upperY - 6}
            x2={tx(8) - CGAP / 2} y2={lowerY + S + 6}
            stroke="#E5E7EB" strokeWidth={0.8} strokeDasharray="3 2"
          />
          {/* D / I labels at midline */}
          <text x={tx(8) - CGAP / 2 - 4} y={upperY + S / 2 + 3} textAnchor="end" fontSize={7} fill="#D1D5DB" fontWeight="600">D</text>
          <text x={tx(8) - CGAP / 2 + 4} y={upperY + S / 2 + 3} textAnchor="start" fontSize={7} fill="#D1D5DB" fontWeight="600">I</text>

          {/* Upper arch */}
          {UPPER.map((n, i) => (
            <Tooth key={n} id={String(n)} data={get(String(n))}
              x={tx(i)} y={upperY} labelTop={true}
              readOnly={readOnly} onSurface={handleSurface} active={lastId === String(n)} />
          ))}

          {/* Lower arch */}
          {LOWER.map((n, i) => (
            <Tooth key={n} id={String(n)} data={get(String(n))}
              x={tx(i)} y={lowerY} labelTop={false}
              readOnly={readOnly} onSurface={handleSurface} active={lastId === String(n)} />
          ))}

          {/* INFERIOR label */}
          <text x={VW / 2} y={lowerY + S + LH + 2} textAnchor="middle" fontSize={8.5} fill="#C4C9D4" fontWeight="600" letterSpacing="1.5">
            INFERIOR
          </text>
        </svg>
      </div>

      {/* Surfaces legend */}
      <div className="flex flex-wrap items-center gap-2 px-1">
        <span className="text-xs font-semibold text-gray-500 shrink-0">Superficies:</span>
        {[['V', 'Vestibular'], ['P', 'Palatino/Lingual'], ['M', 'Mesial'], ['D', 'Distal'], ['O', 'Oclusal/Incisal']].map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1 bg-gray-100 border border-gray-200 rounded-md px-2 py-0.5 text-xs text-gray-700">
            <strong className="font-bold text-gray-900">{k}</strong>
            <span className="text-gray-500">·</span>
            {v}
          </span>
        ))}
      </div>

      {/* Conditions legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1.5 px-1">
        {CONDS.map(c => (
          <div key={c.id} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm border shrink-0"
              style={{ backgroundColor: c.fill, borderColor: c.stroke }} />
            <span className="text-[11px] text-gray-500">{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
