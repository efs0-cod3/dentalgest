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

// Moneda única de la app: peso dominicano con formato dominicano
export function fmtMoney(n: number) {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(n)
}

export function calcularEdad(fechaNacimientoISO: string) {
  const hoy = new Date()
  const nac = new Date(fechaNacimientoISO)
  let edad = hoy.getFullYear() - nac.getFullYear()
  const aunNoCumple = hoy.getMonth() < nac.getMonth() || (hoy.getMonth() === nac.getMonth() && hoy.getDate() < nac.getDate())
  if (aunNoCumple) edad--
  return edad
}