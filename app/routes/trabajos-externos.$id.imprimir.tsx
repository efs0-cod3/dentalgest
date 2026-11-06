import QRCode from 'qrcode'
import type { Route } from './+types/trabajos-externos.$id.imprimir'
import { createSupabaseServerClient } from '~/lib/supabase.server'
import { requireSeccion } from '~/lib/clinica.server'
import { firmarImagen } from '~/lib/prescripciones.server'
import { normalizarTamanoPapel, type TamanoPapel } from '~/lib/prescripciones'
import { cssHoja, MEDIDAS } from '~/lib/hoja-impresa'
import { BarraImpresion, AvisoMembrete, useDesplazamiento } from '~/components/HojaImpresa'
import { MARCA_LAB } from '~/lib/marca'

// Ficha de trabajo externo, en la hoja compartida de la clínica.
//
// Mantiene los campos de la ficha de siempre —cliente, referencia del
// paciente, material, fechas, notas, QR y la raya de firma/sello— y les pone
// debajo el mismo papel que la receta y la tablilla: tamaños, membrete,
// marca de agua y modo sin membrete.
//
// Ojo con el rótulo: esta hoja la emite NIN DENTAL LAB, no la clínica. El
// destinatario es otra clínica que le encarga trabajo al laboratorio, así
// que el nombre que manda es el del laboratorio. Los datos de contacto y el
// RNC sí son los de la empresa, que es la misma.

type TrabajoImpreso = {
  id: string
  verification_token: string
  tipo_trabajo: string
  paciente_referencia: string | null
  material: string | null
  notas: string | null
  estado: string
  fecha_recibido: string
  fecha_prometida: string | null
  fecha_entregado: string | null
  clientes_externos: { nombre: string } | null
}

type ClinicaHoja = {
  direccion: string | null
  telefono: string | null
  email: string | null
  rnc: string | null
  logo_path: string | null
}

function folioTrabajo(id: string) {
  return `#${id.slice(-8).toUpperCase()}`
}

export function meta({ data }: Route.MetaArgs): Route.MetaDescriptors {
  const trabajo = data?.trabajo as TrabajoImpreso | null | undefined
  if (!trabajo) return [{ title: 'Ficha no encontrada' }]
  return [{ title: `Ficha de trabajo ${folioTrabajo(trabajo.id)} — ${MARCA_LAB}` }]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request)
  const { clinicaId } = await requireSeccion(request, 'trabajos-externos')

  const url = new URL(request.url)
  const papel: TamanoPapel = normalizarTamanoPapel(url.searchParams.get('papel'))
  const autoImprimir = url.searchParams.get('auto') === '1'
  const conMembrete = url.searchParams.get('membrete') !== '0'

  const { data, error } = await supabase
    .from('trabajos_externos')
    .select('id,verification_token,tipo_trabajo,paciente_referencia,material,notas,estado,fecha_recibido,fecha_prometida,fecha_entregado,clientes_externos(nombre)')
    .eq('id', params.id as string)
    .eq('clinica_id', clinicaId)
    .maybeSingle()

  // "no existe" y "la consulta falló" no son lo mismo; confundirlos ya costó
  // una caída silenciosa en la receta
  if (error) console.error('[trabajo-externo/imprimir] la consulta falló:', error.message)

  // la fecha se calcula en el servidor para que no baile con la zona horaria
  // del navegador al hidratar
  const fechaImpresion = new Date().toLocaleDateString('es-DO', { dateStyle: 'long' })
  const vacio = { trabajo: null, clinica: null, logoUrl: null, qrDataUrl: null, fechaImpresion, papel, autoImprimir, conMembrete }
  if (!data) return vacio

  const trabajo = data as unknown as TrabajoImpreso

  const { data: clinicaData } = await supabase
    .from('clinicas')
    .select('direccion,telefono,email,rnc,logo_path')
    .eq('id', clinicaId)
    .maybeSingle()

  const clinica = (clinicaData as ClinicaHoja | null) ?? null
  const logoUrl = await firmarImagen(supabase as any, clinica?.logo_path)

  const urlVerificar = new URL(
    `/verificar-trabajo/${trabajo.id}?token=${trabajo.verification_token}`,
    request.url,
  ).toString()
  const qrDataUrl = await QRCode.toDataURL(urlVerificar, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 240,
    color: { dark: '#111827', light: '#ffffff' },
  })

  return { trabajo, clinica, logoUrl, qrDataUrl, fechaImpresion, papel, autoImprimir, conMembrete }
}

function fmtFecha(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString('es-DO', { dateStyle: 'long' })
}

