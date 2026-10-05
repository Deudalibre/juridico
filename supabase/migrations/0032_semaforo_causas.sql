-- 0032 · Semáforo de la causa (color según la situación del patrocinio y poder / la demanda) y «Preparación de
-- documentos» deja de ser un paso que se marca: el programa la infiere (causa sin rol ni fecha de ingreso).
-- Idempotente.
--
-- Colores acordados con el estudio (2026-10-05, a partir de su Excel «Revisión de causas»):
--   verde   ok              → patrocinio y poder al día, o escrito de PyP enviado
--   amarillo apercibimiento → el tribunal pidió algo con plazo
--   rojo    rechazada       → demanda rechazada
--   celeste reingresada     → demanda reingresada tras el rechazo
--   naranjo nominar         → falta nominar al liquidador
--   azul    pyp_zoom        → patrocinio y poder por Zoom pendiente

alter table public.legal_clients add column if not exists semaforo text;
alter table public.legal_clients drop constraint if exists legal_clients_semaforo_check;
alter table public.legal_clients add constraint legal_clients_semaforo_check
  check (semaforo is null or semaforo in ('ok', 'apercibimiento', 'rechazada', 'reingresada', 'nominar', 'pyp_zoom'));
create index if not exists legal_clients_semaforo_idx on public.legal_clients (semaforo) where archived_at is null;

-- Cada cambio de color queda en el historial de la causa (supervisión)
create or replace function public.legal_clients_semaforo_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_label text;
begin
  if new.semaforo is distinct from old.semaforo then
    v_label := case new.semaforo
      when 'ok' then 'Al día' when 'apercibimiento' then 'Apercibimiento' when 'rechazada' then 'Demanda rechazada'
      when 'reingresada' then 'Demanda reingresada' when 'nominar' then 'Nominar' when 'pyp_zoom' then 'PyP por Zoom'
      else 'Sin color' end;
    insert into public.legal_case_history (client_id, actor_id, actor_name, kind, summary, before, after)
    values (new.id, auth.uid(), public.member_name(auth.uid()), 'estado', 'Semáforo: ' || v_label,
      jsonb_build_object('semaforo', old.semaforo), jsonb_build_object('semaforo', new.semaforo));
  end if;
  return new;
end $$;
drop trigger if exists legal_clients_semaforo_audit on public.legal_clients;
create trigger legal_clients_semaforo_audit after update of semaforo on public.legal_clients
  for each row execute function public.legal_clients_semaforo_audit();

-- «Preparación de documentos» ya no es un paso: se retira de los pasos marcados y del paso actual
delete from public.legal_case_steps where step = 'Preparación de documentos';
update public.legal_clients set current_step = 'Ingreso de demanda'
  where current_step = 'Preparación de documentos' and procedure_type like 'Liquidación%';
update public.legal_clients set current_step = 'Ingreso de la solicitud'
  where current_step = 'Preparación de documentos' and procedure_type = 'Renegociación';
