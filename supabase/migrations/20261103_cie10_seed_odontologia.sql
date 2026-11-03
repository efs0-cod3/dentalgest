-- Seed del catálogo CIE-10 con los diagnósticos odontológicos de uso corriente
-- en la clínica (35 códigos).
--
-- ESTADO DE VERIFICACIÓN: estos 35 códigos son la lista que entregó la
-- clínica. NO se pudieron confrontar contra la fuente oficial de la CIE-10 de
-- la OMS en español porque la política de red del entorno bloquea los
-- dominios ais.paho.org, icd.who.int, classbrowser.nhs.uk y minsa.gob.pe.
-- Por eso el bloque K00-K14 está incompleto a propósito: solo se cargó lo
-- aportado por la clínica y no se inventó ningún código ni descripción.
-- Pendiente al habilitar la red: verificar estas filas y completar el bloque.
--
-- Caso a confirmar: K02.3 "Caries dentaria detenida". Hay fuentes que no lo
-- incluyen en la lista de la OPS y otras que sí. Se carga porque la clínica lo
-- pidió explícitamente, pero conviene confirmarlo con la ARS antes de usarlo
-- en reclamaciones.

insert into public.cie10_codigos (codigo, descripcion, categoria, es_categoria) values
  ('K00.0', 'Anodoncia',                                      'K00', false),
  ('K00.1', 'Dientes supernumerarios',                        'K00', false),
  ('K00.6', 'Alteraciones en la erupción dentaria',            'K00', false),
  ('K01.0', 'Dientes incluidos',                              'K01', false),
  ('K01.1', 'Dientes impactados',                             'K01', false),
  ('K02.0', 'Caries limitada al esmalte',                     'K02', false),
  ('K02.1', 'Caries de la dentina',                           'K02', false),
  ('K02.2', 'Caries del cemento',                             'K02', false),
  ('K02.3', 'Caries dentaria detenida',                       'K02', false),
  ('K02.9', 'Caries dental, no especificada',                 'K02', false),
  ('K03.0', 'Atrición excesiva de los dientes',               'K03', false),
  ('K03.1', 'Abrasión de los dientes',                        'K03', false),
  ('K03.2', 'Erosión de los dientes',                         'K03', false),
  ('K03.6', 'Depósitos [acreciones] en los dientes',          'K03', false),
  ('K04.0', 'Pulpitis',                                       'K04', false),
  ('K04.1', 'Necrosis de la pulpa',                           'K04', false),
  ('K04.4', 'Periodontitis apical aguda originada en la pulpa','K04', false),
  ('K04.5', 'Periodontitis apical crónica',                   'K04', false),
  ('K04.6', 'Absceso periapical con fístula',                 'K04', false),
  ('K04.7', 'Absceso periapical sin fístula',                 'K04', false),
  ('K04.8', 'Quiste radicular',                               'K04', false),
  ('K05.0', 'Gingivitis aguda',                               'K05', false),
  ('K05.1', 'Gingivitis crónica',                             'K05', false),
  ('K05.2', 'Periodontitis aguda',                            'K05', false),
  ('K05.3', 'Periodontitis crónica',                          'K05', false),
  ('K06.0', 'Retracción gingival',                            'K06', false),
  ('K06.1', 'Hiperplasia gingival',                           'K06', false),
  ('K07.3', 'Anomalías de la posición del diente',            'K07', false),
  ('K07.4', 'Maloclusión de tipo no especificado',            'K07', false),
  ('K07.6', 'Trastornos de la articulación temporomaxilar',   'K07', false),
  ('K08.1', 'Pérdida de dientes debida a accidente, extracción o enfermedad periodontal local', 'K08', false),
  ('K08.3', 'Raíz dental retenida',                           'K08', false),
  ('K10.3', 'Alveolitis del maxilar',                         'K10', false),
  ('K12.0', 'Estomatitis aftosa recurrente',                  'K12', false),
  ('S02.5', 'Fractura de los dientes',                        'S02', false)
on conflict (codigo) do update set
  descripcion  = excluded.descripcion,
  categoria    = excluded.categoria,
  es_categoria = excluded.es_categoria;
  -- activo se deja como esté: si alguien ocultó un código a propósito, el
  -- seed no lo vuelve a mostrar.
