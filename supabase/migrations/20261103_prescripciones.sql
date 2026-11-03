-- Recetas (prescripciones) médicas.
--
-- Una receta es un documento médico: una vez emitida no se edita ni se borra,
-- solo se anula, y siempre se puede reimprimir tal como salió. Eso se
-- garantiza en la base, no solo en la app:
--   * no hay política de delete para los roles de la app;
--   * un trigger impide modificar una receta emitida salvo para anularla;
--   * el snapshot congela los datos del doctor, la clínica y el paciente.

-- ── llaves únicas para las foráneas compuestas ───────────────────────────────
-- Igual que en los diagnósticos CIE-10: la receta y todo lo que referencia
-- tienen que ser de la misma clínica, y eso lo garantiza la estructura.
-- Se añaden solo si faltan: la de expediente_entradas puede venir ya de la
-- migración de diagnósticos CIE-10, y su llave foránea depende del índice, así
-- que recrearla a ciegas falla.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pacientes_id_clinica_key') then
    alter table public.pacientes add constraint pacientes_id_clinica_key unique (id, clinica_id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'doctores_id_clinica_key') then
    alter table public.doctores add constraint doctores_id_clinica_key unique (id, clinica_id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'expediente_entradas_id_clinica_key') then
    alter table public.expediente_entradas add constraint expediente_entradas_id_clinica_key unique (id, clinica_id);
  end if;
end $$;

-- ── numeración por clínica ───────────────────────────────────────────────────
-- Una tabla de secuencias y no max()+1: el "on conflict do update returning"
-- toma un bloqueo de fila, así que dos emisiones simultáneas en la misma
-- clínica nunca sacan el mismo número.
create table if not exists public.prescripcion_secuencias (
  clinica_id uuid primary key references public.clinicas(id) on delete cascade,
  ultimo     integer not null default 0
);

alter table public.prescripcion_secuencias enable row level security;
-- Sin políticas: nadie la toca directamente, solo la función de abajo.

-- Sin parámetro a propósito: la clínica sale de la sesión, así que nadie puede
-- tocar el contador de otra clínica. Lo peor que logra quien la llame suelta es
-- dejar un hueco en su propia numeración.
create or replace function public.siguiente_numero_prescripcion()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinica uuid;
  v_numero  integer;
begin
  select p.clinica_id into v_clinica from public.perfiles p where p.id = auth.uid();
  if v_clinica is null then
    raise exception 'Tu sesión no está asociada a una clínica.';
  end if;

  insert into public.prescripcion_secuencias (clinica_id, ultimo)
  values (v_clinica, 1)
  on conflict (clinica_id) do update
    set ultimo = prescripcion_secuencias.ultimo + 1
  returning ultimo into v_numero;

  return v_numero;
end;
$$;

revoke all on function public.siguiente_numero_prescripcion() from anon;

-- ── recetas ──────────────────────────────────────────────────────────────────
create table if not exists public.prescripciones (
  id                     uuid primary key default gen_random_uuid(),
  clinica_id             uuid not null references public.clinicas(id) on delete cascade,
  numero                 integer not null,
  paciente_id            uuid not null,
  doctor_id              uuid not null,
  consulta_id            uuid,
  fecha                  date not null default current_date,
  indicaciones_generales text,
  estado                 text not null default 'emitida',
  anulada_por            uuid references public.perfiles(id),
  anulada_en             timestamptz,
  motivo_anulacion       text,
  -- Copia de los datos al momento de emitir. Si el doctor cambia su exequátur
  -- o la clínica cambia de sello, las recetas viejas no se alteran.
  snapshot               jsonb not null,
  created_at             timestamptz not null default now(),

  constraint prescripciones_estado_valido check (estado in ('emitida', 'anulada')),
  constraint prescripciones_numero_por_clinica unique (clinica_id, numero),
  constraint prescripciones_id_clinica_key unique (id, clinica_id),

  constraint prescripciones_paciente_fkey foreign key (paciente_id, clinica_id)
    references public.pacientes (id, clinica_id) on delete restrict,
  constraint prescripciones_doctor_fkey foreign key (doctor_id, clinica_id)
    references public.doctores (id, clinica_id) on delete restrict,
  constraint prescripciones_consulta_fkey foreign key (consulta_id, clinica_id)
    references public.expediente_entradas (id, clinica_id) on delete set null,

  -- Anular exige motivo y fecha; una receta emitida no los lleva.
  constraint prescripciones_anulacion_coherente check (
    (estado = 'emitida'
      and anulada_por is null and anulada_en is null and motivo_anulacion is null)
    or
    (estado = 'anulada'
      and anulada_en is not null and coalesce(btrim(motivo_anulacion), '') <> '')
  )
);

