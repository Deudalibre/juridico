-- LVS: catálogo maestro de acreedores (importado del Word del estudio) y deudas de cada expediente (Anexo 9).
-- El operador busca por nombre o RUT y la deuda toma del catálogo RUT, correo y teléfono; solo escribe monto y
-- naturaleza. Lo que no está en el catálogo se agrega una vez y queda para los demás clientes. Idempotente.

create table if not exists public.legal_acreedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  rut text,
  alias text[] not null default '{}',
  domicilio text,
  representante text,
  rut_representante text,
  email text,
  telefono text,
  -- Cómo consta el crédito según el Word («contrato de mutuo de préstamo de dinero»…): sirve para la demanda
  naturaleza text,
  origen text not null default 'manual' check (origen in ('importado', 'manual')),
  activo boolean not null default true,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Restricción única (no índice parcial): hace falta para el upsert por RUT; los nulos no chocan entre sí
drop index if exists public.legal_acreedores_rut_unico;
alter table public.legal_acreedores drop constraint if exists legal_acreedores_rut_key;
alter table public.legal_acreedores add constraint legal_acreedores_rut_key unique (rut);
create index if not exists legal_acreedores_nombre_idx on public.legal_acreedores (lower(nombre));
alter table public.legal_acreedores enable row level security;
grant select, insert, update, delete on public.legal_acreedores to authenticated;
drop policy if exists "acreedores: ver" on public.legal_acreedores;
create policy "acreedores: ver" on public.legal_acreedores for select using ((select public.has_permission('legal.view')));
drop policy if exists "acreedores: crear" on public.legal_acreedores;
create policy "acreedores: crear" on public.legal_acreedores for insert with check ((select public.has_permission('legal.edit')));
drop policy if exists "acreedores: editar" on public.legal_acreedores;
create policy "acreedores: editar" on public.legal_acreedores for update using ((select public.has_permission('legal.edit'))) with check ((select public.has_permission('legal.edit')));
drop policy if exists "acreedores: eliminar" on public.legal_acreedores;
create policy "acreedores: eliminar" on public.legal_acreedores for delete using ((select public.has_permission('legal.settings')));
drop trigger if exists touch on public.legal_acreedores;
create trigger touch before update on public.legal_acreedores for each row execute function public.touch_updated_at();

create table if not exists public.legal_lvs_deudas (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.legal_clients (id) on delete cascade,
  acreedor_id uuid references public.legal_acreedores (id) on delete set null,
  -- Lo que va al Anexo 9 (copiado del catálogo al elegir; se puede corregir para este cliente)
  nombre text not null,
  rut text,
  email text,
  telefono text,
  monto bigint,
  naturaleza text not null default 'Valista' check (naturaleza in ('Valista', 'Preferente', 'Privilegiado')),
  -- Interno (demanda y control)
  origen_credito text,
  cmf boolean not null default true,
  calidad text not null default 'Deudor principal' check (calidad in ('Deudor principal', 'Fiador', 'Codeudor', 'Aval')),
  observaciones text,
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists legal_lvs_deudas_client_idx on public.legal_lvs_deudas (client_id, orden);
alter table public.legal_lvs_deudas enable row level security;
grant select, insert, update, delete on public.legal_lvs_deudas to authenticated;
drop policy if exists "ver" on public.legal_lvs_deudas;
create policy "ver" on public.legal_lvs_deudas for select using ((select public.has_permission('legal.view')));
drop policy if exists "crear" on public.legal_lvs_deudas;
create policy "crear" on public.legal_lvs_deudas for insert with check ((select public.has_permission('legal.edit')));
drop policy if exists "editar" on public.legal_lvs_deudas;
create policy "editar" on public.legal_lvs_deudas for update using ((select public.has_permission('legal.edit'))) with check ((select public.has_permission('legal.edit')));
drop policy if exists "eliminar" on public.legal_lvs_deudas;
create policy "eliminar" on public.legal_lvs_deudas for delete using ((select public.has_permission('legal.edit')));
drop trigger if exists touch on public.legal_lvs_deudas;
create trigger touch before update on public.legal_lvs_deudas for each row execute function public.touch_updated_at();

-- Historial compartido con bienes y juicios (se amplía el nombre legible)
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
    when 'legal_lvs_deudas' then 'Deuda'
    else 'Bien mueble o financiero' end;
  v_accion text := case tg_op when 'INSERT' then 'agregado' when 'DELETE' then 'quitado' else 'editado' end;
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.legal_clients where id = v_client) then
    return old;
  end if;
  if tg_table_name = 'legal_lvs_deudas' then
    v_accion := case tg_op when 'INSERT' then 'agregada' when 'DELETE' then 'quitada' else 'editada' end;
  end if;
  insert into public.legal_case_history (client_id, actor_id, actor_name, kind, summary, before, after)
  values (v_client, auth.uid(), public.member_name(auth.uid()), 'lvs', v_que || ' ' || v_accion || coalesce(': ' || ((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end) ->> 'nombre'), ''),
    case when tg_op = 'INSERT' then null else to_jsonb(old) - 'created_at' - 'updated_at' end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) - 'created_at' - 'updated_at' end);
  perform public.audit('lvs.bien.' || v_accion, tg_table_name, coalesce(new.id, old.id)::text, null, jsonb_build_object('cliente', v_client));
  return coalesce(new, old);
end $$;
drop trigger if exists history on public.legal_lvs_deudas;
create trigger history after insert or update or delete on public.legal_lvs_deudas for each row execute function public.legal_lvs_bienes_history();
