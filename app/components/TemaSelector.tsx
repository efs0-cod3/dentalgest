import { useEffect, useState } from 'react'
import { Sun, Moon, Monitor } from 'lucide-react'
import { cn } from '~/lib/utils'

export type Tema = 'claro' | 'oscuro' | 'sistema'

const OPCIONES: { valor: Tema; label: string; Icon: any }[] = [
  { valor: 'claro', label: 'Claro', Icon: Sun },
  { valor: 'oscuro', label: 'Oscuro', Icon: Moon },
  { valor: 'sistema', label: 'Sistema', Icon: Monitor },
]

// Traduce la preferencia a la marca que lee el CSS (data-theme en <html>)
function aplicar(tema: Tema) {
  const oscuro =
    tema === 'oscuro' ||
    (tema === 'sistema' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.setAttribute('data-theme', oscuro ? 'dark' : 'light')
}

export function TemaSelector({ compacto = false }: { compacto?: boolean }) {
  // se arranca en 'sistema' y se corrige tras montar: durante el render del
  // servidor no hay localStorage y un valor distinto rompería la hidratación
  const [tema, setTema] = useState<Tema>('sistema')

  useEffect(() => {
    const guardado = (localStorage.getItem('tema') as Tema | null) ?? 'sistema'
    setTema(guardado)
  }, [])

  // con 'sistema', seguir los cambios del dispositivo en vivo
  useEffect(() => {
    if (tema !== 'sistema') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const alCambiar = () => aplicar('sistema')
    mq.addEventListener('change', alCambiar)
    return () => mq.removeEventListener('change', alCambiar)
  }, [tema])

  function elegir(valor: Tema) {
    setTema(valor)
    localStorage.setItem('tema', valor)
    aplicar(valor)
  }

  if (compacto) {
    // en el menú colapsado: un solo botón que alterna claro/oscuro
    const siguiente: Tema = tema === 'oscuro' ? 'claro' : 'oscuro'
    const Icon = tema === 'oscuro' ? Sun : Moon
    return (
      <button
        type="button"
        onClick={() => elegir(siguiente)}
        title={tema === 'oscuro' ? 'Tema claro' : 'Tema oscuro'}
        className="flex items-center justify-center w-full px-0 py-2 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors cursor-pointer"
      >
        <Icon size={16} />
      </button>
    )
  }

  return (
    <div className="flex gap-1 bg-gray-100 rounded-lg p-1" role="group" aria-label="Tema">
      {OPCIONES.map(({ valor, label, Icon }) => (
        <button
          key={valor}
          type="button"
          onClick={() => elegir(valor)}
          aria-pressed={tema === valor}
          title={label}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer',
            tema === valor
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700',
          )}
        >
          <Icon size={13} />
          <span className="hidden lg:inline">{label}</span>
        </button>
      ))}
    </div>
  )
}
