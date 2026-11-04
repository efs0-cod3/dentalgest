import { describe, it, expect } from 'vitest'
import {
  MAX_ITEMS_RECETA,
  MAX_LARGO_CAMPO,
  MAX_LARGO_INDICACIONES_GENERALES,
  itemRecetaSchema,
  itemsRecetaSchema,
  recetaSchema,
  motivoAnulacionSchema,
  parsearItems,
  parsearReceta,
  folioReceta,
  lineaMedicamento,
  esTamanoPapel,
  normalizarTamanoPapel,
} from './prescripciones'
import {
  puedeEmitirReceta,
  motivoNoPuedeEmitir,
  puedeAnularReceta,
  rolPuedeSerDoctor,
} from './permisos'

const PACIENTE = '11111111-1111-4111-8111-111111111111'
const CONSULTA = '22222222-2222-4222-8222-222222222222'

const itemValido = {
  medicamento: 'Amoxicilina',
  presentacion: 'Cápsulas 500 mg',
  dosis: '1 cápsula',
  via: 'Oral',
  frecuencia: 'Cada 8 horas',
  duracion: '7 días',
  cantidad: '21 cápsulas',
  indicaciones: 'Tomar después de comer',
}

function formulario(campos: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.append(k, v)
  return fd
}

describe('medicamento de la receta', () => {
  it('acepta uno completo y recorta espacios', () => {
    const r = itemRecetaSchema.safeParse({ ...itemValido, medicamento: '  Amoxicilina  ' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.medicamento).toBe('Amoxicilina')
  })

  it('acepta el mínimo: medicamento, dosis y frecuencia', () => {
    const r = itemRecetaSchema.safeParse({ medicamento: 'Ibuprofeno', dosis: '1 tableta', frecuencia: 'Cada 8 horas' })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.presentacion).toBeUndefined()
      expect(r.data.via).toBeUndefined()
    }
  })

  it('exige el nombre del medicamento', () => {
    for (const medicamento of ['', '   ', undefined]) {
      expect(itemRecetaSchema.safeParse({ ...itemValido, medicamento }).success, String(medicamento)).toBe(false)
    }
  })

  it('exige dosis y frecuencia', () => {
    expect(itemRecetaSchema.safeParse({ ...itemValido, dosis: '  ' }).success).toBe(false)
    expect(itemRecetaSchema.safeParse({ ...itemValido, frecuencia: '' }).success).toBe(false)
  })

  it('rechaza textos demasiado largos', () => {
    const largo = 'x'.repeat(MAX_LARGO_CAMPO + 1)
    expect(itemRecetaSchema.safeParse({ ...itemValido, medicamento: largo }).success).toBe(false)
    expect(itemRecetaSchema.safeParse({ ...itemValido, presentacion: largo }).success).toBe(false)
  })
})

describe('lista de medicamentos', () => {
  it('no acepta una receta sin medicamentos', () => {
    const r = itemsRecetaSchema.safeParse([])
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0]?.message).toContain('al menos un medicamento')
  })

  it('no acepta más del tope', () => {
    const muchos = Array.from({ length: MAX_ITEMS_RECETA + 1 }, () => itemValido)
    expect(itemsRecetaSchema.safeParse(muchos).success).toBe(false)
  })

  it('acepta justo el tope', () => {
    const tope = Array.from({ length: MAX_ITEMS_RECETA }, () => itemValido)
    expect(itemsRecetaSchema.safeParse(tope).success).toBe(true)
  })
})

describe('receta completa', () => {
  it('acepta una receta con paciente, consulta y un medicamento', () => {
    const r = recetaSchema.safeParse({
      paciente_id: PACIENTE,
      consulta_id: CONSULTA,
      indicaciones_generales: 'Reposo 24 horas',
      items: [itemValido],
    })
    expect(r.success).toBe(true)
  })

  it('acepta una receta sin consulta vinculada', () => {
    const r = recetaSchema.safeParse({ paciente_id: PACIENTE, consulta_id: '', items: [itemValido] })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.consulta_id).toBeUndefined()
  })

  it('exige un paciente válido', () => {
    expect(recetaSchema.safeParse({ paciente_id: '', items: [itemValido] }).success).toBe(false)
    expect(recetaSchema.safeParse({ paciente_id: 'no-es-uuid', items: [itemValido] }).success).toBe(false)
  })

  it('rechaza indicaciones generales demasiado largas', () => {
    const r = recetaSchema.safeParse({
      paciente_id: PACIENTE,
      indicaciones_generales: 'x'.repeat(MAX_LARGO_INDICACIONES_GENERALES + 1),
      items: [itemValido],
    })
    expect(r.success).toBe(false)
  })
})

