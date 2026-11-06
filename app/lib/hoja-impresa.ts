import type { TamanoPapel } from './prescripciones'

// Estilos de las hojas impresas de la clínica: receta y orden de laboratorio.
//
// Vive aquí y no dentro de cada ruta para que las dos hojas sean la misma
// hoja: mismo papel, mismo membrete, misma marca de agua, mismo modo sin
// membrete. Si se toca el estilo, cambian las dos a la vez.
//
// Los colores van fijos y no con Tailwind a propósito: los tokens del tema
// oscuro invertirían la hoja impresa.

/** Dónde se guarda el desplazamiento del modo sin membrete. */
export const CLAVE_DESPLAZAMIENTO = 'hojaDesplazamientoIn'

// `size` va al @page; `ancho`/`alto` solo dibujan la vista previa en pantalla.
export const MEDIDAS: Record<TamanoPapel, { size: string; ancho: string; alto: string; etiqueta: string }> = {
  'media-carta': { size: '5.5in 8.5in', ancho: '5.5in', alto: '8.5in', etiqueta: 'Media carta · 5.5 × 8.5 in' },
  a5: { size: 'A5', ancho: '148mm', alto: '210mm', etiqueta: 'A5 · 148 × 210 mm' },
  carta: { size: '8.5in 11in', ancho: '8.5in', alto: '11in', etiqueta: 'Carta · 8.5 × 11 in' },
}

/**
 * CSS común a todas las hojas impresas.
 *
 * Cada hoja le añade después lo suyo (la receta sus medicamentos, el
 * laboratorio su tabla de indicaciones).
 *
 * Para el modo sin membrete, cada hoja marca con la clase `solo-membrete`
 * lo que el papel preimpreso ya trae y aquí no hay que repetir. Es una marca
 * y no una lista de clases concretas justamente para que añadir una hoja
 * nueva no obligue a volver a tocar este archivo.
 */
export function cssHoja(papel: TamanoPapel): string {
  return `
    @page { size: ${MEDIDAS[papel].size}; margin: 0.45in; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f3f4f6; }
    .hoja-raiz { font-family: Georgia, 'Times New Roman', serif; color: #111827; }
    .barra {
      display: flex; gap: .5rem; justify-content: center; align-items: center;
      flex-wrap: wrap; padding: .9rem; background: #ffffff;
      border-bottom: 1px solid #e5e7eb;
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
         y el rótulo asoma por debajo del pie, porque una hoja corta deja
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
    .encabezado-datos {
      display: flex; flex-wrap: wrap; gap: .15rem 1.1rem;
      font-size: .68rem; padding: .45rem 0; border-bottom: 1px solid #d1d5db;
    }
    .encabezado-datos b { font-weight: 700; }
    .pie { margin-top: 2.4rem; display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; }
    .firma-zona { flex: 1; max-width: 2.6in; }
    /* La firma va en el flujo normal, encima de la raya, y no posicionada
       desde abajo: así no depende de cuántas líneas de texto haya debajo.
       El margen negativo la deja montada sobre la raya lo justo, que es
       como se firma en papel. */
    .firma-img { display: block; margin: 0 auto -.3rem; max-height: 56px; max-width: 2.2in; object-fit: contain; }
    .firma-linea { border-top: 1px solid #111827; padding-top: .2rem; text-align: center; }
    .firma-linea p { margin: 0; font-size: .64rem; line-height: 1.3; }
    .firma-detalle { color: #4b5563; font-style: italic; }
    .sello-img { max-height: 1.1in; max-width: 1.1in; object-fit: contain; opacity: .9; }
    .verificacion-qr {
      display: flex; justify-content: flex-end; align-items: center; gap: .35rem;
      margin-top: .55rem; font-family: system-ui, -apple-system, sans-serif;
      color: #6b7280; font-size: .48rem; line-height: 1.2; text-align: right;
    }
    .verificacion-qr img { width: .62in; height: .62in; object-fit: contain; }
    .nota-pie { margin-top: 1.1rem; font-size: .55rem; color: #6b7280; border-top: 1px dotted #d1d5db; padding-top: .25rem; }
    .sello-estado {
      position: absolute; top: 42%; left: 50%;
      transform: translate(-50%, -50%) rotate(-22deg);
      font-size: ${papel === 'carta' ? '5rem' : '3.4rem'}; font-weight: 700;
      color: rgba(190, 18, 60, .28); letter-spacing: .1em;
      border: .22rem solid rgba(190, 18, 60, .28); padding: .1em .22em;
      pointer-events: none; white-space: nowrap;
    }
    /* ─── modo sin membrete ───────────────────────────────────────────────
       Para imprimir ENCIMA del papel ya impreso de la clínica. Se calla
       todo lo que el papel ya trae y queda solo lo que cambia en cada hoja.

       La raya de la firma y la firma escaneada también se van: el papel
       trae su propia línea y se firma a mano encima. */
    .sin-membrete .cabecera,
    .sin-membrete .marca-agua,
    .sin-membrete .solo-membrete,
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
      /* el desplazamiento para cuadrar con el papel sí se imprime */
      .hoja.sin-membrete { padding-top: var(--desplazamiento, 0); }
    }
  `
}
