-- Catálogo CIE-10 (OMS) de diagnósticos.
--
-- Es un catálogo GLOBAL compartido por todas las clínicas: no lleva
-- clinica_id y solo se modifica por migración. Las clínicas únicamente leen.
--
-- Códigos de la CIE-10 de la OMS: categoría de 3 caracteres (K02) y
-- subcategoría de 4 (K02.1). No se usa ICD-10-CM de EE. UU., que llega a 5+
-- caracteres (K02.51).

create extension if not exists unaccent with schema extensions;

create table if not exists public.cie10_codigos (
  codigo       text primary key,
  descripcion  text not null,
  categoria    text not null,
  es_categoria boolean not null default false,
  activo       boolean not null default true
);

comment on table  public.cie10_codigos is 'Catálogo CIE-10 (OMS) global, compartido por todas las clínicas. Solo se modifica por migración.';
comment on column public.cie10_codigos.categoria is 'Código de 3 caracteres al que pertenece la fila (K02.1 → K02).';
comment on column public.cie10_codigos.es_categoria is 'true en las filas de 3 caracteres; se excluyen del autocompletado.';
comment on column public.cie10_codigos.activo is 'false oculta el código sin borrarlo ni romper los diagnósticos que ya lo usan.';

create index if not exists cie10_codigos_categoria_idx on public.cie10_codigos (categoria);

alter table public.cie10_codigos enable row level security;

-- Lectura para cualquier usuario autenticado. A propósito NO hay políticas de
-- insert/update/delete: el catálogo solo cambia por migración.
drop policy if exists "cie10 lectura autenticada" on public.cie10_codigos;
create policy "cie10 lectura autenticada" on public.cie10_codigos
  for select to authenticated using (true);

-- ── búsqueda ──────────────────────────────────────────────────────────────────
-- El catálogo es pequeño (cientos de filas), así que un ilike alcanza y no hace
-- falta pg_trgm. unaccent hace que "pulpitis" encuentre "Pulpítis" y al revés.
-- security invoker: respeta la RLS de arriba, así que anon no obtiene nada.
create or replace function public.buscar_cie10(q text)
returns setof public.cie10_codigos
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select c.*
  from public.cie10_codigos c
  where c.activo
    and not c.es_categoria
    and (
      extensions.unaccent(c.codigo)      ilike extensions.unaccent(q) || '%'
      or extensions.unaccent(c.descripcion) ilike '%' || extensions.unaccent(q) || '%'
    )
  order by
    -- primero lo que empieza por lo buscado, después lo que solo lo contiene
    case
      when extensions.unaccent(c.codigo)      ilike extensions.unaccent(q) || '%' then 0
      when extensions.unaccent(c.descripcion) ilike extensions.unaccent(q) || '%' then 1
      else 2
    end,
    c.codigo
  limit 20
$$;

comment on function public.buscar_cie10(text) is 'Autocompletado del catálogo CIE-10: máximo 20 filas activas y no-categoría, priorizando coincidencias por prefijo.';

revoke all on function public.buscar_cie10(text) from anon;
