-- Cierra el agujero real de RLS: nueve tablas tenían una política llamada
-- "allow all" definida como FOR ALL TO public USING (true), es decir, sin
-- ninguna restricción y para cualquier rol.
--
-- Verificado contra la base real antes de escribir esto, usando la clave
-- pública (rol anon), la misma que viaja dentro del bundle del navegador:
--
--   anon ve        >>> pacientes=246  pagos=4  expediente=13
--   anon escritura >>> SI pudo INSERTAR | SI pudo ACTUALIZAR | SI pudo BORRAR
--
-- (La prueba de escritura corrió dentro de una transacción que se abortó sola;
--  no quedó ninguna fila.)
--
-- El linter de Supabase no avisa de esto: no tiene regla para "la política
-- dice true". Sus avisos eran solo los search_path y los SECURITY DEFINER,
-- así que un repaso guiado por los advisors pasa por encima del problema.
--
-- Se comprobó también que las nueve tablas tienen clinica_id poblado
-- (0 filas nulas), así que el aislamiento no esconde datos existentes, y que
-- todos los insert de la app mandan clinica_id explícito, así que el
-- WITH CHECK no rompe ninguna escritura.
--
-- Las páginas públicas —verificar/:id, verificar-trabajo/:id,
-- verificar-factura/:id, reservar/:token y unirse/:token— no se ven afectadas:
-- usan el cliente admin (service_role), que tiene rolbypassrls y no pasa por
-- RLS. Se verificó en pg_roles.

-- ─── 1) Las ocho tablas con columna clinica_id ────────────────────────────────
--
-- Una sola política FOR ALL con USING y WITH CHECK, igual que config_clinica y
-- pagos_externos. El WITH CHECK es lo que impide además mudar una fila de una
-- clínica a otra con un update.
--
-- TO authenticated y no al rol público: anon nunca satisface el predicado
-- (auth.uid() es null), pero dejarlo fuera evita evaluar la subconsulta y
-- deja la intención escrita.
--
-- auth.uid() va envuelto en (select ...) para que el planificador lo evalúe
-- una vez por consulta y no una vez por fila.

do $$
declare
  t text;
begin
  foreach t in array array[
    'pacientes', 'pagos', 'citas', 'deudas',
    'documentos', 'expediente_entradas', 'doctores', 'tratamientos'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    -- %I y no %L: el nombre de una política es un identificador, y lleva
    -- comillas dobles porque tiene un espacio.
    execute format('drop policy if exists %I on public.%I', 'allow all', t);
    execute format('drop policy if exists clinica_isolation on public.%I', t);
    execute format($p$
      create policy clinica_isolation on public.%I
        for all
        to authenticated
        using (
          clinica_id = (
            select p.clinica_id from public.perfiles p where p.id = (select auth.uid())
          )
        )
        with check (
          clinica_id = (
            select p.clinica_id from public.perfiles p where p.id = (select auth.uid())
          )
        )
    $p$, t);
  end loop;
end
$$;

-- ─── 2) clinicas: se filtra por id, no por clinica_id ─────────────────────────
--
-- Cada lectura de esta tabla en la app es .eq('id', clinicaId) con la clínica
-- de la sesión, o un join desde el propio perfil. Las dos excepciones
-- (reservar/:token y unirse/:token) van por el cliente admin.

alter table public.clinicas enable row level security;
drop policy if exists "allow all" on public.clinicas;
drop policy if exists clinica_isolation on public.clinicas;

create policy clinica_isolation on public.clinicas
  for all
  to authenticated
  using (
    id = (select p.clinica_id from public.perfiles p where p.id = (select auth.uid()))
  )
  with check (
    id = (select p.clinica_id from public.perfiles p where p.id = (select auth.uid()))
  );
