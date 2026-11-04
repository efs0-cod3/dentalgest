import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import type { Route } from './+types/recetas.$id.imprimir'
import { createSupabaseServerClient } from '~/lib/supabase.server'
import { getSesion } from '~/lib/clinica.server'
import { firmarImagen } from '~/lib/prescripciones.server'
import { folioReceta, normalizarTamanoPapel, TAMANOS_PAPEL, type SnapshotReceta, type TamanoPapel } from '~/lib/prescripciones'

// Vista de impresión de una receta.
//
// Va fuera del layout del dashboard a propósito: así no se imprime el menú.
//
// Todo el contenido sale del `snapshot` guardado al emitir, nunca de los datos
// actuales: si el doctor cambia su exequátur o la clínica cambia de sello, esta
// receta se sigue imprimiendo como salió.
//
// El CSS es propio y con colores fijos en vez de Tailwind, porque los tokens
// del tema oscuro invertirían la hoja impresa.

type ItemImpreso = {
  orden: number
  medicamento: string
  presentacion: string | null
  dosis: string
  via: string | null
  frecuencia: string | null
  duracion: string | null
  cantidad: string | null
  indicaciones: string | null
}

type RecetaImpresa = {
  id: string
  verification_token: string
  numero: number
  fecha: string
  estado: string
  motivo_anulacion: string | null
  indicaciones_generales: string | null
  snapshot: SnapshotReceta
  prescripcion_items: ItemImpreso[]
}

// `size` va al @page; `ancho`/`alto` solo dibujan la vista previa en pantalla.
const MEDIDAS: Record<TamanoPapel, { size: string; ancho: string; alto: string; etiqueta: string }> = {
  'media-carta': { size: '5.5in 8.5in', ancho: '5.5in', alto: '8.5in', etiqueta: 'Media carta · 5.5 × 8.5 in' },
  a5: { size: 'A5', ancho: '148mm', alto: '210mm', etiqueta: 'A5 · 148 × 210 mm' },
  carta: { size: '8.5in 11in', ancho: '8.5in', alto: '11in', etiqueta: 'Carta · 8.5 × 11 in' },
}

export function meta({ data }: Route.MetaArgs): Route.MetaDescriptors {
  const receta = data?.receta as RecetaImpresa | null | undefined
  if (!receta) return [{ title: 'Receta no encontrada' }]
  return [{ title: `Receta ${folioReceta(receta.numero)} — ${receta.snapshot.paciente.nombre}` }]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request)
  // cualquiera de la clínica puede reimprimir; la RLS hace el filtro real
  const { clinicaId } = await getSesion(request)

  const url = new URL(request.url)
  const papel: TamanoPapel = normalizarTamanoPapel(url.searchParams.get('papel'))
  const autoImprimir = url.searchParams.get('auto') === '1'
  // ?membrete=0 → para imprimir encima del talonario ya impreso de la clínica
  const conMembrete = url.searchParams.get('membrete') !== '0'

  const { data } = await supabase
    .from('prescripciones')
    .select(`
      id, verification_token, numero, fecha, estado, motivo_anulacion, indicaciones_generales, snapshot,
      prescripcion_items(orden, medicamento, presentacion, dosis, via, frecuencia, duracion, cantidad, indicaciones)
    `)
    .eq('id', params.id as string)
    .eq('clinica_id', clinicaId)
    .maybeSingle()

  if (!data) return { receta: null, firmaUrl: null, selloUrl: null, logoUrl: null, qrDataUrl: null, papel, autoImprimir, conMembrete }

  const receta = data as unknown as RecetaImpresa
  receta.prescripcion_items = [...(receta.prescripcion_items ?? [])].sort((a, b) => a.orden - b.orden)

  // las imágenes son privadas: se firman aquí, en el servidor, y por poco tiempo
  const [firmaUrl, selloUrl, logoUrl] = await Promise.all([
    firmarImagen(supabase as any, receta.snapshot?.doctor?.firma_path),
    firmarImagen(supabase as any, receta.snapshot?.clinica?.sello_path),
    firmarImagen(supabase as any, receta.snapshot?.clinica?.logo_path),
  ])

  const verificationUrl = new URL(`/verificar-receta/${receta.id}?token=${receta.verification_token}`, request.url).toString()
  const qrDataUrl = await QRCode.toDataURL(verificationUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 240,
    color: { dark: '#111827', light: '#ffffff' },
  })

  return { receta, firmaUrl, selloUrl, logoUrl, qrDataUrl, papel, autoImprimir, conMembrete }
}

