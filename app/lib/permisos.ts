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

// Qué secciones puede abrir cada rol.
//  - propietario/admin: todo (admin además atiende como doctor).
//  - recepcionista: la operación diaria completa —agenda, pacientes, caja,
//    cotizaciones, laboratorio y trabajos— salvo configuración.
//  - doctor: lo clínico que le corresponde (ver filtroPropio).
//  - laboratorio: solo órdenes de laboratorio y trabajos externos.
const ACCESO: Record<Rol, Seccion[]> = {
  propietario: ['inicio', 'citas', 'consultas', 'pacientes', 'caja', 'cotizaciones', 'laboratorio', 'trabajos-externos', 'configuracion'],
  admin: ['inicio', 'citas', 'consultas', 'pacientes', 'caja', 'cotizaciones', 'laboratorio', 'trabajos-externos', 'configuracion'],
  recepcionista: ['inicio', 'citas', 'consultas', 'pacientes', 'caja', 'cotizaciones', 'laboratorio', 'trabajos-externos'],
  doctor: ['inicio', 'citas', 'consultas', 'pacientes', 'laboratorio'],
  laboratorio: ['laboratorio', 'trabajos-externos'],
}

export function esRol(valor: string | null | undefined): valor is Rol {
  return !!valor && (ROLES as readonly string[]).includes(valor)
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
}

// El rol doctor solo ve lo suyo (sus citas, sus consultas, sus pacientes).
export function filtroPropio(rol: string | null | undefined): boolean {
  return rol === 'doctor'
}

// El rol laboratorio no ve importes: ni precios de trabajos ni facturación.
export function ocultaCostos(rol: string | null | undefined): boolean {
  return rol === 'laboratorio'
}
