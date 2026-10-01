-- 0021 · El guardia de comprobantes solo actúa al crear el paso o al cambiarle el paso/comprobante
-- Idempotente.
--
-- Hallazgo en la importación: la FK completed_by → auth.users (on delete set null) actualiza legal_case_steps al
-- borrar un usuario, y el guardia de 0020 (before insert or update) rechazaba esa actualización en pasos antiguos
-- que no tienen comprobante (importados o marcados antes de exigirlo). Ahora las actualizaciones que no tocan
-- step ni document_id pasan sin revisar.

create or replace function public.legal_case_steps_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_proc text;
begin
  if tg_op = 'UPDATE' and new.step = old.step and new.document_id is not distinct from old.document_id then
    return new;
  end if;
  select procedure_type into v_proc from public.legal_clients where id = new.client_id;
  if v_proc like 'Liquidación%' and new.step in ('Ingreso de demanda', 'Nominación del liquidador', 'Resolución de término') and new.document_id is null then
    raise exception 'El paso «%» necesita su comprobante (certificado o resolución).', new.step;
  end if;
  if new.document_id is not null and not exists (select 1 from public.legal_documents d where d.id = new.document_id and d.client_id = new.client_id) then
    raise exception 'El comprobante no pertenece a esta causa.';
  end if;
  return new;
end $$;
