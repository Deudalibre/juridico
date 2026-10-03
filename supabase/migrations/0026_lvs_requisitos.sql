-- LVS etapa 2: documentos requeridos del expediente, con estado, vigencia (NCG 22 / Res. Ex. 6619) y respaldo.
-- Las filas las crea el sistema a partir de la Ficha Maestra (origen «fijo» o «regla»); el usuario puede añadir
-- otras («manual»). El archivo vive en legal_documents (bucket legal-documents); aquí solo se enlaza. Idempotente.

create table if not exists public.legal_lvs_requisitos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.legal_clients (id) on delete cascade,
  codigo text not null,
  nombre text not null,
  origen text not null default 'regla' check (origen in ('fijo', 'regla', 'manual')),
  regla text,
  -- A qué bien concreto pertenece (vehículo, inmueble…); null = del expediente en general
  entidad_tipo text,
  entidad_id uuid,
  -- Documento que genera la propia app (anexos, declaración): no se sube, se produce
  generado boolean not null default false,
  -- Vigencia que exige la norma, en días desde la emisión; null = sin plazo
  vigencia_dias integer check (vigencia_dias is null or vigencia_dias > 0),
  fecha_emision date,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'recibido', 'por_revisar', 'aprobado', 'observado', 'vencido', 'no_aplica')),
  document_id uuid references public.legal_documents (id) on delete set null,
  fecha_solicitud timestamptz not null default now(),
  fecha_carga timestamptz,
  cargado_por uuid references auth.users (id) on delete set null,
  fecha_revision timestamptz,
  revisado_por uuid references auth.users (id) on delete set null,
  observacion text,
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists legal_lvs_requisitos_unico
  on public.legal_lvs_requisitos (client_id, codigo, coalesce(entidad_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists legal_lvs_requisitos_client_idx on public.legal_lvs_requisitos (client_id, orden);

alter table public.legal_lvs_requisitos enable row level security;
grant select, insert, update, delete on public.legal_lvs_requisitos to authenticated;
drop policy if exists "requisitos lvs: ver" on public.legal_lvs_requisitos;
create policy "requisitos lvs: ver" on public.legal_lvs_requisitos for select using ((select public.has_permission('legal.view')));
drop policy if exists "requisitos lvs: crear" on public.legal_lvs_requisitos;
create policy "requisitos lvs: crear" on public.legal_lvs_requisitos for insert with check ((select public.has_permission('legal.edit')));
drop policy if exists "requisitos lvs: editar" on public.legal_lvs_requisitos;
create policy "requisitos lvs: editar" on public.legal_lvs_requisitos for update using ((select public.has_permission('legal.edit'))) with check ((select public.has_permission('legal.edit')));
drop policy if exists "requisitos lvs: eliminar" on public.legal_lvs_requisitos;
create policy "requisitos lvs: eliminar" on public.legal_lvs_requisitos for delete using ((select public.has_permission('legal.edit')));

drop trigger if exists legal_lvs_requisitos_touch on public.legal_lvs_requisitos;
create trigger legal_lvs_requisitos_touch before update on public.legal_lvs_requisitos
  for each row execute function public.touch_updated_at();

-- Historial: cada cambio de estado o de archivo queda en la causa (quién, cuándo, de qué a qué) y en la auditoría.
create or replace function public.legal_lvs_requisitos_history()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.origen = 'manual' then
      insert into public.legal_case_history (client_id, actor_id, actor_name, kind, summary, after)
      values (new.client_id, auth.uid(), public.member_name(auth.uid()), 'lvs', 'Documento añadido: ' || new.nombre, jsonb_build_object('codigo', new.codigo));
    end if;
    return new;
  end if;
  if new.estado is distinct from old.estado or new.document_id is distinct from old.document_id then
    insert into public.legal_case_history (client_id, actor_id, actor_name, kind, summary, before, after)
    values (new.client_id, auth.uid(), public.member_name(auth.uid()), 'lvs',
      'Documento «' || new.nombre || '»: ' || old.estado || ' → ' || new.estado,
      jsonb_build_object('estado', old.estado, 'document_id', old.document_id),
      jsonb_build_object('estado', new.estado, 'document_id', new.document_id, 'observacion', new.observacion));
    perform public.audit('lvs.documento', 'legal_lvs_requisito', new.id::text,
      jsonb_build_object('estado', old.estado), jsonb_build_object('estado', new.estado, 'nombre', new.nombre));
  end if;
  return new;
end $$;
drop trigger if exists legal_lvs_requisitos_history on public.legal_lvs_requisitos;
create trigger legal_lvs_requisitos_history after insert or update on public.legal_lvs_requisitos
  for each row execute function public.legal_lvs_requisitos_history();
