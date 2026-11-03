-- Bucket privado para la firma del doctor, el sello y el logo de la clínica.
--
-- PRIVADO a propósito: una firma suelta en una URL pública es un problema
-- serio. Las imágenes se muestran siempre con signed URLs de corta duración
-- generadas en el servidor. (Ojo: el bucket `externos` que ya existe SÍ es
-- público, así que no sirve para esto.)
--
-- Rutas:
--   {clinica_id}/sello/...
--   {clinica_id}/logo/...
--   {clinica_id}/firmas/{doctor_id}/...

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos-clinica', 'documentos-clinica', false, 1048576, array['image/png', 'image/jpeg'])
on conflict (id) do update set
  public             = false,
  file_size_limit    = 1048576,
  allowed_mime_types = array['image/png', 'image/jpeg'];

-- ── lectura: cualquiera de la clínica ────────────────────────────────────────
-- Hace falta para que la receta se pueda reimprimir desde recepción.
drop policy if exists docclinica_select_propia_clinica on storage.objects;
create policy docclinica_select_propia_clinica on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documentos-clinica'
    and (storage.foldername(name))[1] = (select p.clinica_id::text from public.perfiles p where p.id = auth.uid())
  );

-- ── sello y logo: solo propietario o admin ───────────────────────────────────
drop policy if exists docclinica_sello_insert on storage.objects;
create policy docclinica_sello_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documentos-clinica'
    and (storage.foldername(name))[1] = (select p.clinica_id::text from public.perfiles p where p.id = auth.uid())
    and (storage.foldername(name))[2] in ('sello', 'logo')
    and exists (select 1 from public.perfiles p where p.id = auth.uid() and p.rol in ('propietario', 'admin'))
  );

drop policy if exists docclinica_sello_update on storage.objects;
create policy docclinica_sello_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'documentos-clinica'
    and (storage.foldername(name))[1] = (select p.clinica_id::text from public.perfiles p where p.id = auth.uid())
    and (storage.foldername(name))[2] in ('sello', 'logo')
    and exists (select 1 from public.perfiles p where p.id = auth.uid() and p.rol in ('propietario', 'admin'))
  );

drop policy if exists docclinica_sello_delete on storage.objects;
create policy docclinica_sello_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documentos-clinica'
    and (storage.foldername(name))[1] = (select p.clinica_id::text from public.perfiles p where p.id = auth.uid())
    and (storage.foldername(name))[2] in ('sello', 'logo')
    and exists (select 1 from public.perfiles p where p.id = auth.uid() and p.rol in ('propietario', 'admin'))
  );

-- ── firma: solo el propio doctor ─────────────────────────────────────────────
-- Ni un admin puede subir la firma de otro: la firma es personal.
drop policy if exists docclinica_firma_propia_insert on storage.objects;
create policy docclinica_firma_propia_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documentos-clinica'
    and (storage.foldername(name))[1] = (select p.clinica_id::text from public.perfiles p where p.id = auth.uid())
    and (storage.foldername(name))[2] = 'firmas'
    and (storage.foldername(name))[3] = (select p.doctor_id::text from public.perfiles p where p.id = auth.uid())
  );

drop policy if exists docclinica_firma_propia_update on storage.objects;
create policy docclinica_firma_propia_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'documentos-clinica'
    and (storage.foldername(name))[1] = (select p.clinica_id::text from public.perfiles p where p.id = auth.uid())
    and (storage.foldername(name))[2] = 'firmas'
    and (storage.foldername(name))[3] = (select p.doctor_id::text from public.perfiles p where p.id = auth.uid())
  );

drop policy if exists docclinica_firma_propia_delete on storage.objects;
create policy docclinica_firma_propia_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documentos-clinica'
    and (storage.foldername(name))[1] = (select p.clinica_id::text from public.perfiles p where p.id = auth.uid())
    and (storage.foldername(name))[2] = 'firmas'
    and (storage.foldername(name))[3] = (select p.doctor_id::text from public.perfiles p where p.id = auth.uid())
  );
