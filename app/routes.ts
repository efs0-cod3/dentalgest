import { type RouteConfig, index, route, layout } from '@react-router/dev/routes'

export default [
  index('routes/home.tsx'),
  route('login', 'routes/login.tsx'),
  route('logout', 'routes/logout.tsx'),
  route('api/send-recibo', 'routes/api.send-recibo.ts'),
  route('api/export-datos', 'routes/api.export-datos.ts'),
  route('verificar/:id', 'routes/verificar.$id.tsx'),
  layout('routes/dashboard/layout.tsx', [
    route('dashboard', 'routes/dashboard/index.tsx'),
    route('dashboard/citas', 'routes/dashboard/citas.tsx'),
    route('dashboard/pacientes', 'routes/dashboard/pacientes.tsx'),
    route('dashboard/caja', 'routes/dashboard/caja.tsx'),
    route('dashboard/cotizaciones', 'routes/dashboard/cotizaciones.tsx'),
    route('dashboard/laboratorio', 'routes/dashboard/laboratorio.tsx'),
    route('dashboard/configuracion', 'routes/dashboard/configuracion.tsx'),
    route('dashboard/odontograma/:id', 'routes/dashboard/odontograma.$id.tsx'),
  ]),
] satisfies RouteConfig
