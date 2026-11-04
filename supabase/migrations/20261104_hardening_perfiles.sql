-- Restringe las modificaciones directas que una cuenta puede hacer en su propio perfil.
-- El onboarding solo necesita guardar el nombre y la fecha de bienvenida.
-- Los cambios de rol y de doctor vinculado siguen realizándose en rutas de servidor
-- con el cliente administrativo, después de validar al gestor y la clínica.

revoke update on table public.perfiles from anon, authenticated;

grant update (nombre, onboarding_visto_at)
  on table public.perfiles
  to authenticated;

-- Reserva temporal para impedir registros concurrentes sin dejar el enlace
-- bloqueado permanentemente si el proceso del servidor se interrumpe.
alter table public.invitaciones
  add column if not exists reclamo_at timestamptz;
