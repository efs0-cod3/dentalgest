import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Interpret a "YYYY-MM-DDTHH:mm" string as Dominican Republic time (UTC-4, no DST)
export function drLocalToUTC(localStr: string) {
  return new Date(localStr + '-04:00').toISOString()
}

// Inverse of drLocalToUTC: UTC ISO → "YYYY-MM-DDTHH:mm" in DR local time
const DR_OFFSET_MS = -4 * 60 * 60 * 1000
export function utcToDrLocal(iso: string) {
  const d = new Date(new Date(iso).getTime() + DR_OFFSET_MS)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

// Monedas soportadas por la app
export type Moneda = 'DOP' | 'USD'
export const MONEDAS: Moneda[] = ['DOP', 'USD']
export const MONEDA_LABEL: Record<Moneda, string> = {
  DOP: 'Peso dominicano (RD$)',
  USD: 'Dólar estadounidense (US$)',
}

// Formatea un monto en la moneda indicada (DOP por defecto para retrocompatibilidad).
// Ambas se muestran con locale dominicano para mantener separadores consistentes.
export function fmtMoney(n: number, moneda: Moneda = 'DOP') {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: moneda }).format(n)
}

// Convierte un monto entre monedas usando la tasa RD$ por 1 US$.
// Devuelve null si falta la tasa (no se puede convertir de forma fiable).
export function convertirMoneda(
  monto: number,
  de: Moneda,
  a: Moneda,
  tasaUsd: number | null | undefined,
): number | null {
  if (de === a) return monto
  if (!tasaUsd || tasaUsd <= 0) return null
  if (de === 'USD' && a === 'DOP') return monto * tasaUsd
  if (de === 'DOP' && a === 'USD') return monto / tasaUsd
  return null
}

export function calcularEdad(fechaNacimientoISO: string) {
  const hoy = new Date()
  const nac = new Date(fechaNacimientoISO)
  let edad = hoy.getFullYear() - nac.getFullYear()
  const aunNoCumple = hoy.getMonth() < nac.getMonth() || (hoy.getMonth() === nac.getMonth() && hoy.getDate() < nac.getDate())
  if (aunNoCumple) edad--
  return edad
}