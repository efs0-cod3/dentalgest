import { useEffect, useState } from 'react'
import { TAMANOS_PAPEL, type TamanoPapel } from '~/lib/prescripciones'
import { CLAVE_DESPLAZAMIENTO, MEDIDAS } from '~/lib/hoja-impresa'

// Los controles comunes de las hojas impresas: imprimir, tamaño de papel y
// modo sin membrete. Los comparten la receta y la orden de laboratorio para
// que se manejen igual en las dos.

/**
 * Cuánto bajar el contenido en modo sin membrete, para que caiga debajo del
 * membrete ya impreso del papel.
 *
 * Depende de cada talonario y de cada impresora, no del código, así que se
 * ajusta en pantalla y se recuerda en el navegador.
 */
export function useDesplazamiento(inicial = 1.9) {
  const [desplazamiento, setDesplazamiento] = useState(inicial)

  useEffect(() => {
    // se lee después de montar para no romper la hidratación
    try {
      const guardado = localStorage.getItem(CLAVE_DESPLAZAMIENTO)
      if (guardado !== null && Number.isFinite(Number(guardado))) setDesplazamiento(Number(guardado))
    } catch { /* navegador sin almacenamiento: se queda el valor por defecto */ }
  }, [])

  function cambiar(valor: number) {
    const limitado = Math.min(6, Math.max(0, Number(valor.toFixed(2))))
    setDesplazamiento(limitado)
    try { localStorage.setItem(CLAVE_DESPLAZAMIENTO, String(limitado)) } catch { /* ídem */ }
  }

  return { desplazamiento, cambiarDesplazamiento: cambiar }
}

export function BarraImpresion({
  papel,
  conMembrete,
  desplazamiento,
  onDesplazamiento,
}: {
  papel: TamanoPapel
  conMembrete: boolean
  desplazamiento: number
  onDesplazamiento: (valor: number) => void
}) {
  return (
    <div className="barra no-print">
      <button type="button" className="primario" onClick={() => window.print()}>Imprimir</button>
      {TAMANOS_PAPEL.map(t => (
        <a key={t} href={`?papel=${t}${conMembrete ? '' : '&membrete=0'}`}
          className={t === papel ? 'actual' : undefined}>
          {MEDIDAS[t].etiqueta}
        </a>
      ))}
      <a href={`?papel=${papel}${conMembrete ? '&membrete=0' : ''}`}
        className={conMembrete ? undefined : 'actual'}>
        {conMembrete ? 'Sin membrete' : 'Con membrete'}
      </a>
      {!conMembrete && (
        <label style={{ fontSize: '.72rem', color: '#4b5563', display: 'flex', alignItems: 'center', gap: '.35rem' }}>
          Bajar
          <input
            type="number" step="0.1" min="0" max="6" value={desplazamiento}
            onChange={e => onDesplazamiento(Number(e.target.value))}
            style={{ width: '4.2rem', padding: '.35rem .4rem', border: '1px solid #d1d5db', borderRadius: '.4rem', fontSize: '.75rem' }}
          />
          pulgadas
        </label>
      )}
    </div>
  )
}

export function AvisoMembrete({ papel }: { papel: string }) {
  return (
    <p className="aviso-membrete no-print">
      Modo sin membrete: sale solo lo que cambia en cada hoja, para imprimir sobre el
      papel con membrete de la clínica. Haz una prueba en una hoja en blanco y ponla a
      contraluz sobre el papel para cuadrar el «bajar». Tamaño: {papel}.
    </p>
  )
}
