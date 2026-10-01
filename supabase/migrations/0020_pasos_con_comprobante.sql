-- 0020 · Ciclo de la liquidación voluntaria con comprobantes (definido por el estudio el 2026-09-30)
-- Idempotente.
--
-- Pasos: Preparación de documentos → Ingreso de demanda (exige el Certificado de envío de causa) → Apercibimientos
-- → Nominación del liquidador (exige el Certificado de nominación) → Resolución de liquidación (hito) → gestiones del
-- liquidador: Acta de incautación, Venta de bienes, Rendición de cuenta y cuenta final → Resolución de término (exige
-- la resolución y cierra la causa como «Causa terminada»).
-- Se retiran «Art. 37: nominación en la Superir» (va directo al tribunal, sin comprobante), «Publicación en el
-- Boletín Concursal» y «Certificado de ejecutoria».

-- Comprobante del paso: un documento del almacén de la causa
alter table public.legal_case_steps add column if not exists document_id uuid references public.legal_documents (id) on delete set null;

-- Datos existentes: renombrar y retirar pasos
update public.legal_case_steps set step = 'Nominación del liquidador' where step = 'Certificado de nominación';
delete from public.legal_case_steps where step in ('Art. 37: nominación en la Superir', 'Publicación en el Boletín Concursal', 'Certificado de ejecutoria');
update public.legal_clients set current_step = 'Nominación del liquidador' where current_step in ('Art. 37: nominación en la Superir', 'Certificado de nominación');
update public.legal_clients set current_step = 'Completada' where current_step in ('Publicación en el Boletín Concursal', 'Certificado de ejecutoria');

-- Pasos que no se marcan sin su comprobante, y cierre automático con la resolución de término
create or replace function public.legal_case_steps_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_proc text;
begin
  select procedure_type into v_proc from public.legal_clients where id = new.client_id;
  if v_proc like 'Liquidación%' and new.step in ('Ingreso de demanda', 'Nominación del liquidador', 'Resolución de término') and new.document_id is null then
    raise exception 'El paso «%» necesita su comprobante (certificado o resolución).', new.step;
  end if;
  if new.document_id is not null and not exists (select 1 from public.legal_documents d where d.id = new.document_id and d.client_id = new.client_id) then
    raise exception 'El comprobante no pertenece a esta causa.';
  end if;
  return new;
end $$;
drop trigger if exists legal_case_steps_guard on public.legal_case_steps;
create trigger legal_case_steps_guard before insert or update on public.legal_case_steps
  for each row execute function public.legal_case_steps_guard();

create or replace function public.legal_case_steps_terminate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.step = 'Resolución de término' then
    update public.legal_clients
      set archived_at = coalesce(archived_at, now()), close_reason = 'Causa terminada',
          close_detail = 'Resolución de término del ' || to_char(new.completed_at, 'DD/MM/YYYY'), current_step = 'Completada'
      where id = new.client_id;
  end if;
  return new;
end $$;
drop trigger if exists legal_case_steps_terminate on public.legal_case_steps;
create trigger legal_case_steps_terminate after insert on public.legal_case_steps
  for each row execute function public.legal_case_steps_terminate();
