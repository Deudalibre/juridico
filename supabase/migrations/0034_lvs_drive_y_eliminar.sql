-- 0034 · Los documentos generados de la LVS se guardan también en el Drive del estudio (carpeta universal →
-- carpeta por cliente) y la solicitud LVS se puede eliminar desde la lista sin tocar la causa (2026-10-06).
-- Idempotente.

alter table public.legal_lvs_generados
  add column if not exists drive_file_id text,
  add column if not exists drive_link text;
comment on column public.legal_lvs_generados.drive_file_id is 'Archivo en el Google Drive del estudio (se actualiza el mismo archivo al regenerar)';

-- Eliminar la solicitud LVS de un cliente: ficha, bienes, juicios, deudas y documentos generados (filas y
-- registros en legal_documents). La causa (legal_clients) sigue en Clientes. Los archivos del almacén interno los
-- borra el servidor con las rutas que devuelve esta función; en el Drive no se borra nada (política del estudio).
create or replace function public.legal_lvs_delete(p_client_id uuid)
returns text[] language plpgsql security definer set search_path = public as $$
declare
  v_paths text[];
  v_docs uuid[];
  v_name text;
  v_n int;
begin
  if auth.uid() is null or not public.has_permission('documents.manage') then
    raise exception 'Solo el administrador elimina solicitudes LVS';
  end if;
  if not exists (select 1 from public.legal_lvs where client_id = p_client_id) then
    raise exception 'La solicitud no existe';
  end if;
  select full_name into v_name from public.legal_clients where id = p_client_id;
  select coalesce(array_agg(storage_path), '{}'), coalesce(array_agg(document_id) filter (where document_id is not null), '{}'), count(*)
    into v_paths, v_docs, v_n
    from public.legal_lvs_generados where client_id = p_client_id;

  delete from public.legal_lvs_generados where client_id = p_client_id;
  delete from public.legal_documents where id = any(v_docs);
  delete from public.legal_lvs_deudas where client_id = p_client_id;
  delete from public.legal_lvs_bienes_raices where client_id = p_client_id;
  delete from public.legal_lvs_vehiculos where client_id = p_client_id;
  delete from public.legal_lvs_aguas where client_id = p_client_id;
  delete from public.legal_lvs_participaciones where client_id = p_client_id;
  delete from public.legal_lvs_instrumentos where client_id = p_client_id;
  delete from public.legal_lvs_bienes_muebles where client_id = p_client_id;
  delete from public.legal_lvs_juicios where client_id = p_client_id;
  delete from public.legal_lvs where client_id = p_client_id;

  insert into public.legal_case_history (client_id, actor_id, actor_name, kind, summary, after)
  values (p_client_id, auth.uid(), public.member_name(auth.uid()), 'lvs', 'Solicitud LVS eliminada (la causa sigue abierta)',
    jsonb_build_object('documentos_generados', v_n));
  perform public.audit('lvs.eliminado', 'legal_lvs', p_client_id::text, jsonb_build_object('cliente', v_name, 'generados', v_n), null);
  return v_paths;
end $$;
revoke all on function public.legal_lvs_delete(uuid) from public, anon;
grant execute on function public.legal_lvs_delete(uuid) to authenticated;
