-- Datos profesionales del doctor que hacen falta para emitir recetas.
-- `especialidad` ya existía en la tabla.

alter table public.doctores add column if not exists exequatur  text;
alter table public.doctores add column if not exists firma_path text;

comment on column public.doctores.exequatur  is 'Número de exequátur. Sin él no se puede emitir una receta.';
comment on column public.doctores.firma_path is 'Ruta en el bucket documentos-clinica de la imagen de firma: {clinica_id}/firmas/{doctor_id}/...';
