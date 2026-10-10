-- =====================================================================
-- Jurídico · migración 0039 · tope de una corrida completa al día contra el PJUD
--
-- El 9-10 oct 2026 la implementación, varias pruebas, la sincronización completa (~230 causas) y la descarga de PDFs
-- corrieron el mismo día desde la misma IP de la oficina; al día siguiente el cortafuegos F5 empezó a interponer su
-- desafío JavaScript a esa IP (antes pasaba limpio). Consistente con la propia regla del proyecto («volumen alto desde
-- una sola IP en ventana corta es llamativo»), este tope impide que se repita: pjud-sync.mts y pjud-download-docs.mts
-- piden permiso antes de tocar la OJV y, si ya hubo una corrida hoy (hora de Chile) de ese mismo tipo, se detienen sin
-- hacer ninguna consulta. --solo (una causa) también cuenta: una prueba manual consume el cupo del día igual que la
-- corrida completa, que es exactamente el hábito que se quiere evitar.
--
-- No hay bandera de línea de comandos para saltárselo: levantar el bloqueo antes de que pase un día es una decisión
-- consciente (npm run db:sql -- "update pjud_corridas set estado='completa' where id='...'"), no una opción rápida.
-- =====================================================================

create table if not exists public.pjud_corridas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('sync', 'docs')),
  origen text,                                  -- de dónde corrió (oficina, fly-gru…), para diagnosticar
  iniciado_at timestamptz not null default now(),
  terminado_at timestamptz,
  estado text not null default 'corriendo' check (estado in ('corriendo', 'completa', 'bloqueada', 'parcial')),
  ok int not null default 0,
  fallas int not null default 0,
  peticiones int not null default 0
);
create index if not exists pjud_corridas_tipo_fecha_idx on public.pjud_corridas (tipo, iniciado_at desc);

/**
 * Pide permiso para empezar una corrida contra la OJV. Bloquea si hoy (hora de Chile) ya hay, para el mismo tipo:
 *  - una corrida 'completa', 'bloqueada' o 'parcial' (ya se tocó al PJUD hoy, con ese resultado), o
 *  - una corrida 'corriendo' iniciada hace menos de 4 horas (las de verdad no tardan tanto: ~20 min la sincronización
 *    completa de las ~230 causas; más larga la de documentos si hay muchos PDFs nuevos, pero no tanto).
 * Una fila 'corriendo' de hace más de 4 horas se entiende abandonada (el proceso murió sin cerrar) y no bloquea, pero
 * queda en la tabla para que se note en el historial.
 * Devuelve el id de la corrida nueva; lanza una excepción con el motivo si está bloqueado (el script la muestra y sale).
 */
create or replace function public.pjud_corrida_iniciar(p_tipo text, p_origen text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_bloqueo record; v_id uuid;
begin
  if not public.pjud_puede_escribir() then raise exception 'Sin permiso para registrar corridas del Poder Judicial'; end if;
  select * into v_bloqueo
    from public.pjud_corridas
   where tipo = p_tipo
     and (iniciado_at at time zone 'America/Santiago')::date = (now() at time zone 'America/Santiago')::date
     and (estado in ('completa', 'bloqueada', 'parcial') or (estado = 'corriendo' and iniciado_at > now() - interval '4 hours'))
   order by iniciado_at desc
   limit 1;
  if v_bloqueo.id is not null then
    raise exception 'Ya hubo una corrida "%" hoy (% hora de Chile, estado %): no se vuelve a tocar el PJUD el mismo día. Si de verdad hace falta otra, revisar primero por qué y levantar el tope a mano en pjud_corridas.',
      p_tipo, to_char(v_bloqueo.iniciado_at at time zone 'America/Santiago', 'HH24:MI'), v_bloqueo.estado;
  end if;
  insert into public.pjud_corridas (tipo, origen) values (p_tipo, p_origen) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.pjud_corrida_iniciar(text, text) from public, anon;
grant execute on function public.pjud_corrida_iniciar(text, text) to authenticated, service_role;

/** Cierra una corrida con su resultado (completa = terminó sola; bloqueada = la detuvo un PjudBloqueado; parcial = otro corte). */
create or replace function public.pjud_corrida_terminar(p_id uuid, p_estado text, p_ok int default 0, p_fallas int default 0, p_peticiones int default 0) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.pjud_puede_escribir() then raise exception 'Sin permiso para registrar corridas del Poder Judicial'; end if;
  if p_estado not in ('completa', 'bloqueada', 'parcial') then raise exception 'Estado de corrida inválido: %', p_estado; end if;
  update public.pjud_corridas set estado = p_estado, ok = p_ok, fallas = p_fallas, peticiones = p_peticiones, terminado_at = now() where id = p_id;
end $$;
revoke all on function public.pjud_corrida_terminar(uuid, text, int, int, int) from public, anon;
grant execute on function public.pjud_corrida_terminar(uuid, text, int, int, int) to authenticated, service_role;

alter table public.pjud_corridas enable row level security;
drop policy if exists "pjud corridas: ver" on public.pjud_corridas;
create policy "pjud corridas: ver" on public.pjud_corridas for select using ((select public.has_permission('legal.view')));
grant select on public.pjud_corridas to authenticated;