export default function TrabajoExternoImprimir({ loaderData }: Route.ComponentProps) {
  const { trabajo, clinica, logoUrl, qrDataUrl, fechaImpresion, papel, autoImprimir, conMembrete } = loaderData
  const { desplazamiento, cambiarDesplazamiento } = useDesplazamiento()

  if (!trabajo) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ fontSize: '1.1rem', color: '#111827' }}>Ficha no encontrada</h1>
        <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>
          No existe, o no pertenece a tu clínica.
        </p>
      </div>
    )
  }

  const logoHoja = logoUrl ?? '/ninlogo.png'
  const entregado = trabajo.estado === 'entregado'

  const filas: Array<[string, string | null]> = [
    ['Cliente externo', trabajo.clientes_externos?.nombre ?? null],
    ['Referencia del paciente', trabajo.paciente_referencia],
    ['Material', trabajo.material],
    ['Fecha de recibido', trabajo.fecha_recibido ? fmtFecha(trabajo.fecha_recibido) : null],
    ['Fecha prometida', trabajo.fecha_prometida ? fmtFecha(trabajo.fecha_prometida) : null],
    ['Fecha de entrega', trabajo.fecha_entregado ? fmtFecha(trabajo.fecha_entregado) : null],
  ]

  return (
    <>
      <style>{`
        ${cssHoja(papel)}
        .ficha-rotulo {
          font-size: .58rem; font-weight: 700; text-transform: uppercase;
          letter-spacing: .09em; color: #6b7280; margin: .6rem 0 .1rem;
        }
        .ficha-titulo { font-size: 1rem; font-weight: 700; margin: 0 0 .45rem; }
        table.ficha { width: 100%; border-collapse: collapse; }
        /* baseline y no top: con la etiqueta más pequeña que el valor,
           alinear por arriba la deja visiblemente más alta */
        table.ficha th {
          width: 38%; text-align: left; vertical-align: baseline;
          padding: .3rem .5rem .3rem 0; border-bottom: 1px solid #f1f5f9;
          font-size: .58rem; font-weight: 700; text-transform: uppercase;
          letter-spacing: .05em; color: #6b7280;
        }
        table.ficha td {
          padding: .3rem 0; border-bottom: 1px solid #f1f5f9;
          vertical-align: baseline; font-size: .74rem; color: #111827;
        }
        .ficha-notas { margin-top: .8rem; font-size: .72rem; line-height: 1.5; }
        .ficha-notas-titulo {
          font-size: .6rem; font-weight: 700; text-transform: uppercase;
          letter-spacing: .04em; color: #6b7280; margin-bottom: .12rem;
        }
        .ficha-pie {
          margin-top: 2.2rem; display: flex; align-items: flex-end;
          justify-content: space-between; gap: 1.2rem;
        }
        .ficha-firma { width: 2.1in; }
        .ficha-firma .raya { border-bottom: 1px solid #111827; height: 1.6rem; }
        .ficha-firma p {
          margin: .25rem 0 0; font-size: .58rem; text-transform: uppercase;
          letter-spacing: .05em; color: #6b7280;
        }
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

          {entregado && <div className="sello-estado">ENTREGADO</div>}

          <div className="cabecera">
            <img src={logoHoja} alt="" />
            <div>
              {/* el emisor es el laboratorio, no la clínica */}
              <p className="clinica-nombre">{MARCA_LAB}</p>
              <p className="clinica-datos">
                {clinica?.direccion && <>{clinica.direccion}<br /></>}
                {[clinica?.telefono, clinica?.email].filter(Boolean).join(' · ')}
                {clinica?.rnc && <><br />RNC {clinica.rnc}</>}
              </p>
            </div>
          </div>

          {/* el cliente no se repite aquí: está en la tabla, completo */}
          <div className="encabezado-datos">
            <span><b>Ficha:</b> {folioTrabajo(trabajo.id)}</span>
            <span><b>Fecha de impresión:</b> {fechaImpresion}</span>
          </div>

          <p className="ficha-rotulo solo-membrete">Ficha de trabajo externo</p>
          <p className="ficha-titulo">{trabajo.tipo_trabajo}</p>

          <table className="ficha">
            <tbody>
              {filas.filter(([, valor]) => !!valor).map(([etiqueta, valor]) => (
                <tr key={etiqueta}>
                  <th scope="row">{etiqueta}</th>
                  <td>{valor}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {trabajo.notas && (
            <div className="ficha-notas">
              <p className="ficha-notas-titulo">Notas / Instrucciones</p>
              <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{trabajo.notas}</p>
            </div>
          )}

          <div className="ficha-pie">
            {qrDataUrl && (
              <div className="verificacion-qr" style={{ marginTop: 0 }}>
                <span>Escanea para verificar<br />la autenticidad de esta ficha</span>
                <img src={qrDataUrl} alt="Código QR para verificar la ficha" />
              </div>
            )}
            <div className="ficha-firma">
              <div className="raya" />
              <p>Firma / Sello</p>
            </div>
          </div>
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
