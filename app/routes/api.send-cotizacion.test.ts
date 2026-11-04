import { describe, it, expect, vi, beforeEach } from 'vitest'

// Pruebas del envío de cotizaciones por correo. Lo que importa aquí:
//  - no se envía nada sin correo ni sin cotización
//  - la consulta queda acotada a la clínica de la sesión (aislamiento)
//  - el HTML que viaja no lleva los botones de Imprimir/Cerrar
//  - un fallo del proveedor se devuelve como error, no como éxito

const estado = vi.hoisted(() => ({
  sesion: { clinicaId: 'clinica-1', rol: 'propietario', doctorId: null, userId: 'u1' },
  cotizacion: null as any,
  filtros: [] as Array<[string, string]>,
  enviados: [] as Array<{ to: string; subject: string; html: string; opts: any }>,
  fallaEnvio: false,
}))

function crearSupabase() {
  function from(tabla: string) {
    const resultado =
      tabla === 'cotizaciones'
        ? { data: estado.cotizacion, error: null }
        : tabla === 'clinicas'
          ? { data: { nombre: 'Nin Dental Clinic', email: 'clinica@ejemplo.com' }, error: null }
          : { data: null, error: null }

    const cadena: any = {
      select: () => cadena,
      eq: (col: string, val: string) => {
        if (tabla === 'cotizaciones') estado.filtros.push([col, val])
        return cadena
      },
      maybeSingle: () => Promise.resolve(resultado),
      single: () => Promise.resolve(resultado),
    }
    return cadena
  }
  return { from }
}

vi.mock('~/lib/supabase.server', () => ({
  createSupabaseServerClient: () => ({ supabase: crearSupabase(), headers: new Headers() }),
}))

vi.mock('~/lib/clinica.server', () => ({
  requireSeccion: async () => estado.sesion,
}))

vi.mock('~/lib/email.server', () => ({
  sendReciboEmail: async (to: string, subject: string, html: string, opts: any) => {
    if (estado.fallaEnvio) throw new Error('Resend rechazó el envío')
    estado.enviados.push({ to, subject, html, opts })
    return { data: { id: 'email-1' }, error: null }
  },
}))

const { action } = await import('./api.send-cotizacion')

const COTIZACION = {
  id: '99999999-9999-4999-8999-999999999abc',
  titulo: 'Plan de ortodoncia',
  doctor: 'Dr. Francisco Nin',
  fecha: '2026-01-10',
  fecha_vencimiento: '2026-01-30',
  notas: null,
  monto_total: 45000,
  monto_congelamiento: null,
  fecha_congelamiento: null,
  moneda: 'DOP',
  tasa_cambio: null,
  pacientes: { nombre: 'Ana Pérez', email: 'ana@ejemplo.com', telefono: '809' },
  cotizacion_items: [
    { descripcion: 'Brackets metálicos', cantidad: 1, precio_unitario: 45000, precio_total: 45000 },
  ],
}

function peticion(campos: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.append(k, v)
  return {
    request: new Request('https://www.dentigest.com/api/send-cotizacion', { method: 'POST', body: fd }),
  } as any
}

beforeEach(() => {
  estado.cotizacion = COTIZACION
  estado.filtros = []
  estado.enviados = []
  estado.fallaEnvio = false
})

describe('enviar cotización por correo', () => {
  it('rechaza sin correo', async () => {
    const r = await action(peticion({ cotizacion_id: COTIZACION.id }))
    expect(await r.json()).toMatchObject({ ok: false })
    expect(estado.enviados).toHaveLength(0)
  })

  it('rechaza sin cotización', async () => {
    const r = await action(peticion({ email: 'ana@ejemplo.com' }))
    expect(await r.json()).toMatchObject({ ok: false })
    expect(estado.enviados).toHaveLength(0)
  })

  it('no envía una cotización que no está', async () => {
    estado.cotizacion = null
    const r = await action(peticion({ cotizacion_id: COTIZACION.id, email: 'ana@ejemplo.com' }))
    expect(await r.json()).toMatchObject({ ok: false })
    expect(estado.enviados).toHaveLength(0)
  })

  it('acota la búsqueda a la clínica de la sesión', async () => {
    await action(peticion({ cotizacion_id: COTIZACION.id, email: 'ana@ejemplo.com' }))
    expect(estado.filtros).toEqual(
      expect.arrayContaining([
        ['id', COTIZACION.id],
        ['clinica_id', 'clinica-1'],
      ]),
    )
  })

  it('envía el documento sin los botones de imprimir', async () => {
    const r = await action(peticion({ cotizacion_id: COTIZACION.id, email: 'ana@ejemplo.com' }))
    expect(await r.json()).toMatchObject({ ok: true, emailSent: true })

    const enviado = estado.enviados[0]
    expect(enviado.to).toBe('ana@ejemplo.com')
    expect(enviado.subject).toContain('Plan de ortodoncia')
    expect(enviado.html).not.toContain('window.print()')
    expect(enviado.html).not.toContain('window.close()')
    // y sí lleva el contenido de la cotización
    expect(enviado.html).toContain('Brackets metálicos')
    expect(enviado.html).toContain('Ana Pérez')
    expect(enviado.opts).toMatchObject({
      fromName: 'Nin Dental Clinic',
      replyTo: 'clinica@ejemplo.com',
    })
  })

  it('usa el folio como asunto cuando no hay título', async () => {
    estado.cotizacion = { ...COTIZACION, titulo: null }
    await action(peticion({ cotizacion_id: COTIZACION.id, email: 'ana@ejemplo.com' }))
    expect(estado.enviados[0].subject).toBe('Cotización #99999ABC')
  })

  it('devuelve el error cuando el proveedor falla', async () => {
    estado.fallaEnvio = true
    const r = await action(peticion({ cotizacion_id: COTIZACION.id, email: 'ana@ejemplo.com' }))
    expect(await r.json()).toMatchObject({ ok: false, error: 'Resend rechazó el envío' })
  })
})
