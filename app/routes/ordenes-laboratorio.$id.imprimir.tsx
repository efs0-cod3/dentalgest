import type { Route } from './+types/ordenes-laboratorio.$id.imprimir'
import { createSupabaseServerClient } from '~/lib/supabase.server'
import { requireSeccion } from '~/lib/clinica.server'
import { firmarImagen } from '~/lib/prescripciones.server'
import { normalizarTamanoPapel, type TamanoPapel } from '~/lib/prescripciones'
import { cssHoja, MEDIDAS } from '~/lib/hoja-impresa'
import { BarraImpresion, AvisoMembrete, useDesplazamiento } from '~/components/HojaImpresa'

// Hoja imprimible de la orden de laboratorio: la tablilla de indicaciones
// que se le manda al laboratorio con el trabajo.
//
// Va fuera del layout del dashboard a propósito, igual que la receta, para
// que no se imprima el menú. Comparte con ella papel, membrete, marca de
// agua y modo sin membrete (ver app/lib/hoja-impresa.ts).
//
// A diferencia de la receta, esto NO lleva snapshot: una orden de
// laboratorio se corrige mientras el trabajo está en curso —cambia el color,
// la fecha prometida, las indicaciones— y lo que hay que imprimir es siempre
// el estado actual, no el del día que se creó.

type OrdenImpresa = {
  id: string
  titulo: string
  laboratorio: string | null
  tipo_trabajo: string | null
  color_dental: string | null
  doctor: string | null
  fecha_solicitud: string
  fecha_prometida: string | null
  fecha_entrega: string | null
  estado: string
  notas: string | null
  pacientes: { nombre: string } | null
}

type ClinicaHoja = {
  nombre: string
  direccion: string | null
  telefono: string | null
  email: string | null
  rnc: string | null
  logo_path: string | null
  sello_path: string | null
}

export function meta({ data }: Route.MetaArgs): Route.MetaDescriptors {
  const orden = data?.orden as OrdenImpresa | null | undefined
  if (!orden) return [{ title: 'Orden no encontrada' }]
  return [{ title: `Orden ${folioOrden(orden.id)} — ${orden.pacientes?.nombre ?? 'Laboratorio'}` }]
}

function folioOrden(id: string) {
  return `#${id.slice(-8).toUpperCase()}`
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request)
  // el guarda es el de la sección; la RLS hace el filtro real por clínica
  const { clinicaId } = await requireSeccion(request, 'laboratorio')

  const url = new URL(request.url)
  const papel: TamanoPapel = normalizarTamanoPapel(url.searchParams.get('papel'))
  const autoImprimir = url.searchParams.get('auto') === '1'
  const conMembrete = url.searchParams.get('membrete') !== '0'

  const { data, error } = await supabase
    .from('ordenes_laboratorio')
    .select('id,titulo,laboratorio,tipo_trabajo,color_dental,doctor,fecha_solicitud,fecha_prometida,fecha_entrega,estado,notas,pacientes(nombre)')
    .eq('id', params.id as string)
    .eq('clinica_id', clinicaId)
    .maybeSingle()

  // Un error de consulta NO es "no existe", y confundirlos sale caro: en la
  // receta, pedir una columna que no existía hacía decir "no encontrada" para
  // todas, sin rastro en ningún log. Aquí se registra.
  if (error) console.error('[orden-laboratorio/imprimir] la consulta falló:', error.message)

  const vacio = {
    orden: null, clinica: null, logoUrl: null, selloUrl: null,
    papel, autoImprimir, conMembrete,
  }
  if (!data) return vacio

  const orden = data as unknown as OrdenImpresa

  const { data: clinicaData } = await supabase
    .from('clinicas')
    .select('nombre,direccion,telefono,email,rnc,logo_path,sello_path')
    .eq('id', clinicaId)
    .maybeSingle()

  const clinica = (clinicaData as ClinicaHoja | null) ?? null

  // las imágenes son privadas: se firman aquí, en el servidor, y por poco tiempo
  const [logoUrl, selloUrl] = await Promise.all([
    firmarImagen(supabase as any, clinica?.logo_path),
    firmarImagen(supabase as any, clinica?.sello_path),
  ])

  return { orden, clinica, logoUrl, selloUrl, papel, autoImprimir, conMembrete }
}

function fmtFecha(iso: string) {
  // es un `date`, así que se parte a mano para no corrernos un día
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString('es-DO', { dateStyle: 'long' })
}

