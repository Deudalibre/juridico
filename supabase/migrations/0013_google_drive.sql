-- 0013 · Conexión con Google Drive del estudio (carpetas por cliente con vista previa)
-- Idempotente.
--
-- Una sola conexión para todo el estudio. El refresh token vive cifrado en la bóveda (vault);
-- el access token (dura 1 hora) se cachea en la fila. Nada de esto se lee con select directo:
-- solo a través de las funciones de abajo, que exigen permiso.

create table if not exists public.drive_connection (
  id boolean primary key default true check (id),
  google_email text,
  refresh_secret_id uuid,
  access_token text,
  expires_at timestamptz,
  root_folder_id text,
  root_folder_name text,
  last_error text,
  connected_by uuid references auth.users (id) on delete set null,
  connected_at timestamptz
);
alter table public.drive_connection enable row level security;
-- Sin políticas: nadie lee ni escribe la tabla directamente (las funciones son security definer)
revoke all on public.drive_connection from anon, authenticated;

alter table public.legal_documents
  add column if not exists drive_file_id text,
  add column if not exists drive_link text;

-- Estado visible para cualquiera del área jurídica (sin secretos)
create or replace function public.drive_status()
returns table (connected boolean, google_email text, root_folder_id text, root_folder_name text, last_error text, connected_at timestamptz)
language sql security definer set search_path = public as $$
  select (c.refresh_secret_id is not null) as connected, c.google_email, c.root_folder_id, c.root_folder_name, c.last_error, c.connected_at
  from public.drive_connection c
  where public.has_permission('legal.view')
$$;

-- Guardar la conexión (solo legal.settings)
create or replace function public.drive_connect(p_email text, p_refresh text, p_access text, p_expires_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null or not public.has_permission('legal.settings') then raise exception 'Sin permiso para conectar Google Drive'; end if;
  select refresh_secret_id into v_id from public.drive_connection where id = true;
  if v_id is null then
    v_id := vault.create_secret(p_refresh, 'google_drive_refresh', 'Refresh token de Google Drive del estudio');
  else
    perform vault.update_secret(v_id, p_refresh);
  end if;
  insert into public.drive_connection (id, google_email, refresh_secret_id, access_token, expires_at, last_error, connected_by, connected_at)
  values (true, p_email, v_id, p_access, p_expires_at, null, auth.uid(), now())
  on conflict (id) do update set google_email = excluded.google_email, refresh_secret_id = excluded.refresh_secret_id,
    access_token = excluded.access_token, expires_at = excluded.expires_at, last_error = null, connected_by = excluded.connected_by, connected_at = now();
  perform public.audit('drive.conectado', 'drive', 'estudio', null, jsonb_build_object('email', p_email));
end $$;

create or replace function public.drive_disconnect()
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_email text;
begin
  if auth.uid() is null or not public.has_permission('legal.settings') then raise exception 'Sin permiso'; end if;
  select refresh_secret_id, google_email into v_id, v_email from public.drive_connection where id = true;
  if v_id is not null then delete from vault.secrets where id = v_id; end if;
  delete from public.drive_connection where id = true;
  perform public.audit('drive.desconectado', 'drive', 'estudio', jsonb_build_object('email', v_email), null);
end $$;

create or replace function public.drive_set_root(p_folder_id text, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.has_permission('legal.settings') then raise exception 'Sin permiso'; end if;
  update public.drive_connection set root_folder_id = p_folder_id, root_folder_name = p_name where id = true;
  if not found then raise exception 'Conecta primero Google Drive'; end if;
end $$;

-- Tokens para llamar a la API desde el servidor (cualquier usuario del área jurídica: es lo que le permite ver las carpetas)
create or replace function public.drive_tokens()
returns table (access_token text, expires_at timestamptz, refresh_token text)
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null or not public.has_permission('legal.view') then raise exception 'Sin permiso'; end if;
  select refresh_secret_id into v_id from public.drive_connection where id = true;
  if v_id is null then return; end if;
  return query
    select c.access_token, c.expires_at, s.decrypted_secret
    from public.drive_connection c join vault.decrypted_secrets s on s.id = c.refresh_secret_id
    where c.id = true;
end $$;

create or replace function public.drive_save_access(p_access text, p_expires_at timestamptz, p_error text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.has_permission('legal.view') then raise exception 'Sin permiso'; end if;
  update public.drive_connection set access_token = coalesce(p_access, access_token), expires_at = coalesce(p_expires_at, expires_at), last_error = p_error where id = true;
end $$;

revoke all on function public.drive_status() from public, anon;
revoke all on function public.drive_connect(text, text, text, timestamptz) from public, anon;
revoke all on function public.drive_disconnect() from public, anon;
revoke all on function public.drive_set_root(text, text) from public, anon;
revoke all on function public.drive_tokens() from public, anon;
revoke all on function public.drive_save_access(text, timestamptz, text) from public, anon;
grant execute on function public.drive_status() to authenticated;
grant execute on function public.drive_connect(text, text, text, timestamptz) to authenticated;
grant execute on function public.drive_disconnect() to authenticated;
grant execute on function public.drive_set_root(text, text) to authenticated;
grant execute on function public.drive_tokens() to authenticated;
grant execute on function public.drive_save_access(text, timestamptz, text) to authenticated;