function fmtFecha(iso: string) {
  // la fecha es un `date`, así que se parte a mano para no corrernos un día
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString('es-DO', { dateStyle: 'long' })
}

const CLAVE_DESPLAZAMIENTO = 'recetaDesplazamientoIn'

export default function RecetaImprimir({ loaderData }: Route.ComponentProps) {
  const { receta, firmaUrl, selloUrl, logoUrl, qrDataUrl, papel, autoImprimir, conMembrete } = loaderData

  // Cuánto bajar el contenido para que caiga debajo del membrete ya impreso
  // del talonario. Es cosa de cada impresora y de cada talonario, así que se
  // ajusta aquí y se recuerda; no tiene sentido fijarlo en el código.
  const [desplazamiento, setDesplazamiento] = useState(1.9)
  useEffect(() => {
    // se lee después de montar para no romper la hidratación
    try {
      const guardado = localStorage.getItem(CLAVE_DESPLAZAMIENTO)
      if (guardado !== null && Number.isFinite(Number(guardado))) setDesplazamiento(Number(guardado))
    } catch { /* navegador sin almacenamiento: se queda el valor por defecto */ }
  }, [])

  function cambiarDesplazamiento(valor: number) {
    const limitado = Math.min(6, Math.max(0, Number(valor.toFixed(2))))
    setDesplazamiento(limitado)
    try { localStorage.setItem(CLAVE_DESPLAZAMIENTO, String(limitado)) } catch { /* ídem */ }
  }

  if (!receta) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ fontSize: '1.1rem', color: '#111827' }}>Receta no encontrada</h1>
        <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>
          No existe, o no pertenece a tu clínica.
        </p>
      </div>
    )
  }

  const { snapshot: s } = receta
  const anulada = receta.estado === 'anulada'
  const logoHoja = logoUrl ?? '/ninlogo.png'

  return (
    <>
      <style>{`
        @page { size: ${MEDIDAS[papel].size}; margin: 0.45in; }
        * { box-sizing: border-box; }
        body { margin: 0; background: #f3f4f6; }
        .receta-raiz { font-family: Georgia, 'Times New Roman', serif; color: #111827; }
        .barra {
          display: flex; gap: .5rem; justify-content: center; align-items: center;
          padding: .9rem; background: #ffffff; border-bottom: 1px solid #e5e7eb;
          font-family: system-ui, -apple-system, sans-serif;
        }
        .barra button, .barra a {
          padding: .55rem 1.1rem; border-radius: .5rem; border: 1px solid #d1d5db;
          background: #ffffff; color: #374151; font-size: .78rem; font-weight: 600;
          cursor: pointer; text-decoration: none;
        }
        .barra button.primario { background: #1e40af; border-color: #1e40af; color: #ffffff; }
        .barra a.actual { background: #eff6ff; border-color: #1e40af; color: #1e40af; }
        .hoja {
          /* z-index: 0 crea el contexto de apilado, que es lo que deja a la
             marca de agua meterse DEBAJO del texto y por encima del blanco.
             Sin él, un z-index negativo la escondería tras el fondo de la hoja. */
          position: relative; z-index: 0;
          width: ${MEDIDAS[papel].ancho};
          min-height: ${MEDIDAS[papel].alto};
          margin: 1.2rem auto; padding: .45in; background: #ffffff;
          box-shadow: 0 1px 3px rgba(0,0,0,.18);
        }
        .hoja.sin-membrete { padding-top: calc(.45in + var(--desplazamiento, 0in)); }
        .marca-agua {
          /* al 44% y no al 50%: centrada en la hoja entera cae sobre la firma
             y el rótulo asoma por debajo del pie, porque una receta corta deja
             vacía la mitad de abajo. Así queda en el cuerpo, como el talonario. */
          position: absolute; top: 44%; left: 50%;
          transform: translate(-50%, -50%);
          width: 56%; max-width: 3in; z-index: -1;
          opacity: .07; pointer-events: none; user-select: none;
          /* sin esto, los navegadores se comen la marca al imprimir */
          -webkit-print-color-adjust: exact; print-color-adjust: exact;
        }
        .cabecera { display: flex; gap: .6rem; align-items: flex-start; border-bottom: 1.5px solid #111827; padding-bottom: .4rem; }
        .cabecera img { max-height: 54px; max-width: 110px; object-fit: contain; }
        .clinica-nombre { font-size: 1rem; font-weight: 700; line-height: 1.15; margin: 0; }
        .clinica-datos { font-size: .62rem; color: #4b5563; line-height: 1.35; margin: .12rem 0 0; }
        .paciente {
          display: flex; flex-wrap: wrap; gap: .15rem 1.1rem;
          font-size: .68rem; padding: .45rem 0; border-bottom: 1px solid #d1d5db;
        }
        .paciente b { font-weight: 700; }
        .rx { font-size: 1.5rem; font-weight: 700; font-style: italic; margin: .5rem 0 .3rem; }
        ol.medicamentos { margin: 0; padding-left: 1.1rem; }
        ol.medicamentos li { margin-bottom: .5rem; font-size: .74rem; line-height: 1.4; }
        .medicamento-nombre { font-weight: 700; }
        .medicamento-pauta { color: #1f2937; }
        .medicamento-nota { font-size: .66rem; color: #4b5563; font-style: italic; }
        .generales { margin-top: .7rem; font-size: .7rem; line-height: 1.45; }
        .generales-titulo { font-size: .6rem; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: #6b7280; margin-bottom: .1rem; }
        .pie { margin-top: 2.4rem; display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; }
        .firma-zona { flex: 1; max-width: 2.6in; }
        /* La firma va en el flujo normal, encima de la raya, y no posicionada
           desde abajo: así no depende de cuántas líneas de texto haya debajo
           —si al doctor se le pone especialidad, la firma no se descoloca—.
           El margen negativo la deja montada sobre la raya lo justo, que es
           como se firma en papel. */
        .firma-img { display: block; margin: 0 auto -.3rem; max-height: 56px; max-width: 2.2in; object-fit: contain; }
        .firma-linea { border-top: 1px solid #111827; padding-top: .2rem; text-align: center; }
        .firma-linea p { margin: 0; font-size: .64rem; line-height: 1.3; }
        .firma-especialidad { color: #4b5563; font-style: italic; }
        .sello-img { max-height: 1.1in; max-width: 1.1in; object-fit: contain; opacity: .9; }
        .verificacion-qr {
          display: flex; justify-content: flex-end; align-items: center; gap: .35rem;
          margin-top: .55rem; font-family: system-ui, -apple-system, sans-serif;
          color: #6b7280; font-size: .48rem; line-height: 1.2; text-align: right;
        }
        .verificacion-qr img { width: .62in; height: .62in; object-fit: contain; }
        .controladas { margin-top: 1.1rem; font-size: .55rem; color: #6b7280; border-top: 1px dotted #d1d5db; padding-top: .25rem; }
        .anulada-marca {
          position: absolute; top: 42%; left: 50%;
          transform: translate(-50%, -50%) rotate(-22deg);
          font-size: ${papel === 'carta' ? '5rem' : '3.4rem'}; font-weight: 700;
          color: rgba(190, 18, 60, .28); letter-spacing: .1em;
          border: .22rem solid rgba(190, 18, 60, .28); padding: .1em .22em;
          pointer-events: none; white-space: nowrap;
        }
        .anulada-motivo {
          margin-top: .5rem; font-size: .62rem; color: #9f1239;
          border: 1px solid #fecdd3; background: #fff1f2; padding: .3rem .45rem; border-radius: .25rem;
        }
        /* ─── modo sin membrete ───────────────────────────────────────────────
           Para imprimir ENCIMA del talonario ya impreso de la clínica. Se
           calla todo lo que el papel ya trae —logo, nombre, dirección, RNC,
           la marca de agua, el Rx y la nota del pie—, y queda solo lo que
           cambia en cada receta.

           La raya de la firma y la firma escaneada también se van: el
           talonario trae su propia línea y se firma a mano sobre el papel.
           El nombre y el exequátur sí se imprimen, que son obligatorios. */
        .sin-membrete .cabecera,
        .sin-membrete .marca-agua,
        .sin-membrete .rx,
        .sin-membrete .controladas,
        .sin-membrete .firma-img { display: none; }
        .sin-membrete .firma-linea { border-top: none; }
        .aviso-membrete {
          margin: 0 auto 1rem; max-width: 34rem; text-align: center;
          font-family: system-ui, -apple-system, sans-serif;
          font-size: .72rem; color: #92400e;
          background: #fffbeb; border: 1px solid #fde68a;
          border-radius: .5rem; padding: .5rem .75rem;
        }
        @media print {
          body { background: #ffffff; }
          .no-print { display: none !important; }
          .hoja { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; }
          /* el desplazamiento para cuadrar con el talonario sí se imprime */
          .hoja.sin-membrete { padding-top: var(--desplazamiento, 0); }
        }
      `}</style>

      <div className="receta-raiz">
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
                onChange={e => cambiarDesplazamiento(Number(e.target.value))}
                style={{ width: '4.2rem', padding: '.35rem .4rem', border: '1px solid #d1d5db', borderRadius: '.4rem', fontSize: '.75rem' }}
              />
              pulgadas
            </label>
          )}
        </div>

        {!conMembrete && (
          <p className="aviso-membrete no-print">
            Modo sin membrete: sale solo lo que cambia en cada receta, para imprimir sobre
            el talonario. Haz una prueba en una hoja en blanco y ponla a contraluz sobre el
            talonario para cuadrar el «bajar».
          </p>
        )}

        <div
          className={conMembrete ? 'hoja' : 'hoja sin-membrete'}
          style={{ ['--desplazamiento' as string]: `${desplazamiento}in` }}
        >
          {/* el logo de la clínica, al fondo y muy tenue, como el talonario */}
          <img className="marca-agua" src={logoHoja} alt="" aria-hidden="true" />

          {anulada && <div className="anulada-marca">ANULADA</div>}

          <div className="cabecera">
            <img src={logoHoja} alt="" />
            <div>
              <p className="clinica-nombre">{s.clinica.nombre}</p>
              <p className="clinica-datos">
                {s.clinica.direccion && <>{s.clinica.direccion}<br /></>}
                {[s.clinica.telefono, s.clinica.email].filter(Boolean).join(' · ')}
                {s.clinica.rnc && <><br />RNC {s.clinica.rnc}</>}
              </p>
            </div>
            {/* El doctor no se repite aquí arriba: nombre, especialidad y
                exequátur van una sola vez, debajo de la firma, que es donde
                tienen valor legal. */}
          </div>

          <div className="paciente">
            <span><b>Paciente:</b> {s.paciente.nombre}</span>
            {s.paciente.edad !== null && <span><b>Edad:</b> {s.paciente.edad} años</span>}
            {s.paciente.cedula && <span><b>Cédula:</b> {s.paciente.cedula}</span>}
            <span><b>Fecha:</b> {fmtFecha(receta.fecha)}</span>
            <span><b>Receta:</b> {folioReceta(receta.numero)}</span>
          </div>

          <p className="rx">Rx</p>

          <ol className="medicamentos">
            {receta.prescripcion_items.map((it, i) => (
              <li key={i}>
                <span className="medicamento-nombre">
                  {it.medicamento}
                  {it.presentacion ? ` — ${it.presentacion}` : ''}
                </span>
                <br />
                <span className="medicamento-pauta">
                  {[it.dosis, it.via, it.frecuencia, it.duracion].filter(Boolean).join(' · ')}
                  {it.cantidad ? ` · Cantidad: ${it.cantidad}` : ''}
                </span>
                {it.indicaciones && <><br /><span className="medicamento-nota">{it.indicaciones}</span></>}
              </li>
            ))}
          </ol>

          {receta.indicaciones_generales && (
            <div className="generales">
              <p className="generales-titulo">Indicaciones generales</p>
              <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{receta.indicaciones_generales}</p>
            </div>
          )}

          {anulada && receta.motivo_anulacion && (
            <p className="anulada-motivo"><b>Receta anulada.</b> {receta.motivo_anulacion}</p>
          )}

          <div className="pie">
            <div className="firma-zona">
              {firmaUrl && <img className="firma-img" src={firmaUrl} alt="" />}
              <div className="firma-linea">
                <p>{s.doctor.nombre}</p>
                {s.doctor.especialidad && (
                  <p className="firma-especialidad">{s.doctor.especialidad}</p>
                )}
                <p>Exequátur: {s.doctor.exequatur || '____________'}</p>
              </div>
            </div>
            {selloUrl && <img className="sello-img" src={selloUrl} alt="" />}
          </div>

          {qrDataUrl && (
            <div className="verificacion-qr">
              <span>Verifica la autenticidad<br />de esta receta</span>
              <img src={qrDataUrl} alt="Código QR para verificar la receta" />
            </div>
          )}

          <p className="controladas">
            Esta receta no es válida para sustancias controladas, que requieren el recetario oficial correspondiente.
          </p>
        </div>
      </div>

      {autoImprimir && (
        <script
          dangerouslySetInnerHTML={{
            __html: 'window.addEventListener("load",function(){setTimeout(function(){window.print()},400)})',
          }}
        />
      )}
    </>
  )
}
