-- Token aleatorio e independiente del ID para verificar recetas sin exponer
-- datos clínicos. El valor por defecto también genera tokens para recetas previas.
alter table public.prescripciones
  add column if not exists verification_token uuid not null default gen_random_uuid();

create unique index if not exists prescripciones_verification_token_key
  on public.prescripciones (verification_token);

comment on column public.prescripciones.verification_token is
  'Token aleatorio para validar públicamente la autenticidad de la receta. No contiene datos del paciente.';
