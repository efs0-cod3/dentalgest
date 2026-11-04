-- Verificación del aislamiento por clínica.
--
-- NO es una migración: no cambia nada. Es el archivo que hay que ejecutar
-- después de aplicar 20261104_aislar_por_clinica.sql para comprobar que el
-- aislamiento funciona de verdad y que la app sigue leyendo lo suyo.
--
-- Termina con un `raise exception` a propósito: así imprime los resultados y
-- revierte de paso las filas de prueba que inserta. Que falle es lo normal;
-- lo que importa es el texto de RESULTADOS.
--
-- Los ids están fijos para esta base (dos clínicas reales). En otra, cambiar
-- las cuatro primeras variables.

do $verificacion$
declare
  r  text := '';
  ok boolean := true;
  v_pasteur uuid := '00000000-0000-0000-0000-000000000001';
  v_bolivar uuid := '00000000-0000-0000-0000-000000000002';
  u_pasteur uuid := '746e5e10-786b-40db-9f63-7f006e9cbd41'; -- propietario, Pasteur
  u_bolivar uuid := '3fed25b7-30c2-40a2-8dad-c0888dca2af8'; -- admin, Bolivar
  n int;
begin
  -- ─── 1) anon no ve nada ─────────────────────────────────────────────────────
  set local role anon;
  select count(*) into n from public.pacientes;
  if n <> 0 then ok := false; end if;
  r := r || format('[1] anon: %s pacientes (esperado 0)', n);
  select count(*) into n from public.clinicas;
  if n <> 0 then ok := false; end if;
  r := r || format(', %s clinicas (0)', n);
  select count(*) into n from public.pagos;
  if n <> 0 then ok := false; end if;
  r := r || format(', %s pagos (0). ', n);
  reset role;

  -- ─── 2) la clínica con datos sigue viendo los suyos ─────────────────────────
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', u_pasteur, 'role', 'authenticated')::text, true);

  select count(*) into n from public.pacientes;
  r := r || format('[2] Pasteur: %s pacientes (246)', n);
  if n = 0 then ok := false; end if;
  select count(*) into n from public.citas;              r := r || format(', %s citas (15)', n);
  select count(*) into n from public.expediente_entradas; r := r || format(', %s entradas (13)', n);
  select count(*) into n from public.doctores;            r := r || format(', %s doctores (2)', n);
  select count(*) into n from public.tratamientos;        r := r || format(', %s tratamientos (4)', n);
  select count(*) into n from public.pagos;               r := r || format(', %s pagos (4)', n);
  select count(*) into n from public.deudas;              r := r || format(', %s deudas (3)', n);
  select count(*) into n from public.clinicas;            r := r || format(', %s clinica propia (1). ', n);
  if n <> 1 then ok := false; end if;
  reset role;

  -- ─── 3) la otra clínica no ve nada de la primera ────────────────────────────
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', u_bolivar, 'role', 'authenticated')::text, true);

  select count(*) into n from public.pacientes;
  if n <> 0 then ok := false; end if;
  r := r || format('[3] Bolivar: %s pacientes de Pasteur (0)', n);
  select count(*) into n from public.clinicas;
  if n <> 1 then ok := false; end if;
  r := r || format(', %s clinicas (1, la suya). ', n);

  -- ─── 4) no puede escribir en la clínica ajena ───────────────────────────────
  begin
    insert into public.pacientes (clinica_id, nombre) values (v_pasteur, 'ZZ VERIF CRUZADO');
    ok := false;
    r := r || '[4] FALLO: insertó en la clínica ajena. ';
  exception when others then
    r := r || '[4] insert cruzado bloqueado. ';
  end;

  -- ─── 5) sí puede escribir en la suya ────────────────────────────────────────
  begin
    insert into public.pacientes (clinica_id, nombre) values (v_bolivar, 'ZZ VERIF PROPIO');
    r := r || '[5] insert propio OK. ';
  exception when others then
    ok := false;
    r := r || '[5] FALLO: no pudo escribir en su propia clínica: ' || sqlerrm || '. ';
  end;

  -- ─── 6) no puede mudar una fila de clínica ──────────────────────────────────
  begin
    update public.pacientes set clinica_id = v_pasteur where nombre = 'ZZ VERIF PROPIO';
    get diagnostics n = row_count;
    if n > 0 then
      ok := false;
      r := r || format('[6] FALLO: mudó %s filas a otra clínica. ', n);
    else
      r := r || '[6] update cruzado no tocó filas. ';
    end if;
  exception when others then
    r := r || '[6] mover fila entre clínicas bloqueado. ';
  end;
  reset role;

  raise exception 'RESULTADOS >>> %  ||  VEREDICTO: %', r,
    case when ok then 'TODO EN VERDE' else 'HAY FALLOS, revisar arriba' end;
end
$verificacion$;
