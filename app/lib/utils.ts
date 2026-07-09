import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Interpret a "YYYY-MM-DDTHH:mm" string as Dominican Republic time (UTC-4, no DST)
export function drLocalToUTC(localStr: string) {
  return new Date(localStr + '-04:00').toISOString()
}