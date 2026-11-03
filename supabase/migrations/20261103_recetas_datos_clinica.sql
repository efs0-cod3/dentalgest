-- Sello y logo de la clínica para el encabezado y el pie de la receta.
--
-- nombre, direccion, telefono y email ya existían. El logo no: hasta ahora era
-- el archivo estático /ninlogo.png de la app, que sigue sirviendo de respaldo
-- cuando logo_path está vacío.

alter table public.clinicas add column if not exists sello_path text;
alter table public.clinicas add column if not exists logo_path  text;

comment on column public.clinicas.sello_path is 'Ruta en el bucket documentos-clinica del sello: {clinica_id}/sello/...';
comment on column public.clinicas.logo_path  is 'Ruta en el bucket documentos-clinica del logo. Vacío = se usa /ninlogo.png.';
