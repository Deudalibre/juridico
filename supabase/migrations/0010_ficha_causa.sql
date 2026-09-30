-- 0010 · Ficha del cliente y su causa (etapa 1 del área jurídica)
-- Idempotente: puede ejecutarse varias veces.
--
-- Novedades:
--  * Clave Única del cliente cifrada en la bóveda de Supabase (vault). En legal_clients solo
--    queda el id del secreto; el valor se lee y escribe únicamente con las funciones de abajo,
--    que exigen permiso y dejan registro en audit_log.
--  * Enlaces externos por cliente: carpeta en el Drive del estudio y ficha en el Poder Judicial.

alter table public.legal_clients
  add column if not exists clave_unica_secret_id uuid,
  add column if not exists drive_folder_url text,
  add column if not exists pjud_url text;

comment on column public.legal_clients.clave_unica_secret_id is 'Id del secreto en vault.secrets; nunca el valor';
comment on column public.legal_clients.drive_folder_url is 'Carpeta del cliente en el Drive del estudio';
comment on column public.legal_clients.pjud_url is 'Ficha de la causa en el Poder Judicial';

-- La referencia al secreto solo la cambian las funciones de esta migración (corren como postgres);
-- un update directo desde la app (rol authenticated) se rechaza.
create or replace function public.legal_clients_secret_guard()
returns trigger
language plpgsql
as $$
begin
  if new.clave_unica_secret_id is distinct from old.clave_unica_secret_id and current_user <> 'postgres' then
    raise exception 'La Clave Única solo se cambia con legal_set_clave_unica';
  end if;
  return new;
end $$;

drop trigger if exists legal_clients_secret_guard on public.legal_clients;
create trigger legal_clients_secret_guard
  before update on public.legal_clients
  for each row execute function public.legal_clients_secret_guard();

-- Guardar, cambiar o quitar (valor vacío) la Clave Única. Requiere legal.edit.
create or replace function public.legal_set_clave_unica(p_client uuid, p_value text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text;
  v_val text := nullif(btrim(coalesce(p_value, '')), '');
begin
  if auth.uid() is null or not public.has_permission('legal.edit') then
    raise exception 'Sin permiso para editar la Clave Única';
  end if;
  select clave_unica_secret_id, full_name into v_id, v_name
    from public.legal_clients where id = p_client and archived_at is null;
  if not found then
    raise exception 'Cliente no encontrado';
  end if;

  if v_val is null then
    if v_id is not null then
      delete from vault.secrets where id = v_id;
      update public.legal_clients set clave_unica_secret_id = null where id = p_client;
      perform public.audit('cliente.clave_unica.quitada', 'legal_cliente', p_client::text, null,
        jsonb_build_object('nombre', v_name));
    end if;
    return;
  end if;

  if length(v_val) > 64 then
    raise exception 'La Clave Única es demasiado larga';
  end if;

  if v_id is null then
    v_id := vault.create_secret(v_val, 'clave_unica:' || p_client::text, 'Clave Única del cliente ' || coalesce(v_name, ''));
    update public.legal_clients set clave_unica_secret_id = v_id where id = p_client;
  else
    perform vault.update_secret(v_id, v_val);
  end if;
  perform public.audit('cliente.clave_unica.guardada', 'legal_cliente', p_client::text, null,
    jsonb_build_object('nombre', v_name));
end $$;

-- Mostrar la Clave Única. Requiere legal.view y deja registro de cada vista.
create or replace function public.legal_get_clave_unica(p_client uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text;
  v_secret text;
begin
  if auth.uid() is null or not public.has_permission('legal.view') then
    raise exception 'Sin permiso para ver la Clave Única';
  end if;
  select clave_unica_secret_id, full_name into v_id, v_name
    from public.legal_clients where id = p_client;
  if not found or v_id is null then
    return null;
  end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where id = v_id;
  perform public.audit('cliente.clave_unica.vista', 'legal_cliente', p_client::text, null,
    jsonb_build_object('nombre', v_name));
  return v_secret;
end $$;

revoke all on function public.legal_set_clave_unica(uuid, text) from public, anon;
revoke all on function public.legal_get_clave_unica(uuid) from public, anon;
grant execute on function public.legal_set_clave_unica(uuid, text) to authenticated;
grant execute on function public.legal_get_clave_unica(uuid) to authenticated;
