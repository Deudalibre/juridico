-- Expediente de Liquidación Voluntaria Simplificada (LVS), etapa 1: la Ficha Maestra.
-- Un expediente por cliente (1 a 1 con legal_clients: nombre, RUT, teléfono, correo, abogado y causa ya viven ahí).
-- Aquí van los datos que piden la demanda, la Declaración 273-A y los anexos, y las ocho respuestas del art. 273 A
-- que abren las listas (bienes, juicios) y deciden los párrafos de la demanda. Idempotente.

create table if not exists public.legal_lvs (
  client_id uuid primary key references public.legal_clients (id) on delete cascade,
  -- Antecedentes personales (los que no están en legal_clients)
  genero text check (genero in ('F', 'M')),
  nacionalidad text not null default 'chilena',
  estado_civil text check (estado_civil is null or estado_civil in ('Soltero/a', 'Casado/a', 'Divorciado/a', 'Viudo/a', 'Conviviente civil', 'Separado/a')),
  profesion_oficio text,
  domicilio text,
  comuna text,
  region text,
  -- Situación laboral
  relacion_laboral boolean,
  situacion_laboral text,
  empleador text,
  rut_empleador text,
  fecha_inicio_contrato date,
  tipo_contrato text,
  ingreso_liquido integer check (ingreso_liquido is null or ingreso_liquido >= 0),
  -- Tribunal / competencia (sin automatizar: se guarda lo elegido)
  comuna_tribunal text,
  sj_comuna text,
  -- Carta de insolvencia: el texto del cliente y la versión preparada para la demanda
  carta_original text,
  carta_demanda text,
  -- Art. 273 A: null = sin responder
  tiene_bienes_raices boolean,
  tiene_vehiculos boolean,
  tiene_aguas boolean,
  tiene_participaciones boolean,
  tiene_instrumentos boolean,
  tiene_bienes_muebles boolean,
  tiene_juicios boolean,
  tiene_bienes_excluidos boolean,
  -- Estado del expediente
  estado text not null default 'borrador' check (estado in ('borrador', 'ficha_completa', 'documentacion', 'lista', 'generada', 'presentada')),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.legal_lvs is 'Ficha Maestra LVS: única fuente de datos para demanda, Declaración 273-A y anexos';

alter table public.legal_lvs enable row level security;
grant select, insert, update, delete on public.legal_lvs to authenticated;

drop policy if exists "lvs: ver" on public.legal_lvs;
create policy "lvs: ver" on public.legal_lvs for select using ((select public.has_permission('legal.view')));
drop policy if exists "lvs: crear" on public.legal_lvs;
create policy "lvs: crear" on public.legal_lvs for insert with check ((select public.has_permission('legal.create')));
drop policy if exists "lvs: editar" on public.legal_lvs;
create policy "lvs: editar" on public.legal_lvs for update using ((select public.has_permission('legal.edit'))) with check ((select public.has_permission('legal.edit')));
drop policy if exists "lvs: eliminar" on public.legal_lvs;
create policy "lvs: eliminar" on public.legal_lvs for delete using ((select public.has_permission('legal.settings')));

drop trigger if exists legal_lvs_touch on public.legal_lvs;
create trigger legal_lvs_touch before update on public.legal_lvs
  for each row execute function public.touch_updated_at();

-- Historial del expediente: qué campos cambiaron, valor anterior y nuevo, quién y cuándo
-- (legal_case_history, visible en la pestaña Historial) más la auditoría global.
create or replace function public.legal_lvs_history()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_after jsonb;
  v_before jsonb;
  v_keys text;
begin
  if tg_op = 'INSERT' then
    insert into public.legal_case_history (client_id, actor_id, actor_name, kind, summary)
    values (new.client_id, auth.uid(), public.member_name(auth.uid()), 'lvs', 'Expediente LVS creado');
    perform public.audit('lvs.creado', 'legal_lvs', new.client_id::text, null, null);
    return new;
  end if;
  select jsonb_object_agg(e.key, e.value) into v_after
    from jsonb_each(to_jsonb(new)) e
    where e.key not in ('updated_at', 'created_at', 'created_by') and to_jsonb(old) -> e.key is distinct from e.value;
  if v_after is null then
    return new;
  end if;
  select jsonb_object_agg(k, to_jsonb(old) -> k) into v_before from jsonb_object_keys(v_after) k;
  select string_agg(k, ', ' order by k) into v_keys from jsonb_object_keys(v_after) k;
  insert into public.legal_case_history (client_id, actor_id, actor_name, kind, summary, before, after)
  values (new.client_id, auth.uid(), public.member_name(auth.uid()), 'lvs', 'Ficha LVS: ' || v_keys, v_before, v_after);
  perform public.audit('lvs.editado', 'legal_lvs', new.client_id::text, v_before, v_after);
  return new;
end $$;

drop trigger if exists legal_lvs_history on public.legal_lvs;
create trigger legal_lvs_history after insert or update on public.legal_lvs
  for each row execute function public.legal_lvs_history();
