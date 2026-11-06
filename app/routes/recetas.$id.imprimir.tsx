import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import type { Route } from './+types/recetas.$id.imprimir'
import { createSupabaseServerClient } from '~/lib/supabase.server'
import { getSesion } from '~/lib/clinica.server'
import { firmarImagen } from '~/lib/prescripciones.server'
import { folioReceta, normalizarTamanoPapel, type SnapshotReceta, type TamanoPapel } from '~/lib/prescripciones'
import { cssHoja, MEDIDAS } from '~/lib/hoja-impresa'
import { BarraImpresion, AvisoMembrete, useDesplazamiento } from '~/components/HojaImpresa'

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

  const { data, error } = await supabase
    .from('prescripciones')
    .select(`
      id, verification_token, numero, fecha, estado, motivo_anulacion, indicaciones_generales, snapshot,
      prescripcion_items(orden, medicamento, presentacion, dosis, via, frecuencia, duracion, cantidad, indicaciones)
    `)
    .eq('id', params.id as string)
    .eq('clinica_id', clinicaId)
    .maybeSingle()

  // Un error de la consulta NO es lo mismo que "no existe", y confundirlos
  // sale caro: cuando se añadió verification_token al select sin aplicar la
  // migración, PostgREST devolvía "column does not exist" y la página decía
  // "Receta no encontrada" para TODAS las recetas, sin dejar rastro en ningún
  // log. Si vuelve a pasar, ahora se ve en los registros del servidor.
  if (error) console.error('[receta/imprimir] la consulta falló:', error.message)

  if (!data) return { receta: null, firmaUrl: null, selloUrl: null, logoUrl: null, qrDataUrl: null, clinicaNombre: null, papel, autoImprimir, conMembrete }

  const receta = data as unknown as RecetaImpresa
  receta.prescripcion_items = [...(receta.prescripcion_items ?? [])].sort((a, b) => a.orden - b.orden)

  // las imágenes son privadas: se firman aquí, en el servidor, y por poco tiempo
  const [firmaUrl, selloUrl, logoUrl, { data: clinica }] = await Promise.all([
    firmarImagen(supabase as any, receta.snapshot?.doctor?.firma_path),
    firmarImagen(supabase as any, receta.snapshot?.clinica?.sello_path),
    firmarImagen(supabase as any, receta.snapshot?.clinica?.logo_path),
    // El NOMBRE de la clínica es la excepción al snapshot: se lee el actual.
    // Lo demás —doctor, exequátur, paciente, medicamentos— sigue congelado,
    // que es lo que hace que una reimpresión valga como copia de lo que se le
    // entregó al paciente. El nombre es rótulo: la clínica es la misma aunque
    // le cambien el letrero, y lo que no puede pasar es que una receta vieja
    // salga con un nombre que ya no existe.
    supabase.from('clinicas').select('nombre').eq('id', clinicaId).maybeSingle(),
  ])

  const clinicaNombre = (clinica?.nombre as string | null) ?? null

  const verificationUrl = new URL(`/verificar-receta/${receta.id}?token=${receta.verification_token}`, request.url).toString()
  const qrDataUrl = await QRCode.toDataURL(verificationUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 240,
    color: { dark: '#111827', light: '#ffffff' },
  })

  return { receta, firmaUrl, selloUrl, logoUrl, qrDataUrl, clinicaNombre, papel, autoImprimir, conMembrete }
}

function fmtFecha(iso: string) {
  // la fecha es un `date`, así que se parte a mano para no corrernos un día
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString('es-DO', { dateStyle: 'long' })
}

export default function RecetaImprimir({ loaderData }: Route.ComponentProps) {
  const { receta, firmaUrl, selloUrl, logoUrl, qrDataUrl, clinicaNombre, papel, autoImprimir, conMembrete } = loaderData

  const { desplazamiento, cambiarDesplazamiento } = useDesplazamiento()

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
        ${cssHoja(papel)}
        .rx { font-size: 1.5rem; font-weight: 700; font-style: italic; margin: .5rem 0 .3rem; }
        ol.medicamentos { margin: 0; padding-left: 1.1rem; }
        ol.medicamentos li { margin-bottom: .5rem; font-size: .74rem; line-height: 1.4; }
        .medicamento-nombre { font-weight: 700; }
        .medicamento-pauta { color: #1f2937; }
        .medicamento-nota { font-size: .66rem; color: #4b5563; font-style: italic; }
        .generales { margin-top: .7rem; font-size: .7rem; line-height: 1.45; }
        .generales-titulo { font-size: .6rem; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: #6b7280; margin-bottom: .1rem; }
        .anulada-motivo {
          margin-top: .5rem; font-size: .62rem; color: #9f1239;
          border: 1px solid #fecdd3; background: #fff1f2; padding: .3rem .45rem; border-radius: .25rem;
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
          {/* el logo de la clínica, al fondo y muy tenue, como el talonario */}
          <img className="marca-agua" src={logoHoja} alt="" aria-hidden="true" />

          {anulada && <div className="sello-estado">ANULADA</div>}

          <div className="cabecera">
            <img src={logoHoja} alt="" />
            <div>
              <p className="clinica-nombre">{clinicaNombre ?? s.clinica.nombre}</p>
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

          <div className="encabezado-datos">
            <span><b>Paciente:</b> {s.paciente.nombre}</span>
            {s.paciente.edad !== null && <span><b>Edad:</b> {s.paciente.edad} años</span>}
            {s.paciente.cedula && <span><b>Cédula:</b> {s.paciente.cedula}</span>}
            <span><b>Fecha:</b> {fmtFecha(receta.fecha)}</span>
            <span><b>Receta:</b> {folioReceta(receta.numero)}</span>
          </div>

          <p className="rx solo-membrete">Rx</p>

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
                  <p className="firma-detalle">{s.doctor.especialidad}</p>
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

          <p className="nota-pie solo-membrete">
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
