-- LVS etapa 3: bienes del deudor (art. 273 A n.º 1), una tabla por anexo oficial de la NCG 22 (Anexos 3 a 8).
-- Las columnas son las del formulario de la Superintendencia más lo interno que pide el estudio (detalle del
-- gravamen y motivo de exclusión). Los códigos numéricos (tipo de vehículo, tipo de bien…) se guardan como en
-- el pie de cada anexo. Idempotente.

create table if not exists public.legal_lvs_bienes_raices (          -- Anexo 3
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.legal_clients (id) on delete cascade,
  descripcion text,
  direccion text,
  comuna text,
  region text,
  rol_avaluo text,
  numero_inscripcion text,
  fojas text,
  anio integer,
  conservador text,
  avaluo_fiscal bigint,
  tipo text check (tipo is null or tipo in ('Agrícola', 'No agrícola')),
  hipoteca boolean not null default false,
  hipoteca_detalle text,
  valor_comercial bigint,
  clase_propiedad text,
  fecha_adquisicion date,
  porcentaje_dominio numeric(5,2),
  excluido boolean not null default false,
  motivo_exclusion text,
  observaciones text,
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.legal_lvs_vehiculos (              -- Anexo 4
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.legal_clients (id) on delete cascade,
  tipo_codigo integer check (tipo_codigo is null or tipo_codigo between 1 and 20),
  descripcion text,
  patente text,
  numero_inscripcion text,
  marca text,
  modelo text,
  anio integer,
  avaluo_fiscal bigint,
  tasacion bigint,
  estado text,
  gravamen boolean not null default false,
  gravamen_detalle text,
  excluido boolean not null default false,
  motivo_exclusion text,
  observaciones text,
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.legal_lvs_aguas (                  -- Anexo 5 (A aguas · B concesiones)
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.legal_clients (id) on delete cascade,
  clase text not null default 'agua' check (clase in ('agua', 'concesion')),
  -- A. Derechos de aprovechamiento de aguas
  numero_resolucion text,
  anio_resolucion integer,
  entidad_emisora text,
  tipo_derecho integer check (tipo_derecho is null or tipo_derecho in (1, 2)),
  naturaleza integer check (naturaleza is null or naturaleza in (1, 2)),
  alveo text,
  rol_expediente text,
  conservador text,
  fojas text,
  anio integer,
  -- B. Concesiones
  acto integer check (acto is null or acto in (1, 2)),
  numero text,
  servicio_emisor text,
  tipo text,
  numero_registro text,
  anio_registro integer,
  gravamen boolean not null default false,
  gravamen_detalle text,
  excluido boolean not null default false,
  motivo_exclusion text,
  observaciones text,
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.legal_lvs_participaciones (        -- Anexo 6 (A entidades · B comunidades hereditarias)
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.legal_clients (id) on delete cascade,
  clase text not null default 'entidad' check (clase in ('entidad', 'herencia')),
  titulo integer check (titulo is null or titulo between 1 and 4),
  cantidad_porcentaje text,
  -- A. Entidades
  razon_social text,
  rut text,
  giro text,
  valor bigint,
  -- B. Comunidades hereditarias
  causante_nombre text,
  causante_rut text,
  resolucion_exenta boolean,
  inscripcion_rnt boolean,
  valorizacion bigint,
  fecha_adquisicion date,
  gravamen boolean not null default false,
  gravamen_detalle text,
  excluido boolean not null default false,
  motivo_exclusion text,
  observaciones text,
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.legal_lvs_instrumentos (           -- Anexo 7
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.legal_clients (id) on delete cascade,
  titulo_codigo integer check (titulo_codigo is null or titulo_codigo between 1 and 15),
  emisor text,
  fecha_adquisicion date,
  cantidad text,
  moneda text default 'CLP',
  valor bigint,
  gravamen boolean not null default false,
  gravamen_detalle text,
  excluido boolean not null default false,
  motivo_exclusion text,
  observaciones text,
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.legal_lvs_bienes_muebles (         -- Anexo 8
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.legal_clients (id) on delete cascade,
  tipo_codigo integer check (tipo_codigo is null or tipo_codigo between 1 and 23),
  datos text,
  marca_modelo text,
  cantidad text,
  monto bigint,
  estado_conservacion text,
  direccion text,
  gravamen boolean not null default false,
  gravamen_detalle text,
  excluido boolean not null default false,
  motivo_exclusion text,
  observaciones text,
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Historial común: alta, cambio y baja de cualquier bien quedan en la causa y en la auditoría.
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
    else 'Bien mueble o financiero' end;
  v_accion text := case tg_op when 'INSERT' then 'agregado' when 'DELETE' then 'quitado' else 'editado' end;
begin
  -- Si el cliente se está borrando (cascada), ya no hay dónde anotar el historial
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

do $$
declare t text;
begin
  foreach t in array array['legal_lvs_bienes_raices', 'legal_lvs_vehiculos', 'legal_lvs_aguas', 'legal_lvs_participaciones', 'legal_lvs_instrumentos', 'legal_lvs_bienes_muebles'] loop
    execute format('create index if not exists %I on public.%I (client_id, orden)', t || '_client_idx', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists "ver" on public.%I', t);
    execute format('create policy "ver" on public.%I for select using ((select public.has_permission(''legal.view'')))', t);
    execute format('drop policy if exists "crear" on public.%I', t);
    execute format('create policy "crear" on public.%I for insert with check ((select public.has_permission(''legal.edit'')))', t);
    execute format('drop policy if exists "editar" on public.%I', t);
    execute format('create policy "editar" on public.%I for update using ((select public.has_permission(''legal.edit''))) with check ((select public.has_permission(''legal.edit'')))', t);
    execute format('drop policy if exists "eliminar" on public.%I', t);
    execute format('create policy "eliminar" on public.%I for delete using ((select public.has_permission(''legal.edit'')))', t);
    execute format('drop trigger if exists touch on public.%I', t);
    execute format('create trigger touch before update on public.%I for each row execute function public.touch_updated_at()', t);
    execute format('drop trigger if exists history on public.%I', t);
    execute format('create trigger history after insert or update or delete on public.%I for each row execute function public.legal_lvs_bienes_history()', t);
  end loop;
end $$;
