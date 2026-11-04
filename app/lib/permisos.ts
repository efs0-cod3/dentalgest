// Permisos por rol: definición única que usan tanto la navegación como los
// guardas de cada ruta en el servidor. Ocultar en el menú no basta —el guarda
// del loader es lo que realmente impide entrar escribiendo la URL.

export const ROLES = ['propietario', 'admin', 'recepcionista', 'doctor', 'laboratorio'] as const
export type Rol = (typeof ROLES)[number]

export type Seccion =
  | 'inicio'
  | 'citas'
  | 'consultas'
  | 'pacientes'
  | 'caja'
  | 'cotizaciones'
  | 'laboratorio'
  | 'trabajos-externos'
  | 'configuracion'
  | 'apariencia'

// Qué secciones puede abrir cada rol.
//  - propietario/admin: todo (admin además atiende como doctor).
//  - recepcionista: la operación diaria completa —agenda, pacientes, caja,
//    cotizaciones, laboratorio y trabajos— salvo configuración.
//  - doctor: lo clínico que le corresponde (ver filtroPropio).
//  - laboratorio: solo órdenes de laboratorio y trabajos externos.
const ACCESO: Record<Rol, Seccion[]> = {
  propietario: ['inicio', 'citas', 'consultas', 'pacientes', 'caja', 'cotizaciones', 'laboratorio', 'trabajos-externos', 'configuracion', 'apariencia'],
  admin: ['inicio', 'citas', 'consultas', 'pacientes', 'caja', 'cotizaciones', 'laboratorio', 'trabajos-externos', 'configuracion', 'apariencia'],
  recepcionista: ['inicio', 'citas', 'consultas', 'pacientes', 'caja', 'cotizaciones', 'laboratorio', 'trabajos-externos', 'apariencia'],
  doctor: ['inicio', 'citas', 'consultas', 'pacientes', 'laboratorio', 'apariencia'],
  laboratorio: ['laboratorio', 'trabajos-externos', 'apariencia'],
}

export function esRol(valor: string | null | undefined): valor is Rol {
  return !!valor && (ROLES as readonly string[]).includes(valor)
}

// secciones que el rol puede abrir, en orden — usado por la bienvenida
export function seccionesDe(rol: string | null | undefined): Seccion[] {
  return esRol(rol) ? ACCESO[rol] : []
}

// cómo se le explica cada sección a alguien que entra por primera vez
export const SECCION_INFO: Record<Seccion, { label: string; desc: string }> = {
  inicio: { label: 'Inicio', desc: 'Resumen del día: citas, ingresos y próximas citas.' },
  citas: { label: 'Citas', desc: 'La agenda: crear, confirmar y dar seguimiento a las citas.' },
  consultas: { label: 'Histórico de consultas', desc: 'Registro clínico de lo realizado en cada consulta.' },
  pacientes: { label: 'Pacientes', desc: 'Fichas con datos, expediente, documentos y odontograma.' },
  caja: { label: 'Caja', desc: 'Cobros y gastos, cuentas por cobrar y recibos.' },
  cotizaciones: { label: 'Cotizaciones', desc: 'Presupuestos para el paciente, imprimibles y con vigencia.' },
  laboratorio: { label: 'Laboratorio', desc: 'Órdenes enviadas al laboratorio y su estado de entrega.' },
  'trabajos-externos': { label: 'Trabajos externos', desc: 'Trabajos recibidos de otras clínicas o doctores.' },
  configuracion: { label: 'Configuración', desc: 'Datos de la clínica, equipo, doctores, tratamientos y agenda.' },
  // Para los roles sin acceso a Configuración completa, esta entrada les abre
  // su propia página: contraseña, datos de doctor y tema.
  apariencia: { label: 'Mi cuenta', desc: 'Tu contraseña, tus datos y el tema claro u oscuro.' },
}