comment on table  public.prescripciones is 'Recetas médicas. Inmutables una vez emitidas: solo se anulan.';
comment on column public.prescripciones.snapshot is 'Datos congelados al emitir: doctor, exequátur, especialidad, clínica, paciente y rutas de firma y sello usadas.';

create index if not exists prescripciones_paciente_idx on public.prescripciones (paciente_id);
create index if not exists prescripciones_clinica_fecha_idx on public.prescripciones (clinica_id, fecha desc);
create index if not exists prescripciones_consulta_idx on public.prescripciones (consulta_id);

-- ── medicamentos de la receta ────────────────────────────────────────────────
create table if not exists public.prescripcion_items (
  id              uuid primary key default gen_random_uuid(),
  clinica_id      uuid not null references public.clinicas(id) on delete cascade,
  prescripcion_id uuid not null,
  orden           smallint not null default 1,
  medicamento     text not null,
  presentacion    text,
  dosis           text not null,
  via             text,
  frecuencia      text not null,
  duracion        text,
  cantidad        text,
  indicaciones    text,

  constraint prescripcion_items_prescripcion_fkey foreign key (prescripcion_id, clinica_id)
    references public.prescripciones (id, clinica_id) on delete cascade
);

create index if not exists prescripcion_items_prescripcion_idx
  on public.prescripcion_items (prescripcion_id, orden);

-- ── inmutabilidad ────────────────────────────────────────────────────────────
create or replace function public.prescripcion_solo_anulable()
returns trigger
language plpgsql
as $$
begin
  if old.estado = 'anulada' then
    raise exception 'Una receta anulada no se puede modificar.';
  end if;

  -- Desde "emitida" lo único permitido es pasar a "anulada" sin tocar nada más.
  if new.estado = 'anulada'
     and new.id          = old.id
     and new.clinica_id  = old.clinica_id
     and new.numero      = old.numero
     and new.paciente_id = old.paciente_id
     and new.doctor_id   = old.doctor_id
     and new.fecha       = old.fecha
     and new.snapshot    = old.snapshot
     and coalesce(new.consulta_id::text, '')            = coalesce(old.consulta_id::text, '')
     and coalesce(new.indicaciones_generales, '')       = coalesce(old.indicaciones_generales, '')
  then
    return new;
  end if;

  raise exception 'Una receta emitida no se puede editar; solo se puede anular.';
end;
$$;

drop trigger if exists prescripciones_solo_anulable on public.prescripciones;
create trigger prescripciones_solo_anulable
  before update on public.prescripciones
  for each row execute function public.prescripcion_solo_anulable();

create or replace function public.prescripcion_item_inmutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Los medicamentos de una receta emitida no se pueden modificar.';
end;
$$;

drop trigger if exists prescripcion_items_inmutables on public.prescripcion_items;
create trigger prescripcion_items_inmutables
  before update on public.prescripcion_items
  for each row execute function public.prescripcion_item_inmutable();

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Aislamiento real por clínica. A PROPÓSITO no hay política de delete: ningún
-- rol de la app puede borrar una receta ni sus medicamentos.
alter table public.prescripciones     enable row level security;
alter table public.prescripcion_items enable row level security;

drop policy if exists prescripciones_select on public.prescripciones;
create policy prescripciones_select on public.prescripciones
  for select using (clinica_id = (select p.clinica_id from public.perfiles p where p.id = auth.uid()));

drop policy if exists prescripciones_insert on public.prescripciones;
create policy prescripciones_insert on public.prescripciones
  for insert with check (clinica_id = (select p.clinica_id from public.perfiles p where p.id = auth.uid()));

drop policy if exists prescripciones_update on public.prescripciones;
create policy prescripciones_update on public.prescripciones
  for update
  using      (clinica_id = (select p.clinica_id from public.perfiles p where p.id = auth.uid()))
  with check (clinica_id = (select p.clinica_id from public.perfiles p where p.id = auth.uid()));

drop policy if exists prescripcion_items_select on public.prescripcion_items;
create policy prescripcion_items_select on public.prescripcion_items
  for select using (clinica_id = (select p.clinica_id from public.perfiles p where p.id = auth.uid()));

drop policy if exists prescripcion_items_insert on public.prescripcion_items;
create policy prescripcion_items_insert on public.prescripcion_items
  for insert with check (clinica_id = (select p.clinica_id from public.perfiles p where p.id = auth.uid()));

