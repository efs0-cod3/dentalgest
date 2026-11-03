import type { Route } from './+types/recetas.$id.imprimir'
import { createSupabaseServerClient } from '~/lib/supabase.server'
import { getSesion } from '~/lib/clinica.server'
import { firmarImagen } from '~/lib/prescripciones.server'
import { folioReceta, esTamanoPapel, type SnapshotReceta, type TamanoPapel } from '~/lib/prescripciones'

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
  numero: number
  fecha: string
  estado: string
  motivo_anulacion: string | null
  indicaciones_generales: string | null
  snapshot: SnapshotReceta
  prescripcion_items: ItemImpreso[]
}

const MEDIDAS: Record<TamanoPapel, { size: string; etiqueta: string }> = {
  'media-carta': { size: '5.5in 8.5in', etiqueta: 'Media carta' },
  carta: { size: '8.5in 11in', etiqueta: 'Carta' },
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
  const papelParam = url.searchParams.get('papel')
  const papel: TamanoPapel = esTamanoPapel(papelParam) ? papelParam : 'media-carta'
  const autoImprimir = url.searchParams.get('auto') === '1'

  const { data } = await supabase
    .from('prescripciones')
    .select(`
      id, numero, fecha, estado, motivo_anulacion, indicaciones_generales, snapshot,
      prescripcion_items(orden, medicamento, presentacion, dosis, via, frecuencia, duracion, cantidad, indicaciones)
    `)
    .eq('id', params.id as string)
    .eq('clinica_id', clinicaId)
    .maybeSingle()

  if (!data) return { receta: null, firmaUrl: null, selloUrl: null, logoUrl: null, papel, autoImprimir }

  const receta = data as unknown as RecetaImpresa
  receta.prescripcion_items = [...(receta.prescripcion_items ?? [])].sort((a, b) => a.orden - b.orden)

  // las imágenes son privadas: se firman aquí, en el servidor, y por poco tiempo
  const [firmaUrl, selloUrl, logoUrl] = await Promise.all([
    firmarImagen(supabase as any, receta.snapshot?.doctor?.firma_path),
    firmarImagen(supabase as any, receta.snapshot?.clinica?.sello_path),
    firmarImagen(supabase as any, receta.snapshot?.clinica?.logo_path),
  ])

  return { receta, firmaUrl, selloUrl, logoUrl, papel, autoImprimir }
}

function fmtFecha(iso: string) {
  // la fecha es un `date`, así que se parte a mano para no corrernos un día
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString('es-DO', { dateStyle: 'long' })
}

export default function RecetaImprimir({ loaderData }: Route.ComponentProps) {
  const { receta, firmaUrl, selloUrl, logoUrl, papel, autoImprimir } = loaderData

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
  const otroPapel: TamanoPapel = papel === 'media-carta' ? 'carta' : 'media-carta'

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
        .hoja {
          position: relative; width: ${papel === 'media-carta' ? '5.5in' : '8.5in'};
          min-height: ${papel === 'media-carta' ? '8.5in' : '11in'};
          margin: 1.2rem auto; padding: .45in; background: #ffffff;
          box-shadow: 0 1px 3px rgba(0,0,0,.18);
        }
        .cabecera { display: flex; gap: .6rem; align-items: flex-start; border-bottom: 1.5px solid #111827; padding-bottom: .4rem; }
        .cabecera img { max-height: 54px; max-width: 110px; object-fit: contain; }
        .clinica-nombre { font-size: 1rem; font-weight: 700; line-height: 1.15; margin: 0; }
        .clinica-datos { font-size: .62rem; color: #4b5563; line-height: 1.35; margin: .12rem 0 0; }
        .doctor { text-align: right; margin-left: auto; }
        .doctor-nombre { font-size: .8rem; font-weight: 700; margin: 0; }
        .doctor-datos { font-size: .62rem; color: #4b5563; margin: .1rem 0 0; line-height: 1.35; }
        .exequatur { font-weight: 700; color: #111827; }
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
        .pie { margin-top: 2.2rem; display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; }
        .firma-zona { position: relative; flex: 1; max-width: 2.6in; }
        .firma-img { position: absolute; bottom: .25rem; left: 50%; transform: translateX(-50%); max-height: 56px; max-width: 2.2in; object-fit: contain; }
        .firma-linea { border-top: 1px solid #111827; padding-top: .2rem; text-align: center; }
        .firma-linea p { margin: 0; font-size: .64rem; line-height: 1.3; }
        .sello-img { max-height: 1.1in; max-width: 1.1in; object-fit: contain; opacity: .9; }
        .controladas { margin-top: 1.1rem; font-size: .55rem; color: #6b7280; border-top: 1px dotted #d1d5db; padding-top: .25rem; }
        .anulada-marca {
          position: absolute; top: 42%; left: 50%;
          transform: translate(-50%, -50%) rotate(-22deg);
          font-size: ${papel === 'media-carta' ? '3.4rem' : '5rem'}; font-weight: 700;
          color: rgba(190, 18, 60, .28); letter-spacing: .1em;
          border: .22rem solid rgba(190, 18, 60, .28); padding: .1em .22em;
          pointer-events: none; white-space: nowrap;
        }
        .anulada-motivo {
          margin-top: .5rem; font-size: .62rem; color: #9f1239;
          border: 1px solid #fecdd3; background: #fff1f2; padding: .3rem .45rem; border-radius: .25rem;
        }
        @media print {
          body { background: #ffffff; }
          .no-print { display: none !important; }
          .hoja { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; }
        }
      `}</style>

      <div className="receta-raiz">
        <div className="barra no-print">
          <button type="button" className="primario" onClick={() => window.print()}>Imprimir</button>
          <a href={`?papel=${otroPapel}`}>Cambiar a {MEDIDAS[otroPapel].etiqueta.toLowerCase()}</a>
          <span style={{ fontSize: '.7rem', color: '#6b7280' }}>{MEDIDAS[papel].etiqueta}</span>
        </div>

        <div className="hoja">
          {anulada && <div className="anulada-marca">ANULADA</div>}

          <div className="cabecera">
            {logoUrl ? <img src={logoUrl} alt="" /> : <img src="/ninlogo.png" alt="" />}
            <div>
              <p className="clinica-nombre">{s.clinica.nombre}</p>
              <p className="clinica-datos">
                {s.clinica.direccion && <>{s.clinica.direccion}<br /></>}
                {[s.clinica.telefono, s.clinica.email].filter(Boolean).join(' · ')}
                {s.clinica.rnc && <><br />RNC {s.clinica.rnc}</>}
              </p>
            </div>
            <div className="doctor">
              <p className="doctor-nombre">{s.doctor.nombre}</p>
              <p className="doctor-datos">
                {s.doctor.especialidad && <>{s.doctor.especialidad}<br /></>}
                <span className="exequatur">Exequátur: {s.doctor.exequatur || '____________'}</span>
              </p>
            </div>
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
                <p>Exequátur: {s.doctor.exequatur || '____________'}</p>
              </div>
            </div>
            {selloUrl && <img className="sello-img" src={selloUrl} alt="" />}
          </div>

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