// nota extra según el rol, para dejar claro el alcance de su acceso
export const ROL_NOTA: Record<Rol, string> = {
  propietario: 'Tienes acceso completo, incluida la configuración de la clínica.',
  admin: 'Tienes acceso completo, incluida la configuración de la clínica.',
  recepcionista: 'Tienes acceso a toda la operación diaria. La configuración de la clínica queda reservada a propietario y admin.',
  doctor: 'Verás únicamente tus citas, tus pacientes y tus órdenes de laboratorio.',
  laboratorio: 'Verás las órdenes de laboratorio y los trabajos externos, sin los importes.',
}

export function puedeVer(rol: string | null | undefined, seccion: Seccion): boolean {
  if (!esRol(rol)) return false
  return ACCESO[rol].includes(seccion)
}

// Primera sección disponible para el rol: a dónde mandar a quien no tiene
// acceso al inicio (p. ej. laboratorio entra directo a su bandeja).
export function seccionInicial(rol: string | null | undefined): Seccion {
  if (!esRol(rol)) return 'inicio'
  return ACCESO[rol][0] ?? 'inicio'
}

export const RUTA_SECCION: Record<Seccion, string> = {
  inicio: '/dashboard',
  citas: '/dashboard/citas',
  consultas: '/dashboard/consultas',
  pacientes: '/dashboard/pacientes',
  caja: '/dashboard/caja',
  cotizaciones: '/dashboard/cotizaciones',
  laboratorio: '/dashboard/laboratorio',
  'trabajos-externos': '/dashboard/trabajos-externos',
  configuracion: '/dashboard/configuracion',
  apariencia: '/dashboard/configuracion',
}

// El rol doctor solo ve lo suyo (sus citas, sus consultas, sus pacientes).
export function filtroPropio(rol: string | null | undefined): boolean {
  return rol === 'doctor'
}

// ─── recetas ──────────────────────────────────────────────────────────────────

// Roles que pueden ejercer como doctor. En esta clínica el admin también
// atiende, así que la puerta no es el nombre del rol: lo que de verdad habilita
// emitir una receta es estar ligado a un registro de doctor y tener exequátur
// (ver puedeEmitirReceta). Recepción y laboratorio nunca.
const ROLES_CLINICOS: readonly string[] = ['propietario', 'admin', 'doctor']

export function rolPuedeSerDoctor(rol: string | null | undefined): boolean {
  return !!rol && ROLES_CLINICOS.includes(rol)
}

/**
 * Quién puede emitir una receta. Las tres condiciones son necesarias:
 * un rol clínico, una cuenta ligada a un registro de doctor, y exequátur
 * cargado —que es el requisito legal—.
 *
 * Esto mismo se comprueba otra vez en emitir_prescripcion() dentro de la base,
 * para que no dependa solo del código de la app.
 */
export function puedeEmitirReceta(
  rol: string | null | undefined,
  doctorId: string | null | undefined,
  exequatur: string | null | undefined,
): boolean {
  return rolPuedeSerDoctor(rol) && !!doctorId && (exequatur ?? '').trim().length > 0
}

/** Motivo por el que no puede emitir, para decírselo en pantalla. */
export function motivoNoPuedeEmitir(
  rol: string | null | undefined,
  doctorId: string | null | undefined,
  exequatur: string | null | undefined,
): string | null {
  if (!rolPuedeSerDoctor(rol)) return 'Tu rol no permite emitir recetas.'
  if (!doctorId) return 'Tu cuenta no está ligada a un doctor. Pide que la vinculen en Configuración → Equipo.'
  if ((exequatur ?? '').trim().length === 0) {
    return 'Carga tu número de exequátur en Configuración → Mi perfil para poder emitir recetas.'
  }
  return null
}

/** Anular: el doctor que la emitió, o propietario / admin de la clínica. */
export function puedeAnularReceta(
  rol: string | null | undefined,
  doctorId: string | null | undefined,
  doctorEmisorId: string,
): boolean {
  if (rol === 'propietario' || rol === 'admin') return true
  return !!doctorId && doctorId === doctorEmisorId
}

// El rol laboratorio no ve importes: ni precios de trabajos ni facturación.
export function ocultaCostos(rol: string | null | undefined): boolean {
  return rol === 'laboratorio'
}