-- ── emitir ───────────────────────────────────────────────────────────────────
-- Receta + medicamentos en una sola transacción. La clínica y el doctor salen
-- de la sesión, nunca del formulario. El snapshot lo arma la app y se guarda
-- tal cual.
create or replace function public.emitir_prescripcion(
  p_paciente_id uuid,
  p_consulta_id uuid,
  p_indicaciones text,
  p_items jsonb,
  p_snapshot jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_clinica   uuid;
  v_doctor    uuid;
  v_rol       text;
  v_exequatur text;
  v_numero    integer;
  v_id        uuid;
begin
  select p.clinica_id, p.doctor_id, p.rol
    into v_clinica, v_doctor, v_rol
  from public.perfiles p where p.id = auth.uid();

  if v_clinica is null then
    raise exception 'Tu sesión no está asociada a una clínica.';
  end if;
  if v_rol not in ('propietario', 'admin', 'doctor') then
    raise exception 'Tu rol no permite emitir recetas.';
  end if;
  if v_doctor is null then
    raise exception 'Tu cuenta no está ligada a un doctor. Pide que la vinculen en Configuración → Equipo.';
  end if;

  select d.exequatur into v_exequatur
  from public.doctores d
  where d.id = v_doctor and d.clinica_id = v_clinica;

  if coalesce(btrim(v_exequatur), '') = '' then
    raise exception 'Carga tu exequátur en Configuración → Mi perfil antes de emitir recetas.';
  end if;

  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'La receta necesita al menos un medicamento.';
  end if;

  v_numero := public.siguiente_numero_prescripcion();

  insert into public.prescripciones
    (clinica_id, numero, paciente_id, doctor_id, consulta_id, indicaciones_generales, estado, snapshot)
  values
    (v_clinica, v_numero, p_paciente_id, v_doctor, p_consulta_id,
     nullif(btrim(coalesce(p_indicaciones, '')), ''), 'emitida', p_snapshot)
  returning id into v_id;

  insert into public.prescripcion_items
    (clinica_id, prescripcion_id, orden, medicamento, presentacion, dosis, via, frecuencia, duracion, cantidad, indicaciones)
  select
    v_clinica,
    v_id,
    coalesce((it->>'orden')::smallint, (ordinalidad)::smallint),
    btrim(it->>'medicamento'),
    nullif(btrim(coalesce(it->>'presentacion', '')), ''),
    btrim(it->>'dosis'),
    nullif(btrim(coalesce(it->>'via', '')), ''),
    btrim(it->>'frecuencia'),
    nullif(btrim(coalesce(it->>'duracion', '')), ''),
    nullif(btrim(coalesce(it->>'cantidad', '')), ''),
    nullif(btrim(coalesce(it->>'indicaciones', '')), '')
  from jsonb_array_elements(p_items) with ordinality as t(it, ordinalidad);

  return v_id;
end;
$$;

comment on function public.emitir_prescripcion(uuid, uuid, text, jsonb, jsonb) is 'Emite una receta con sus medicamentos en una transacción. Clínica y doctor salen de la sesión; exige exequátur.';

revoke all on function public.emitir_prescripcion(uuid, uuid, text, jsonb, jsonb) from anon;

-- ── anular ───────────────────────────────────────────────────────────────────
-- Puede anular el doctor que la emitió, o el propietario / admin de la clínica.
create or replace function public.anular_prescripcion(
  p_id uuid,
  p_motivo text
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_clinica  uuid;
  v_doctor   uuid;
  v_rol      text;
  v_emisor   uuid;
  v_estado   text;
begin
  if coalesce(btrim(coalesce(p_motivo, '')), '') = '' then
    raise exception 'Para anular una receta hace falta indicar el motivo.';
  end if;

  select p.clinica_id, p.doctor_id, p.rol
    into v_clinica, v_doctor, v_rol
  from public.perfiles p where p.id = auth.uid();

  select r.doctor_id, r.estado into v_emisor, v_estado
  from public.prescripciones r
  where r.id = p_id and r.clinica_id = v_clinica;

  if v_emisor is null then
    raise exception 'La receta no existe o no pertenece a tu clínica.';
  end if;
  if v_estado = 'anulada' then
    raise exception 'Esa receta ya está anulada.';
  end if;
  if not (v_rol in ('propietario', 'admin') or v_emisor = v_doctor) then
    raise exception 'Solo el doctor que la emitió, o un admin de la clínica, puede anular una receta.';
  end if;

  update public.prescripciones
     set estado = 'anulada',
         anulada_por = auth.uid(),
         anulada_en = now(),
         motivo_anulacion = btrim(p_motivo)
   where id = p_id and clinica_id = v_clinica;
end;
$$;

comment on function public.anular_prescripcion(uuid, text) is 'Anula una receta con motivo obligatorio. Solo el doctor emisor o un admin de la clínica.';

revoke all on function public.anular_prescripcion(uuid, text) from anon;
