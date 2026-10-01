-- Cierre de tareas con registro para supervisión.
--
-- Completar o cancelar una tarea pide un resultado corto (lo valida la app) y deja constancia de quién la cerró
-- (closed_by) y una entrada en el historial de la causa (kind 'tarea'). Así el administrador puede ver, por causa
-- y por abogado, qué se cerró, cuándo y con qué resultado, sin frenar el cierre. No cambia datos existentes.

alter table public.legal_tasks
  add column if not exists closed_by uuid references auth.users (id) on delete set null;

create index if not exists legal_tasks_closed_idx on public.legal_tasks (closed_by, completed_at desc);

-- Historial de la causa: creación y cierre de cada tarea
create or replace function public.legal_tasks_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_actor uuid;
begin
  if tg_op = 'INSERT' then
    insert into public.legal_case_history (client_id, actor_id, actor_name, kind, summary, after)
    values (new.client_id, auth.uid(), public.member_name(auth.uid()), 'tarea', 'Tarea creada: ' || new.title,
      jsonb_build_object('tipo', new.kind, 'titulo', new.title, 'vence', new.due_at, 'responsable', new.assignee_id));
    return new;
  end if;
  if new.status is distinct from old.status and new.status in ('completada', 'cancelada') then
    v_actor := coalesce(new.closed_by, auth.uid());
    insert into public.legal_case_history (client_id, actor_id, actor_name, kind, summary, before, after)
    values (new.client_id, v_actor, public.member_name(v_actor), 'tarea',
      case when new.status = 'completada' then 'Tarea completada: ' else 'Tarea cancelada: ' end || new.title
        || coalesce(' · ' || new.result, ''),
      jsonb_build_object('estado', old.status),
      jsonb_build_object('estado', new.status, 'tipo', new.kind, 'titulo', new.title, 'resultado', new.result, 'vence', new.due_at,
        'cerrada', coalesce(new.completed_at, new.canceled_at)));
    perform public.audit('causa.tarea.' || new.status, 'legal_cliente', new.client_id::text,
      jsonb_build_object('estado', old.status), jsonb_build_object('estado', new.status, 'titulo', new.title, 'resultado', new.result));
  end if;
  if new.status = 'pendiente' and old.status in ('completada', 'cancelada') then
    insert into public.legal_case_history (client_id, actor_id, actor_name, kind, summary, before, after)
    values (new.client_id, auth.uid(), public.member_name(auth.uid()), 'tarea', 'Tarea reabierta: ' || new.title,
      jsonb_build_object('estado', old.status), jsonb_build_object('estado', new.status));
  end if;
  return new;
end $$;

drop trigger if exists legal_tasks_audit on public.legal_tasks;
create trigger legal_tasks_audit
  after insert or update of status on public.legal_tasks
  for each row execute function public.legal_tasks_audit();
