import { describe, it, expect, afterEach, vi } from 'vitest'
import { drDateKey, drDiasHasta, drDateKeyMas } from './utils'

// La clínica está en República Dominicana (UTC−4, sin horario de verano) y el
// servidor corre en UTC. Entre las 8:00 PM y la medianoche de RD el servidor ya
// está en el día siguiente, así que cualquier "hoy" calculado con
// new Date().toISOString() sale corrido un día.
//
// Esto se midió contra el código real antes de arreglarlo: a las 10:00 PM del
// 12 de noviembre, el formulario de Caja proponía 2026-11-13 y la cotización
// que vencía ese mismo día ya salía "vencida" en el servidor y "activa" en el
// navegador. Estas pruebas fijan que no vuelva a pasar.

// 12 de noviembre de 2026, 10:00 PM en RD = 13 de noviembre, 02:00 UTC
const NOCHE_RD = new Date('2026-11-13T02:00:00Z')
// 12 de noviembre, 3:00 PM en RD: misma fecha en las dos zonas
const TARDE_RD = new Date('2026-11-12T19:00:00Z')

function congelarReloj(instante: Date) {
  vi.useFakeTimers()
  vi.setSystemTime(instante)
}

afterEach(() => {
  vi.useRealTimers()
})

describe('el día dominicano no se adelanta de noche', () => {
  it('a las 10 PM de RD sigue siendo el mismo día', () => {
    congelarReloj(NOCHE_RD)
    // la trampa: en UTC ya es el 13
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-11-13')
    // lo correcto, que es lo que ve quien está en la clínica
    expect(drDateKey()).toBe('2026-11-12')
  })

  it('de día coinciden, que es lo que despista', () => {
    congelarReloj(TARDE_RD)
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-11-12')
    expect(drDateKey()).toBe('2026-11-12')
  })
})

describe('días hasta una fecha', () => {
  it('una cotización que vence hoy no está vencida a las 10 PM', () => {
    congelarReloj(NOCHE_RD)
    expect(drDiasHasta('2026-11-12')).toBe(0)
    expect('2026-11-12' < drDateKey()).toBe(false)
  })

  it('cuenta hacia delante y hacia atrás', () => {
    congelarReloj(NOCHE_RD)
    expect(drDiasHasta('2026-11-13')).toBe(1)
    expect(drDiasHasta('2026-11-22')).toBe(10)
    expect(drDiasHasta('2026-11-11')).toBe(-1)
  })

  it('tolera que le pasen un timestamp completo', () => {
    congelarReloj(NOCHE_RD)
    expect(drDiasHasta('2026-11-14T18:30:00Z')).toBe(2)
  })
})

describe('sumar días', () => {
  it('los 20 días de vigencia de una cotización salen del día dominicano', () => {
    congelarReloj(NOCHE_RD)
    // con toISOString() habría dado 2026-12-03, un día de más
    expect(drDateKeyMas(20)).toBe('2026-12-02')
  })

  it('cruza el fin de mes', () => {
    congelarReloj(new Date('2026-12-01T02:00:00Z')) // 30 de noviembre, 10 PM en RD
    expect(drDateKey()).toBe('2026-11-30')
    expect(drDateKeyMas(1)).toBe('2026-12-01')
    expect(drDateKeyMas(30)).toBe('2026-12-30')
  })

  it('cero días es hoy', () => {
    congelarReloj(NOCHE_RD)
    expect(drDateKeyMas(0)).toBe(drDateKey())
  })
})

describe('un instante guardado se lee en el día dominicano', () => {
  it('un pago de las 10 PM pertenece a ese día, no al siguiente', () => {
    // pagos.fecha es timestamptz: el instante guardado cae en el 13 en UTC
    expect(drDateKey('2026-11-13T02:00:00Z')).toBe('2026-11-12')
  })
})
