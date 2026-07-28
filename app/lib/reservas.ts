// Cálculo de horarios libres para la reserva pública. Todo en hora local de
// la clínica (RD, UTC-4). Sin dependencias de red: recibe las citas ya cargadas.

export type CitaOcupada = { fecha_hora: string; duracion_min: number; estado: string }

export type ConfigAgenda = {
  inicio: string // 'HH:MM'
  fin: string // 'HH:MM'
  duracionDefault: number
  diasLaborables: number[] // 0=domingo … 6=sábado
  simultaneas: boolean
}

const DR_OFFSET_MS = -4 * 60 * 60 * 1000

export function minutosDe(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

export function minutosAHora(min: number): string {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`
}

// día de la semana (0-6) de una fecha 'YYYY-MM-DD' interpretada en hora local RD
export function diaSemanaLocal(fecha: string): number {
  return new Date(fecha + 'T12:00:00-04:00').getUTCDay()
}

export function esDiaLaborable(fecha: string, dias: number[]): boolean {
  return dias.includes(diaSemanaLocal(fecha))
}

// convierte una cita (UTC ISO) a minutos locales del día indicado, o null si
// no cae en ese día
function citaEnMinutosLocales(iso: string, fecha: string): number | null {
  const d = new Date(new Date(iso).getTime() + DR_OFFSET_MS)
  const fechaLocal = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  if (fechaLocal !== fecha) return null
  return d.getUTCHours() * 60 + d.getUTCMinutes()
}

/**
 * Devuelve las horas de inicio ('HH:MM') libres para una fecha dada, en pasos
 * del tamaño de la duración solicitada. Un espacio está libre si el bloque
 * [inicio, inicio+duración) cabe en el horario y no se solapa con una cita
 * activa (salvo que la clínica permita citas simultáneas). Excluye horas ya
 * pasadas si la fecha es hoy.
 */
export function horariosLibres(
  fecha: string,
  duracion: number,
  config: ConfigAgenda,
  citas: CitaOcupada[],
  ahora: Date = new Date(),
): string[] {
  if (!esDiaLaborable(fecha, config.diasLaborables)) return []

  const apertura = minutosDe(config.inicio)
  const cierre = minutosDe(config.fin)
  const dur = duracion > 0 ? duracion : config.duracionDefault

  // ocupaciones del día (citas no canceladas)
  const ocupadas = config.simultaneas
    ? []
    : citas
        .filter(c => c.estado !== 'cancelada')
        .map(c => {
          const ini = citaEnMinutosLocales(c.fecha_hora, fecha)
          return ini == null ? null : { ini, fin: ini + (c.duracion_min || config.duracionDefault) }
        })
        .filter((x): x is { ini: number; fin: number } => x !== null)

  // minutos locales de "ahora" si la fecha es hoy
  const hoyLocal = (() => {
    const d = new Date(ahora.getTime() + DR_OFFSET_MS)
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  })()
  const minAhora = (() => {
    const d = new Date(ahora.getTime() + DR_OFFSET_MS)
    return d.getUTCHours() * 60 + d.getUTCMinutes()
  })()

  const libres: string[] = []
  for (let ini = apertura; ini + dur <= cierre; ini += dur) {
    if (fecha === hoyLocal && ini <= minAhora) continue
    const chocan = ocupadas.some(o => ini < o.fin && o.ini < ini + dur)
    if (!chocan) libres.push(minutosAHora(ini))
  }
  return libres
}