describe('leer del formulario', () => {
  it('lee una receta válida', () => {
    const r = parsearReceta(formulario({
      paciente_id: PACIENTE,
      consulta_id: CONSULTA,
      indicaciones_generales: 'Reposo',
      items: JSON.stringify([itemValido]),
    }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.receta.items).toHaveLength(1)
  })

  it('rechaza el formulario sin medicamentos', () => {
    const r = parsearReceta(formulario({ paciente_id: PACIENTE, items: '[]' }))
    expect(r.ok).toBe(false)
  })

  it('rechaza el campo de medicamentos ausente', () => {
    expect(parsearItems(null).ok).toBe(false)
    expect(parsearItems('').ok).toBe(false)
  })

  it('rechaza JSON mal formado', () => {
    expect(parsearItems('{no es json').ok).toBe(false)
  })
})

describe('motivo de anulación', () => {
  it('exige un motivo con contenido', () => {
    for (const motivo of ['', '  ', 'ab', undefined]) {
      expect(motivoAnulacionSchema.safeParse(motivo).success, String(motivo)).toBe(false)
    }
  })

  it('acepta un motivo explicado', () => {
    expect(motivoAnulacionSchema.safeParse('Dosis equivocada, se emite otra').success).toBe(true)
  })
})

describe('permisos para emitir', () => {
  const CON_EXEQUATUR = '12345-6'
  const DOCTOR = 'doctor-1'

  it('deja emitir al doctor ligado y con exequátur', () => {
    expect(puedeEmitirReceta('doctor', DOCTOR, CON_EXEQUATUR)).toBe(true)
  })

  it('deja emitir al admin y al propietario que también atienden', () => {
    expect(puedeEmitirReceta('admin', DOCTOR, CON_EXEQUATUR)).toBe(true)
    expect(puedeEmitirReceta('propietario', DOCTOR, CON_EXEQUATUR)).toBe(true)
  })

  it('no deja emitir a recepción ni a laboratorio, aunque tengan exequátur', () => {
    expect(puedeEmitirReceta('recepcionista', DOCTOR, CON_EXEQUATUR)).toBe(false)
    expect(puedeEmitirReceta('laboratorio', DOCTOR, CON_EXEQUATUR)).toBe(false)
    expect(rolPuedeSerDoctor('recepcionista')).toBe(false)
  })

  it('no deja emitir sin exequátur', () => {
    expect(puedeEmitirReceta('doctor', DOCTOR, null)).toBe(false)
    expect(puedeEmitirReceta('doctor', DOCTOR, '   ')).toBe(false)
    expect(motivoNoPuedeEmitir('doctor', DOCTOR, '')).toContain('exequátur')
  })

  it('no deja emitir si la cuenta no está ligada a un doctor', () => {
    expect(puedeEmitirReceta('admin', null, CON_EXEQUATUR)).toBe(false)
    expect(motivoNoPuedeEmitir('admin', null, CON_EXEQUATUR)).toContain('no está ligada')
  })

  it('no deja emitir a un rol desconocido', () => {
    expect(puedeEmitirReceta('cualquiera', DOCTOR, CON_EXEQUATUR)).toBe(false)
    expect(puedeEmitirReceta(null, DOCTOR, CON_EXEQUATUR)).toBe(false)
  })
})

describe('permisos para anular', () => {
  it('el doctor que la emitió puede anularla', () => {
    expect(puedeAnularReceta('doctor', 'doctor-1', 'doctor-1')).toBe(true)
  })

  it('otro doctor no puede anular la de un colega', () => {
    expect(puedeAnularReceta('doctor', 'doctor-2', 'doctor-1')).toBe(false)
  })

  it('propietario y admin pueden anular cualquiera de su clínica', () => {
    expect(puedeAnularReceta('propietario', null, 'doctor-1')).toBe(true)
    expect(puedeAnularReceta('admin', 'doctor-9', 'doctor-1')).toBe(true)
  })

  it('recepción no puede anular', () => {
    expect(puedeAnularReceta('recepcionista', null, 'doctor-1')).toBe(false)
  })
})

describe('presentación', () => {
  it('arma el folio con ceros a la izquierda', () => {
    expect(folioReceta(7)).toBe('#0007')
    expect(folioReceta(1234)).toBe('#1234')
    expect(folioReceta(12345)).toBe('#12345')
  })

  it('arma la línea del medicamento sin dejar separadores sueltos', () => {
    expect(lineaMedicamento(itemValido))
      .toBe('Amoxicilina — Cápsulas 500 mg · 1 cápsula · Oral · Cada 8 horas · 7 días')
  })

  it('omite lo que falta', () => {
    expect(lineaMedicamento({ medicamento: 'Ibuprofeno', dosis: '1 tableta', frecuencia: 'Cada 8 horas' }))
      .toBe('Ibuprofeno · 1 tableta · Cada 8 horas')
  })

  it('reconoce los tamaños de papel', () => {
    expect(esTamanoPapel('a5')).toBe(true)
    expect(esTamanoPapel('carta')).toBe(true)
    expect(esTamanoPapel('a4')).toBe(false)
    expect(esTamanoPapel(null)).toBe(false)
    // ya no es un tamaño: es el nombre viejo, y lo traduce normalizar
    expect(esTamanoPapel('media-carta')).toBe(false)
  })

  it('normaliza el tamaño con A5 por defecto', () => {
    expect(normalizarTamanoPapel('a5')).toBe('a5')
    expect(normalizarTamanoPapel('carta')).toBe('carta')
    expect(normalizarTamanoPapel(null)).toBe('a5')
    expect(normalizarTamanoPapel('cualquier-cosa')).toBe('a5')
  })

  it('un enlace viejo con media-carta sigue abriendo, en A5', () => {
    // si esto se rompe, una pestaña guardada acaba imprimiendo en carta
    expect(normalizarTamanoPapel('media-carta')).toBe('a5')
  })
})
