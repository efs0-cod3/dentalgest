-- Token para que el QR de la tablilla abra la orden sin pedir cuenta.
--
-- El supervisor del laboratorio no tiene usuario en el sistema, así que el
-- enlace tiene que valer por sí solo. El token es aleatorio e independiente
-- del id: conocer el id de una orden no sirve para abrir ninguna.
--
-- El default también genera token para las órdenes que ya existen. gen_random_uuid()
-- es volátil, así que Postgres reescribe la tabla y le toca un valor distinto
-- a cada fila, que es justo lo que hace falta.
alter table public.ordenes_laboratorio
  add column if not exists verification_token uuid not null default gen_random_uuid();

create unique index if not exists ordenes_laboratorio_verification_token_key
  on public.ordenes_laboratorio (verification_token);

comment on column public.ordenes_laboratorio.verification_token is
  'Token aleatorio para abrir la orden desde el QR de la tablilla, sin sesión.';
