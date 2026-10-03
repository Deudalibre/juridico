-- Juicios pendientes (art. 273 A n.º 4) de la LVS, con los datos que pide la NCG 22: rol, tribunal, Corte de
-- Apelaciones, carátula, estado, calidad (demandante, demandado o tercero), monto y si puede producir ingreso o
-- desembolso. Se cargan desde la Ficha Maestra, como los bienes. Idempotente.

create table if not exists public.legal_lvs_juicios (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.legal_clients (id) on delete cascade,
  rol text,
  tribunal text,
  corte text,
  caratula text,
  estado text,
  calidad text check (calidad is null or calidad in ('Demandante', 'Demandado', 'Tercero')),
  monto bigint,
  puede_ingreso boolean not null default false,
  puede_desembolso boolean not null default false,
  observaciones text,
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists legal_lvs_juicios_client_idx on public.legal_lvs_juicios (client_id, orden);
alter table public.legal_lvs_juicios enable row level security;
grant select, insert, update, delete on public.legal_lvs_juicios to authenticated;
drop policy if exists "ver" on public.legal_lvs_juicios;
create policy "ver" on public.legal_lvs_juicios for select using ((select public.has_permission('legal.view')));
drop policy if exists "crear" on public.legal_lvs_juicios;
create policy "crear" on public.legal_lvs_juicios for insert with check ((select public.has_permission('legal.edit')));
drop policy if exists "editar" on public.legal_lvs_juicios;
create policy "editar" on public.legal_lvs_juicios for update using ((select public.has_permission('legal.edit'))) with check ((select public.has_permission('legal.edit')));
drop policy if exists "eliminar" on public.legal_lvs_juicios;
create policy "eliminar" on public.legal_lvs_juicios for delete using ((select public.has_permission('legal.edit')));
drop trigger if exists touch on public.legal_lvs_juicios;
create trigger touch before update on public.legal_lvs_juicios for each row execute function public.touch_updated_at();

-- Mismo historial que los bienes (se amplía el nombre legible)
create or replace function public.legal_lvs_bienes_history()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_client uuid := coalesce(new.client_id, old.client_id);
  v_que text := case tg_table_name
    when 'legal_lvs_bienes_raices' then 'Bien raíz'
    when 'legal_lvs_vehiculos' then 'Vehículo'
    when 'legal_lvs_aguas' then 'Derecho de agua o concesión'
    when 'legal_lvs_participaciones' then 'Participación o herencia'
    when 'legal_lvs_instrumentos' then 'Instrumento financiero'
    when 'legal_lvs_juicios' then 'Juicio pendiente'
    else 'Bien mueble o financiero' end;
  v_accion text := case tg_op when 'INSERT' then 'agregado' when 'DELETE' then 'quitado' else 'editado' end;
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.legal_clients where id = v_client) then
    return old;
  end if;
  insert into public.legal_case_history (client_id, actor_id, actor_name, kind, summary, before, after)
  values (v_client, auth.uid(), public.member_name(auth.uid()), 'lvs', v_que || ' ' || v_accion,
    case when tg_op = 'INSERT' then null else to_jsonb(old) - 'created_at' - 'updated_at' end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) - 'created_at' - 'updated_at' end);
  perform public.audit('lvs.bien.' || v_accion, tg_table_name, coalesce(new.id, old.id)::text, null, jsonb_build_object('cliente', v_client));
  return coalesce(new, old);
end $$;
drop trigger if exists history on public.legal_lvs_juicios;
create trigger history after insert or update or delete on public.legal_lvs_juicios for each row execute function public.legal_lvs_bienes_history();