export default function OrdenLaboratorioImprimir({ loaderData }: Route.ComponentProps) {
  const { orden, clinica, logoUrl, selloUrl, papel, autoImprimir, conMembrete } = loaderData
  const { desplazamiento, cambiarDesplazamiento } = useDesplazamiento()

  if (!orden) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ fontSize: '1.1rem', color: '#111827' }}>Orden no encontrada</h1>
        <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>
          No existe, o no pertenece a tu clínica.
        </p>
      </div>
    )
  }

  const logoHoja = logoUrl ?? '/ninlogo.png'
  const entregada = orden.estado === 'entregado'

  const filas: Array<[string, string | null]> = [
    ['Laboratorio', orden.laboratorio],
    ['Tipo de trabajo', orden.tipo_trabajo],
    ['Color dental', orden.color_dental],
    ['Fecha de envío', orden.fecha_solicitud ? fmtFecha(orden.fecha_solicitud) : null],
    ['Fecha prometida', orden.fecha_prometida ? fmtFecha(orden.fecha_prometida) : null],
  ]

  return (
    <>
      <style>{`
        ${cssHoja(papel)}
        .orden-titulo { font-size: 1rem; font-weight: 700; margin: .6rem 0 .45rem; }
        table.indicaciones { width: 100%; border-collapse: collapse; }
        /* baseline y no top: con la etiqueta a .58rem y el valor a .74rem,
           alinear por arriba deja la etiqueta visiblemente más alta */
        table.indicaciones th {
          width: 38%; text-align: left; vertical-align: baseline;
          padding: .3rem .5rem .3rem 0; border-bottom: 1px solid #f1f5f9;
          font-size: .58rem; font-weight: 700; text-transform: uppercase;
          letter-spacing: .05em; color: #6b7280;
        }
        table.indicaciones td {
          padding: .3rem 0; border-bottom: 1px solid #f1f5f9;
          vertical-align: baseline;
          font-size: .74rem; color: #111827;
        }
        .indicaciones-libres { margin-top: .8rem; font-size: .72rem; line-height: 1.5; }
        .indicaciones-titulo {
          font-size: .6rem; font-weight: 700; text-transform: uppercase;
          letter-spacing: .04em; color: #6b7280; margin-bottom: .12rem;
        }
        .recibido { margin-top: 2.4rem; display: flex; gap: 1.4rem; }
        .recibido > div { flex: 1; }
        .recibido p {
          margin: .25rem 0 0; font-size: .58rem; text-transform: uppercase;
          letter-spacing: .05em; color: #6b7280;
        }
        .recibido .raya { border-bottom: 1px solid #111827; height: 1.5rem; }
      `}</style>

      <div className="hoja-raiz">
        <BarraImpresion
          papel={papel}
          conMembrete={conMembrete}
          desplazamiento={desplazamiento}
          onDesplazamiento={cambiarDesplazamiento}
        />

        {!conMembrete && <AvisoMembrete papel={MEDIDAS[papel].etiqueta} />}

        <div
          className={conMembrete ? 'hoja' : 'hoja sin-membrete'}
          style={{ ['--desplazamiento' as string]: `${desplazamiento}in` }}
        >
          <img className="marca-agua" src={logoHoja} alt="" aria-hidden="true" />

          {entregada && <div className="sello-estado">ENTREGADA</div>}

          <div className="cabecera">
            <img src={logoHoja} alt="" />
            <div>
              <p className="clinica-nombre">{clinica?.nombre ?? 'Clínica'}</p>
              <p className="clinica-datos">
                {clinica?.direccion && <>{clinica.direccion}<br /></>}
                {[clinica?.telefono, clinica?.email].filter(Boolean).join(' · ')}
                {clinica?.rnc && <><br />RNC {clinica.rnc}</>}
              </p>
            </div>
          </div>

          <div className="encabezado-datos">
            <span><b>Paciente:</b> {orden.pacientes?.nombre ?? 'No especificado'}</span>
            {orden.doctor && <span><b>Doctor:</b> {orden.doctor}</span>}
            <span><b>Orden:</b> {folioOrden(orden.id)}</span>
          </div>

          {/* el rótulo "Orden de laboratorio" ya lo trae el papel con membrete */}
          <p className="orden-titulo">
            <span className="solo-membrete">Orden de laboratorio — </span>
            {orden.titulo}
          </p>

          <table className="indicaciones">
            <tbody>
              {filas.filter(([, valor]) => !!valor).map(([etiqueta, valor]) => (
                <tr key={etiqueta}>
                  <th scope="row">{etiqueta}</th>
                  <td>{valor}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {orden.notas && (
            <div className="indicaciones-libres">
              <p className="indicaciones-titulo">Indicaciones</p>
              <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{orden.notas}</p>
            </div>
          )}

          <div className="pie">
            <div className="firma-zona">
              <div className="firma-linea">
                <p>{orden.doctor ?? 'Doctor responsable'}</p>
                <p className="firma-detalle">Indicaciones de la clínica</p>
              </div>
            </div>
            {selloUrl && <img className="sello-img" src={selloUrl} alt="" />}
          </div>

          <div className="recibido">
            <div>
              <div className="raya" />
              <p>Recibido por el laboratorio</p>
            </div>
            <div>
              <div className="raya" />
              <p>Fecha de entrega real</p>
            </div>
          </div>

          <p className="nota-pie solo-membrete">
            Esta hoja acompaña al trabajo. Cualquier cambio en las indicaciones debe
            confirmarse con la clínica antes de continuar.
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
