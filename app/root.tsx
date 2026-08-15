import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from 'react-router'
import type { Route } from './+types/root'
import './app.css'

// Aplica el tema guardado antes del primer pintado, para que no se vea el
// destello claro al cargar. 'sistema' sigue la preferencia del dispositivo.
const TEMA_INIT = `(function(){try{
var t=localStorage.getItem('tema')||'sistema';
var oscuro=t==='oscuro'||(t==='sistema'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
document.documentElement.setAttribute('data-theme',oscuro?'dark':'light');
}catch(e){}})()`

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        <script dangerouslySetInnerHTML={{ __html: TEMA_INIT }} />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

export default function App() {
  return <Outlet />
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = 'Error'
  let details = 'Ocurrió un error inesperado.'

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? '404' : 'Error'
    details = error.status === 404 ? 'Página no encontrada.' : error.statusText || details
  } else if (import.meta.env.DEV && error instanceof Error) {
    details = error.message
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-2">{message}</h1>
        <p className="text-gray-600">{details}</p>
      </div>
    </main>
  )
}
