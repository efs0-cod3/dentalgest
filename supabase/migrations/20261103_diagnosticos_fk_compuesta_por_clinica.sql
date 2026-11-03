-- Correctivo para bases donde 20261103_entrada_clinica_diagnosticos.sql ya se
-- aplicó con la llave foránea simple. En una base nueva no hace nada: aquel
-- archivo ya crea la compuesta.
--
-- Por qué: la política RLS solo comprobaba el clinica_id de la propia fila.
-- Se verificó contra la base real que un usuario de la clínica B podía
-- insertar un diagnóstico marcado como suyo apuntando a una entrada clínica
-- de la clínica A. No la leía, pero la contaminaba. Con la llave compuesta el
-- intento falla en la estructura.

alter table public.expediente_entradas
  drop constraint if exists expediente_entradas_id_clinica_key;
alter table public.expediente_entradas
  add constraint expediente_entradas_id_clinica_key unique (id, clinica_id);

alter table public.entrada_clinica_diagnosticos
  drop constraint if exists entrada_clinica_diagnosticos_entrada_id_fkey;

alter table public.entrada_clinica_diagnosticos
  drop constraint if exists entrada_clinica_diagnosticos_entrada_fkey;
alter table public.entrada_clinica_diagnosticos
  add constraint entrada_clinica_diagnosticos_entrada_fkey
  foreign key (entrada_id, clinica_id)
  references public.expediente_entradas (id, clinica_id)
  on delete cascade;
