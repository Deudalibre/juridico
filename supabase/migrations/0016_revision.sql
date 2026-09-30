-- 0016 · Revisión de causas: registro de cada revisión, próxima revisión, historial y notificaciones
-- Idempotente.
--
-- El estudio revisa las causas una por una: si hubo o no movimiento, qué pidió el tribunal, qué tarea queda
-- pendiente, quién revisó y cuándo. Cada revisión es una fila inmutable en legal_reviews; el trigger actualiza
-- last_review_at / next_review_at de la causa, deja el historial y avisa al abogado a cargo si quedó tarea.

-- La tabla ya existía desde la migración 0009 del CRM (id, client_id, reviewed_by, reviewed_at, last_action, result,
-- next_review_at, notes, created_at) sin usarse; aquí se completa con lo que necesita la revisión.
create table if not exists public.legal_reviews (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.legal_clients (id) on delete cascade,
  reviewed_at timestamptz not null default now(),
  reviewed_by uuid references auth.users (id) on delete set null default auth.uid(),
  next_review_at timestamptz
);
alter table public.legal_reviews
  add column if not exists reviewer_name text,
  add column if not exists had_movement boolean not null default false,
  add column if not exists note text,
  add column if not exists task_id uuid references public.legal_tasks (id) on delete set null;
alter table public.legal_reviews alter column reviewed_at set default now();
alter table public.legal_reviews alter column reviewed_by set default auth.uid();
create index if not exists legal_reviews_client_idx on public.legal_reviews (client_id, reviewed_at desc);
create index if not exists legal_reviews_at_idx on public.legal_reviews (reviewed_at desc);
alter table public.legal_reviews enable row level security;
-- Políticas antiguas de 0009 (permitían insertar a nombre de cualquiera): se reemplazan
drop policy if exists "revisiones legales: ver" on public.legal_reviews;
drop policy if exists "revisiones legales: agregar" on public.legal_reviews;
drop policy if exists "revisiones: ver" on public.legal_reviews;
create policy "revisiones: ver" on public.legal_reviews for select using ((select public.has_permission('legal.view')));
drop policy if exists "revisiones: registrar" on public.legal_reviews;
create policy "revisiones: registrar" on public.legal_reviews for insert with check ((select public.has_permission('legal.edit')) and reviewed_by = auth.uid());
grant select, insert on public.legal_reviews to authenticated;

-- Notificaciones del área jurídica: la misma tabla del CRM, con la causa como destino
alter table public.notifications add column if not exists client_id uuid references public.legal_clients (id) on delete cascade;
create index if not exists notifications_client_idx on public.notifications (client_id);

create or replace function public.legal_notify(p_user uuid, p_client uuid, p_title text, p_body text default null)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, client_id, title, body) values (p_user, p_client, p_title, p_body);
$$;
revoke all on function public.legal_notify(uuid, uuid, text, text) from public, anon, authenticated;

-- Al registrar una revisión: nombre del revisor, fechas en la causa, historial, auditoría y aviso
create or replace function public.legal_reviews_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_client public.legal_clients%rowtype; v_task public.legal_tasks%rowtype; v_summary text;
begin
  select * into v_client from public.legal_clients where id = new.client_id;
  if new.reviewer_name is null then
    update public.legal_reviews set reviewer_name = coalesce(public.member_name(new.reviewed_by), 'sistema') where id = new.id;
  end if;
  update public.legal_clients set last_review_at = new.reviewed_at, next_review_at = new.next_review_at where id = new.client_id;
  if new.task_id is not null then select * into v_task from public.legal_tasks where id = new.task_id; end if;
  v_summary := case when new.had_movement then 'Revisión: con movimiento' else 'Revisión: sin movimiento' end
    || coalesce(' · ' || nullif(trim(new.note), ''), '')
    || case when v_task.id is not null then ' · tarea: ' || v_task.title else '' end;
  insert into public.legal_case_history (client_id, actor_id, actor_name, kind, summary, after)
  values (new.client_id, new.reviewed_by, coalesce(public.member_name(new.reviewed_by), 'sistema'), 'revision', v_summary,
    jsonb_build_object('had_movement', new.had_movement, 'next_review_at', new.next_review_at, 'task_id', new.task_id));
  perform public.audit('causa.revisada', 'legal_cliente', new.client_id::text, null,
    jsonb_build_object('had_movement', new.had_movement, 'next_review_at', new.next_review_at, 'task_id', new.task_id));
  -- Aviso al abogado a cargo si la causa quedó con tarea pendiente y no fue él quien revisó
  if v_task.id is not null and v_client.lawyer_id is not null and v_client.lawyer_id <> coalesce(new.reviewed_by, '00000000-0000-0000-0000-000000000000'::uuid)
     and (v_task.assignee_id is null or v_task.assignee_id = v_client.lawyer_id) then
    perform public.legal_notify(v_client.lawyer_id, new.client_id, 'Tarea pendiente en ' || v_client.full_name,
      v_task.title || coalesce(' · vence ' || to_char(v_task.due_at at time zone 'America/Santiago', 'DD/MM HH24:MI'), ''));
  end if;
  return new;
end $$;
drop trigger if exists legal_reviews_after on public.legal_reviews;
create trigger legal_reviews_after after insert on public.legal_reviews for each row execute function public.legal_reviews_after();

-- Tarea asignada a otra persona: aviso al responsable
create or replace function public.legal_tasks_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if new.assignee_id is not null and new.assignee_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) and new.status = 'pendiente' then
    select full_name into v_name from public.legal_clients where id = new.client_id;
    perform public.legal_notify(new.assignee_id, new.client_id, 'Tarea asignada · ' || coalesce(v_name, 'causa'),
      new.title || coalesce(' · vence ' || to_char(new.due_at at time zone 'America/Santiago', 'DD/MM HH24:MI'), ''));
  end if;
  return new;
end $$;
drop trigger if exists legal_tasks_notify on public.legal_tasks;
create trigger legal_tasks_notify after insert or update of assignee_id on public.legal_tasks for each row execute function public.legal_tasks_notify();

-- Realtime: la app se refresca sola cuando cambian causas, tareas o revisiones (RLS se aplica con el JWT)
do $$
declare t text;
begin
  foreach t in array array['legal_clients', 'legal_tasks', 'legal_reviews', 'legal_case_steps'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
