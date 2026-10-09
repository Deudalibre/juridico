-- =====================================================================
-- Jurídico · migración 0037 · PDFs del PJUD: certificados de envío de escritos y anexos
--
-- Lo que publica la OJV por actuación (visto en la Historia real): en los escritos la columna «Doc.» trae el documento
-- principal y el certificado de envío del escrito; la columna «Anexo» abre una carpeta con los PDFs adjuntos al escrito;
-- y la cabecera tiene «Anexos de la causa» (otra carpeta). Un mismo folio puede tener varias filas (p. ej. nueve oficios
-- bajo el folio 16), así que la clave única lleva `orden`.
-- · tipo: actuacion (principal) · certificado (certificado de envío del escrito) · anexo (carpeta del folio) ·
--   anexo_causa (carpeta de la cabecera) · demanda · certificado_demanda · ebook.
-- · orden: posición entre los documentos del mismo folio y tipo (0 el primero).
-- · referencia / fecha: lo que la carpeta de anexos muestra por fila («Informe deudas - CMF», 12/02/2024).
-- =====================================================================

alter table public.pjud_documentos add column if not exists orden int not null default 0;
alter table public.pjud_documentos add column if not exists referencia text;
alter table public.pjud_documentos add column if not exists fecha date;
alter table public.pjud_documentos drop constraint if exists pjud_documentos_tipo_check;
alter table public.pjud_documentos add constraint pjud_documentos_tipo_check check (tipo in ('actuacion', 'certificado', 'anexo', 'anexo_causa', 'demanda', 'certificado_demanda', 'ebook'));
drop index if exists public.pjud_documentos_unico_idx;
create unique index if not exists pjud_documentos_unico_idx on public.pjud_documentos (client_id, cuaderno, folio, tipo, orden);

drop function if exists public.pjud_documento_reservar(uuid, text, int, text);
/** Reserva la descarga de un documento. Devuelve el id si esta llamada ganó el lock; null si ya está hecho o en curso. */
create or replace function public.pjud_documento_reservar(p_client uuid, p_cuaderno text, p_folio int, p_tipo text, p_orden int default 0, p_referencia text default null, p_fecha date default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.pjud_puede_escribir() then raise exception 'Sin permiso para guardar documentos del Poder Judicial'; end if;
  -- Un intento fallido, o una descarga que quedó colgada (PC apagado a medias), se puede volver a tomar pasada 1 hora
  delete from public.pjud_documentos
   where client_id = p_client and cuaderno = coalesce(p_cuaderno, '') and folio = coalesce(p_folio, 0) and tipo = p_tipo and orden = coalesce(p_orden, 0)
     and estado in ('error', 'downloading') and downloaded_at < now() - interval '1 hour';
  insert into public.pjud_documentos (client_id, cuaderno, folio, tipo, orden, referencia, fecha, estado, downloaded_at)
  values (p_client, coalesce(p_cuaderno, ''), coalesce(p_folio, 0), p_tipo, coalesce(p_orden, 0), nullif(p_referencia, ''), p_fecha, 'downloading', now())
  on conflict (client_id, cuaderno, folio, tipo, orden) do nothing
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.pjud_documento_reservar(uuid, text, int, text, int, text, date) from public, anon;
grant execute on function public.pjud_documento_reservar(uuid, text, int, text, int, text, date) to authenticated, service_role;

/** Quita de cada actuación las referencias y JWT de descarga (vencen a la hora); deja action, param y las banderas. */
create or replace function public.pjud_sin_tokens(p_cuadernos jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_agg(
    (q - 'actuaciones') || jsonb_build_object('actuaciones', coalesce((
      select jsonb_agg(a - 'doc_token' - 'cert_token' - 'anexo_token' - 'anexo_ref') from jsonb_array_elements(coalesce(q->'actuaciones', '[]'::jsonb)) a
    ), '[]'::jsonb))
  ), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_cuadernos, '[]'::jsonb)) q
$$;
