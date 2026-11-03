-- Cerrar el bucket `externos`, que estaba PÚBLICO y sin aislamiento.
--
-- Contenía fotos de trabajos de laboratorio de pacientes identificables, y
-- cualquiera con el enlace las abría sin estar autenticado. Además sus únicas
-- políticas eran `bucket_id = 'externos'` para insert y delete, sin filtro por
-- clínica: cualquier usuario autenticado de CUALQUIER clínica podía subir y
-- borrar archivos de otra.
--
-- Las rutas ya venían organizadas como {clinica_id}/{trabajo_id}/{archivo},
-- así que el aislamiento se puede apoyar en la primera carpeta, igual que en
-- el bucket `documentos`.
--
-- Al momento de aplicarlo no había ninguna foto referenciada en
-- trabajos_externos.fotos (solo dos archivos huérfanos de julio, ambos ya
-- dentro de la carpeta de su clínica), así que no se rompió ningún enlace.
-- El código pasa a guardar la RUTA y a firmar el enlace al mostrarlo;
-- photoStoragePath() sigue aceptando las URLs públicas de filas antiguas.

update storage.buckets set public = false where id = 'externos';

-- Las permisivas de antes: sin filtro por clínica y sin política de lectura
-- (la lectura la daba el bucket público).
drop policy if exists externos_insert_authenticated on storage.objects;
drop policy if exists externos_delete_authenticated on storage.objects;

drop policy if exists externos_select_propia_clinica on storage.objects;
create policy externos_select_propia_clinica on storage.objects
  for select to authenticated
  using (
    bucket_id = 'externos'
    and (storage.foldername(name))[1] = (select p.clinica_id::text from public.perfiles p where p.id = auth.uid())
  );

drop policy if exists externos_insert_propia_clinica on storage.objects;
create policy externos_insert_propia_clinica on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'externos'
    and (storage.foldername(name))[1] = (select p.clinica_id::text from public.perfiles p where p.id = auth.uid())
  );

drop policy if exists externos_update_propia_clinica on storage.objects;
create policy externos_update_propia_clinica on storage.objects
  for update to authenticated
  using (
    bucket_id = 'externos'
    and (storage.foldername(name))[1] = (select p.clinica_id::text from public.perfiles p where p.id = auth.uid())
  );

drop policy if exists externos_delete_propia_clinica on storage.objects;
create policy externos_delete_propia_clinica on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'externos'
    and (storage.foldername(name))[1] = (select p.clinica_id::text from public.perfiles p where p.id = auth.uid())
  );
