-- Restringe las modificaciones directas que una cuenta puede hacer en su propio perfil.
-- El onboarding solo necesita guardar el nombre y la fecha de bienvenida.
-- Los cambios de rol y de doctor vinculado siguen realizándose en rutas de servidor
-- con el cliente administrativo, después de validar al gestor y la clínica.

revoke update on table public.perfiles from anon, authenticated;

grant update (nombre, onboarding_visto_at)
  on table public.perfiles
  to authenticated;
