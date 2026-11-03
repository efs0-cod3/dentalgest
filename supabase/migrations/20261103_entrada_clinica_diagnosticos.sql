-- Diagnósticos codificados (CIE-10) de cada entrada clínica.
--
-- Una entrada clínica puede tener varios diagnósticos, con o sin pieza dental.
-- El campo de texto libre de la entrada (expediente_entradas.titulo) NO se
-- toca: sigue existiendo como "Notas del diagnóstico" y las entradas antiguas
-- se siguen viendo igual.

-- Necesario para la llave foránea compuesta de abajo: garantiza que un
-- diagnóstico no pueda colgar de una entrada de OTRA clínica. Sin esto, la
-- RLS sola no basta — solo mira el clinica_id de la propia fila, así que un
-- usuario de la clínica B podría insertar un diagnóstico suyo apuntando a una
-- entrada de la clínica A. Comprobado contra la base real.
alter table public.expediente_entradas
  drop constraint if exists expediente_entradas_id_clinica_key;
alter table public.expediente_entradas
  add constraint expediente_entradas_id_clinica_key unique (id, clinica_id);

create table if not exists public.entrada_clinica_diagnosticos (
  id            uuid primary key default gen_random_uuid(),
  clinica_id    uuid not null references public.clinicas(id) on delete cascade,
  entrada_id    uuid not null,
  cie10_codigo  text not null references public.cie10_codigos(codigo),
  pieza_dental  smallint,
  notas         text,
  created_at    timestamptz not null default now(),

  -- Numeración FDI: permanentes 11-18, 21-28, 31-38, 41-48;
  -- temporales 51-55, 61-65, 71-75, 81-85. null = diagnóstico general.
  constraint entrada_clinica_diagnosticos_pieza_fdi check (
    pieza_dental is null
    or (pieza_dental / 10 between 1 and 4 and pieza_dental % 10 between 1 and 8)
    or (pieza_dental / 10 between 5 and 8 and pieza_dental % 10 between 1 and 5)
  ),

  -- Compuesta a propósito: el diagnóstico y su entrada tienen que ser de la
  -- misma clínica. Lo garantiza la estructura, no la política, así que sigue
  -- valiendo aunque mañana alguien afloje la RLS.
  constraint entrada_clinica_diagnosticos_entrada_fkey
    foreign key (entrada_id, clinica_id)
    references public.expediente_entradas (id, clinica_id)
    on delete cascade
);

comment on table  public.entrada_clinica_diagnosticos is 'Diagnósticos CIE-10 de una entrada clínica. Varios por entrada.';
comment on column public.entrada_clinica_diagnosticos.pieza_dental is 'Pieza en numeración FDI (11-48 permanentes, 51-85 temporales). null = diagnóstico general.';

create index if not exists entrada_clinica_diagnosticos_entrada_idx
  on public.entrada_clinica_diagnosticos (entrada_id);

-- Para reportes por diagnóstico dentro de una clínica (reclamaciones a ARS).
create index if not exists entrada_clinica_diagnosticos_clinica_codigo_idx
  on public.entrada_clinica_diagnosticos (clinica_id, cie10_codigo);

alter table public.entrada_clinica_diagnosticos enable row level security;

-- Aislamiento REAL por clínica, en la base y no solo en el código.
-- (Es el patrón de cotizaciones / odontogramas / trabajos_externos. Ojo:
-- expediente_entradas y otras tablas todavía tienen "allow all" y su
-- aislamiento depende del .eq('clinica_id') del código — tema aparte.)
drop policy if exists "clinica_isolation" on public.entrada_clinica_diagnosticos;
create policy "clinica_isolation" on public.entrada_clinica_diagnosticos
  for all
  using      (clinica_id = (select p.clinica_id from public.perfiles p where p.id = auth.uid()))
  with check (clinica_id = (select p.clinica_id from public.perfiles p where p.id = auth.uid()));

-- ── reemplazo atómico del conjunto de diagnósticos de una entrada ────────────
-- Al editar una entrada hay que borrar los que se quitaron e insertar los
-- nuevos; esto lo hace en una sola transacción.
create or replace function public.guardar_diagnosticos_entrada(
  p_entrada_id   uuid,
  p_diagnosticos jsonb
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_clinica_id uuid;
begin
  -- La entrada tiene que pertenecer a la clínica de quien llama. No se confía
  -- en ningún clinica_id que venga del formulario.
  select e.clinica_id into v_clinica_id
  from public.expediente_entradas e
  where e.id = p_entrada_id
    and e.clinica_id = (select p.clinica_id from public.perfiles p where p.id = auth.uid());

  if v_clinica_id is null then
    raise exception 'La entrada clínica no existe o no pertenece a tu clínica.';
  end if;

  delete from public.entrada_clinica_diagnosticos where entrada_id = p_entrada_id;

  insert into public.entrada_clinica_diagnosticos
    (clinica_id, entrada_id, cie10_codigo, pieza_dental, notas)
  select
    v_clinica_id,
    p_entrada_id,
    upper(btrim(d->>'cie10_codigo')),
    nullif(btrim(coalesce(d->>'pieza_dental', '')), '')::smallint,
    nullif(btrim(coalesce(d->>'notas', '')), '')
  from jsonb_array_elements(coalesce(p_diagnosticos, '[]'::jsonb)) d;
end;
$$;

comment on function public.guardar_diagnosticos_entrada(uuid, jsonb) is 'Reemplaza en una sola transacción el conjunto de diagnósticos CIE-10 de una entrada clínica.';

revoke all on function public.guardar_diagnosticos_entrada(uuid, jsonb) from anon;
