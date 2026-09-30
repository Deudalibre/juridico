-- 0017 · Endurecimiento: los tokens del Drive solo para el servidor
-- Idempotente.
--
-- Hallazgo de la auditoría (2026-09-30): drive_tokens() devolvía el refresh token de Google a cualquier usuario
-- con legal.view, también si lo llamaba directamente desde el navegador con su sesión (PostgREST). Ahora la
-- función exige una llave que solo conoce el servidor (variable DRIVE_SERVER_KEY) y que vive cifrada en la
-- bóveda con el nombre 'drive_server_key'. Mientras la llave no exista en la bóveda, la función sigue
-- funcionando como antes (para no cortar el Drive): crearla activa la protección.
--
-- Para activarla (una sola vez, con un valor aleatorio largo, el mismo en Vercel y en .env.local):
--   select vault.create_secret('<valor>', 'drive_server_key', 'Llave del servidor para drive_tokens');

create or replace function public.drive_server_key_ok(p_key text)
returns boolean language sql security definer set search_path = public as $$
  select case
    when not exists (select 1 from vault.secrets where name = 'drive_server_key') then true
    else exists (select 1 from vault.decrypted_secrets where name = 'drive_server_key' and decrypted_secret = p_key)
  end
$$;
revoke all on function public.drive_server_key_ok(text) from public, anon, authenticated;

drop function if exists public.drive_tokens();
create or replace function public.drive_tokens(p_key text default null)
returns table (access_token text, expires_at timestamptz, refresh_token text)
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null or not public.has_permission('legal.view') then raise exception 'Sin permiso'; end if;
  if not public.drive_server_key_ok(p_key) then raise exception 'Solo el servidor puede leer los tokens del Drive'; end if;
  select refresh_secret_id into v_id from public.drive_connection where id = true;
  if v_id is null then return; end if;
  return query
    select c.access_token, c.expires_at, s.decrypted_secret
    from public.drive_connection c join vault.decrypted_secrets s on s.id = c.refresh_secret_id
    where c.id = true;
end $$;

drop function if exists public.drive_save_access(text, timestamptz, text);
create or replace function public.drive_save_access(p_access text, p_expires_at timestamptz, p_error text default null, p_key text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.has_permission('legal.view') then raise exception 'Sin permiso'; end if;
  if not public.drive_server_key_ok(p_key) then raise exception 'Solo el servidor puede guardar los tokens del Drive'; end if;
  update public.drive_connection set access_token = coalesce(p_access, access_token), expires_at = coalesce(p_expires_at, expires_at), last_error = p_error where id = true;
end $$;

revoke all on function public.drive_tokens(text) from public, anon;
revoke all on function public.drive_save_access(text, timestamptz, text, text) from public, anon;
grant execute on function public.drive_tokens(text) to authenticated;
grant execute on function public.drive_save_access(text, timestamptz, text, text) to authenticated;
