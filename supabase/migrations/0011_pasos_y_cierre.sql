-- 0011 · Pasos de la causa, apercibimientos y cierre con motivo (etapa 2 del área jurídica)
-- Idempotente.

-- Cierre con motivo y datos clave de la liquidación
alter table public.legal_clients
  add column if not exists close_reason text,
  add column if not exists close_detail text,
  add column if not exists liquidator_name text,
  add column if not exists liquidation_resolution_at date,
  add column if not exists current_step text;

comment on column public.legal_clients.close_reason is 'Motivo del cierre de la causa (archived_at marca cuándo)';
comment on column public.legal_clients.liquidator_name is 'Liquidador titular según el certificado de nominación';
comment on column public.legal_clients.liquidation_resolution_at is 'Fecha de la resolución de liquidación (hito principal)';
comment on column public.legal_clients.current_step is 'Paso actual del procedimiento (lo mantiene la app); «Completada» si no queda ninguno';

-- Tipos de tarea: se suman apercibimiento y audiencia
alter table public.legal_tasks drop constraint if exists legal_tasks_kind_check;
alter table public.legal_tasks add constraint legal_tasks_kind_check
  check (kind in ('revisar_causa', 'revisar_resolucion', 'preparar_escrito', 'solicitar_documento', 'contactar_cliente', 'presentar_escrito', 'apercibimiento', 'audiencia', 'otra'));

-- Pasos completados de cada causa (los nombres vienen de la app: src/lib/legal.ts)
create table if not exists public.legal_case_steps (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.legal_clients (id) on delete cascade,
  step text not null,
  completed_at date not null default current_date,
  completed_by uuid default auth.uid() references auth.users (id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  unique (client_id, step)
);
create index if not exists legal_case_steps_client_idx on public.legal_case_steps (client_id);

alter table public.legal_case_steps enable row level security;
drop policy if exists "pasos causa: ver" on public.legal_case_steps;
create policy "pasos causa: ver" on public.legal_case_steps for select using ((select public.has_permission('legal.view')));
drop policy if exists "pasos causa: crear" on public.legal_case_steps;
create policy "pasos causa: crear" on public.legal_case_steps for insert with check ((select public.has_permission('legal.edit')));
drop policy if exists "pasos causa: editar" on public.legal_case_steps;
create policy "pasos causa: editar" on public.legal_case_steps for update using ((select public.has_permission('legal.edit'))) with check ((select public.has_permission('legal.edit')));
drop policy if exists "pasos causa: eliminar" on public.legal_case_steps;
create policy "pasos causa: eliminar" on public.legal_case_steps for delete using ((select public.has_permission('legal.edit')));
grant select, insert, update, delete on public.legal_case_steps to authenticated;

-- Historial y auditoría de cada paso
create or replace function public.legal_case_steps_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.legal_case_history (client_id, actor_id, actor_name, kind, summary, after)
    values (new.client_id, auth.uid(), public.member_name(auth.uid()), 'paso', 'Paso completado: ' || new.step,
      jsonb_build_object('paso', new.step, 'fecha', new.completed_at, 'nota', new.note));
    perform public.audit('causa.paso.completado', 'legal_cliente', new.client_id::text, null,
      jsonb_build_object('paso', new.step, 'fecha', new.completed_at));
    return new;
  end if;
  if tg_op = 'DELETE' then
    -- Si el borrado viene en cascada por eliminar el cliente, ya no hay historial que escribir
    if exists (select 1 from public.legal_clients where id = old.client_id) then
      insert into public.legal_case_history (client_id, actor_id, actor_name, kind, summary, before)
      values (old.client_id, auth.uid(), public.member_name(auth.uid()), 'paso', 'Paso deshecho: ' || old.step,
        jsonb_build_object('paso', old.step, 'fecha', old.completed_at));
      perform public.audit('causa.paso.deshecho', 'legal_cliente', old.client_id::text,
        jsonb_build_object('paso', old.step), null);
    end if;
    return old;
  end if;
  return new;
end $$;

drop trigger if exists legal_case_steps_audit on public.legal_case_steps;
create trigger legal_case_steps_audit
  after insert or delete on public.legal_case_steps
  for each row execute function public.legal_case_steps_audit();

-- Cierre y reapertura de la causa: historial y auditoría
create or replace function public.legal_clients_close_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.archived_at is not null and old.archived_at is null then
    insert into public.legal_case_history (client_id, actor_id, actor_name, kind, summary, after)
    values (new.id, auth.uid(), public.member_name(auth.uid()), 'cierre', 'Causa cerrada: ' || coalesce(new.close_reason, 'sin motivo'),
      jsonb_build_object('motivo', new.close_reason, 'detalle', new.close_detail));
    perform public.audit('cliente.cerrada', 'legal_cliente', new.id::text, null,
      jsonb_build_object('nombre', new.full_name, 'motivo', new.close_reason));
  elsif new.archived_at is null and old.archived_at is not null then
    insert into public.legal_case_history (client_id, actor_id, actor_name, kind, summary, before)
    values (new.id, auth.uid(), public.member_name(auth.uid()), 'cierre', 'Causa reabierta',
      jsonb_build_object('motivo', old.close_reason));
    perform public.audit('cliente.reabierta', 'legal_cliente', new.id::text,
      jsonb_build_object('motivo', old.close_reason), jsonb_build_object('nombre', new.full_name));
  end if;
  return new;
end $$;

drop trigger if exists legal_clients_close_audit on public.legal_clients;
create trigger legal_clients_close_audit
  after update on public.legal_clients
  for each row execute function public.legal_clients_close_audit();
