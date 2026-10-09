-- =====================================================================
-- Jurídico · migración 0036 · PDFs del Poder Judicial en Vercel Blob
--
-- · pjud_documentos: un registro por documento descargable de la OJV (actuación, anexo/certificado de escrito, texto de
--   la demanda, certificado de envío, ebook), con la URL del blob. Supabase guarda solo la URL; el archivo vive en
--   Vercel Blob. Los baja `scripts/pjud-download-docs.mts` desde un PC del estudio (el PJUD bloquea a Vercel).
-- · pjud_documento_reservar: el «lock» del script. Inserta la fila en estado downloading y devuelve su id; si ya existe
--   (hecha, o bajándose desde otro PC) devuelve null. Un error o una descarga colgada se reintenta pasada 1 hora.
-- · pjud_documento_terminar: cierra la reserva con la URL del blob o con el error.
-- · pjud_guardar: igual que antes, pero descarta los JWT de descarga (doc_token, anexo_token) antes de guardar el jsonb:
--   vencen a la hora y pesarían más que el resto de la actuación. Se conservan action y param, que dicen qué hay.
-- =====================================================================

create table if not exists public.pjud_documentos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.legal_clients (id) on delete cascade,
  cuaderno text not null default '',          -- '' para los documentos de la cabecera
  folio int not null default 0,               -- 0 para los documentos de la cabecera
  tipo text not null check (tipo in ('actuacion', 'certificado', 'demanda', 'certificado_demanda', 'ebook')),
  estado text not null default 'downloading' check (estado in ('downloading', 'done', 'error')),
  blob_url text,
  blob_key text,
  size_bytes int,
  error_msg text,
  downloaded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index if not exists pjud_documentos_unico_idx on public.pjud_documentos (client_id, cuaderno, folio, tipo);
create index if not exists pjud_documentos_client_idx on public.pjud_documentos (client_id);
create index if not exists pjud_documentos_estado_idx on public.pjud_documentos (estado);

alter table public.pjud_documentos enable row level security;
drop policy if exists "pjud documentos: ver" on public.pjud_documentos;
create policy "pjud documentos: ver" on public.pjud_documentos for select using ((select public.has_permission('legal.view')));
grant select on public.pjud_documentos to authenticated;

/** Reserva la descarga de un documento. Devuelve el id si esta llamada ganó el lock; null si ya está hecho o en curso. */
create or replace function public.pjud_documento_reservar(p_client uuid, p_cuaderno text, p_folio int, p_tipo text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.pjud_puede_escribir() then raise exception 'Sin permiso para guardar documentos del Poder Judicial'; end if;
  -- Un intento fallido, o una descarga que quedó colgada (PC apagado a medias), se puede volver a tomar pasada 1 hora
  delete from public.pjud_documentos
   where client_id = p_client and cuaderno = coalesce(p_cuaderno, '') and folio = coalesce(p_folio, 0) and tipo = p_tipo
     and estado in ('error', 'downloading') and downloaded_at < now() - interval '1 hour';
  insert into public.pjud_documentos (client_id, cuaderno, folio, tipo, estado, downloaded_at)
  values (p_client, coalesce(p_cuaderno, ''), coalesce(p_folio, 0), p_tipo, 'downloading', now())
  on conflict (client_id, cuaderno, folio, tipo) do nothing
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.pjud_documento_reservar(uuid, text, int, text) from public, anon;
grant execute on function public.pjud_documento_reservar(uuid, text, int, text) to authenticated, service_role;

/** Cierra una reserva: con URL → done; con error → error (reintentable en 1 hora). */
create or replace function public.pjud_documento_terminar(p_id uuid, p_url text default null, p_key text default null, p_size int default null, p_error text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.pjud_puede_escribir() then raise exception 'Sin permiso para guardar documentos del Poder Judicial'; end if;
  if p_url is not null then
    update public.pjud_documentos set estado = 'done', blob_url = p_url, blob_key = p_key, size_bytes = p_size, error_msg = null, downloaded_at = now() where id = p_id;
  else
    update public.pjud_documentos set estado = 'error', error_msg = left(coalesce(p_error, 'error'), 1000), downloaded_at = now() where id = p_id;
  end if;
end $$;
revoke all on function public.pjud_documento_terminar(uuid, text, text, int, text) from public, anon;
grant execute on function public.pjud_documento_terminar(uuid, text, text, int, text) to authenticated, service_role;

/** Quita de cada actuación los JWT de descarga (vencen a la hora); deja action y param. */
create or replace function public.pjud_sin_tokens(p_cuadernos jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_agg(
    (q - 'actuaciones') || jsonb_build_object('actuaciones', coalesce((
      select jsonb_agg(a - 'doc_token' - 'anexo_token') from jsonb_array_elements(coalesce(q->'actuaciones', '[]'::jsonb)) a
    ), '[]'::jsonb))
  ), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_cuadernos, '[]'::jsonb)) q
$$;

create or replace function public.pjud_guardar(p_client uuid, p_data jsonb default null, p_error text default null) returns void
language plpgsql security definer set search_path = public as $$
declare c record; n_act int; ult date; cuad jsonb;
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
  cuad := public.pjud_sin_tokens(p_data->'cuadernos');
  select count(*)::int, max((a->>'fecha_registro')::date)
    into n_act, ult
    from jsonb_array_elements(cuad) q, jsonb_array_elements(coalesce(q->'actuaciones', '[]'::jsonb)) a
   where nullif(a->>'fecha_registro', '') is not null;
  insert into public.pjud_causa_data (client_id, rol, tribunal, tribunal_codigo, caratulado, fecha_ingreso, estado_adm, estado_proc, procedimiento, etapa, ubicacion, partes, cuadernos, actuaciones, ultima_actuacion, synced_at, error, error_at, peticiones)
  values (p_client, coalesce(p_data->>'rol', c.rol, ''), coalesce(p_data->>'tribunal', c.tribunal, ''), nullif(p_data->>'tribunal_codigo', '')::int, p_data->>'caratulado', nullif(p_data->>'fecha_ingreso', '')::date,
          p_data->>'estado_adm', p_data->>'estado_proc', p_data->>'procedimiento', p_data->>'etapa', p_data->>'ubicacion',
          coalesce(p_data->'partes', '[]'::jsonb), cuad, coalesce(n_act, 0), ult, now(), null, null, nullif(p_data->>'peticiones', '')::int)
  on conflict (client_id) do update set
    rol = excluded.rol, tribunal = excluded.tribunal, tribunal_codigo = excluded.tribunal_codigo, caratulado = excluded.caratulado,
    fecha_ingreso = excluded.fecha_ingreso, estado_adm = excluded.estado_adm, estado_proc = excluded.estado_proc, procedimiento = excluded.procedimiento,
    etapa = excluded.etapa, ubicacion = excluded.ubicacion, partes = excluded.partes, cuadernos = excluded.cuadernos, actuaciones = excluded.actuaciones,
    ultima_actuacion = excluded.ultima_actuacion, synced_at = now(), error = null, error_at = null, peticiones = excluded.peticiones, updated_at = now();
end $$;
