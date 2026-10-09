-- =====================================================================
-- Jurídico · migración 0035 · datos del Poder Judicial (Oficina Judicial Virtual) por causa
--
-- · pjud_causa_data: la última lectura de la consulta unificada para cada causa (cabecera, partes, cuadernos con sus
--   actuaciones), con cuándo se sincronizó y el último error. Una fila por causa (client_id).
-- · pjud_tribunales: códigos de tribunal civil de la OJV, para buscar por rol sin ambigüedad.
-- · Se escribe solo por pjud_guardar / pjud_guardar_tribunales: desde el cron (service_role) o desde la app por un
--   usuario con legal.edit («Sincronizar ahora»). Se lee con legal.view.
-- =====================================================================

create table if not exists public.pjud_causa_data (
  client_id uuid primary key references public.legal_clients (id) on delete cascade,
  rol text not null,
  tribunal text not null,
  tribunal_codigo int,
  caratulado text,
  fecha_ingreso date,
  estado_adm text,
  estado_proc text,
  procedimiento text,
  etapa text,
  ubicacion text,
  partes jsonb not null default '[]'::jsonb,      -- [{tipo, sujeto, nombre, rut, persona}]
  cuadernos jsonb not null default '[]'::jsonb,   -- [{nombre, actuaciones: [{folio, etapa, tramite, descripcion, fecha_diligencia, fecha_registro, foja, tiene_documento}]}]
  actuaciones int not null default 0,
  ultima_actuacion date,
  synced_at timestamptz,
  error text,
  error_at timestamptz,
  peticiones int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pjud_causa_data_synced_idx on public.pjud_causa_data (synced_at);
create index if not exists pjud_causa_data_error_idx on public.pjud_causa_data (error_at) where error is not null;

create table if not exists public.pjud_tribunales (
  codigo int primary key,
  nombre text not null,
  nombre_norm text not null,
  corte int not null,
  corte_nombre text,
  updated_at timestamptz not null default now()
);
create index if not exists pjud_tribunales_norm_idx on public.pjud_tribunales (nombre_norm);

alter table public.pjud_causa_data enable row level security;
alter table public.pjud_tribunales enable row level security;
drop policy if exists "pjud: ver" on public.pjud_causa_data;
create policy "pjud: ver" on public.pjud_causa_data for select using ((select public.has_permission('legal.view')));
drop policy if exists "pjud tribunales: ver" on public.pjud_tribunales;
create policy "pjud tribunales: ver" on public.pjud_tribunales for select using ((select public.has_permission('legal.view')));
grant select on public.pjud_causa_data, public.pjud_tribunales to authenticated;

-- Quién puede escribir: el cron (clave service_role) o un usuario con legal.edit
create or replace function public.pjud_puede_escribir() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.role() = 'service_role' or (auth.uid() is not null and public.has_permission('legal.edit'))
$$;
revoke all on function public.pjud_puede_escribir() from public, anon;

/** Guarda una lectura buena (p_data con la forma de DetalleCausa) o un error (p_error), conservando los datos previos. */
create or replace function public.pjud_guardar(p_client uuid, p_data jsonb default null, p_error text default null) returns void
language plpgsql security definer set search_path = public as $$
declare c record; n_act int; ult date;
begin
  if not public.pjud_puede_escribir() then raise exception 'Sin permiso para guardar datos del Poder Judicial'; end if;
  select id, rol, tribunal into c from public.legal_clients where id = p_client;
  if c is null then raise exception 'Causa no encontrada'; end if;
  if p_data is null then
    insert into public.pjud_causa_data (client_id, rol, tribunal, error, error_at)
    values (p_client, coalesce(c.rol, ''), coalesce(c.tribunal, ''), left(p_error, 1000), now())
    on conflict (client_id) do update set error = excluded.error, error_at = now(), updated_at = now();
    return;
  end if;
  select count(*)::int, max((a->>'fecha_registro')::date)
    into n_act, ult
    from jsonb_array_elements(coalesce(p_data->'cuadernos', '[]'::jsonb)) q, jsonb_array_elements(coalesce(q->'actuaciones', '[]'::jsonb)) a
   where nullif(a->>'fecha_registro', '') is not null;
  insert into public.pjud_causa_data (client_id, rol, tribunal, tribunal_codigo, caratulado, fecha_ingreso, estado_adm, estado_proc, procedimiento, etapa, ubicacion, partes, cuadernos, actuaciones, ultima_actuacion, synced_at, error, error_at, peticiones)
  values (p_client, coalesce(p_data->>'rol', c.rol, ''), coalesce(p_data->>'tribunal', c.tribunal, ''), nullif(p_data->>'tribunal_codigo', '')::int, p_data->>'caratulado', nullif(p_data->>'fecha_ingreso', '')::date,
          p_data->>'estado_adm', p_data->>'estado_proc', p_data->>'procedimiento', p_data->>'etapa', p_data->>'ubicacion',
          coalesce(p_data->'partes', '[]'::jsonb), coalesce(p_data->'cuadernos', '[]'::jsonb), coalesce(n_act, 0), ult, now(), null, null, nullif(p_data->>'peticiones', '')::int)
  on conflict (client_id) do update set
    rol = excluded.rol, tribunal = excluded.tribunal, tribunal_codigo = excluded.tribunal_codigo, caratulado = excluded.caratulado,
    fecha_ingreso = excluded.fecha_ingreso, estado_adm = excluded.estado_adm, estado_proc = excluded.estado_proc, procedimiento = excluded.procedimiento,
    etapa = excluded.etapa, ubicacion = excluded.ubicacion, partes = excluded.partes, cuadernos = excluded.cuadernos, actuaciones = excluded.actuaciones,
    ultima_actuacion = excluded.ultima_actuacion, synced_at = now(), error = null, error_at = null, peticiones = excluded.peticiones, updated_at = now();
end $$;
revoke all on function public.pjud_guardar(uuid, jsonb, text) from public, anon;
grant execute on function public.pjud_guardar(uuid, jsonb, text) to authenticated, service_role;

/** Reemplaza la lista de tribunales civiles (p_lista: [{codigo, nombre, nombre_norm, corte, corte_nombre}]). */
create or replace function public.pjud_guardar_tribunales(p_lista jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.pjud_puede_escribir() then raise exception 'Sin permiso para guardar los tribunales'; end if;
  insert into public.pjud_tribunales (codigo, nombre, nombre_norm, corte, corte_nombre, updated_at)
  select (t->>'codigo')::int, t->>'nombre', t->>'nombre_norm', (t->>'corte')::int, t->>'corte_nombre', now()
    from jsonb_array_elements(p_lista) t
  on conflict (codigo) do update set nombre = excluded.nombre, nombre_norm = excluded.nombre_norm, corte = excluded.corte, corte_nombre = excluded.corte_nombre, updated_at = now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.pjud_guardar_tribunales(jsonb) from public, anon;
grant execute on function public.pjud_guardar_tribunales(jsonb) to authenticated, service_role;
