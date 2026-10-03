-- LVS etapa 4: plantillas con papel fijo («slot») y registro de los documentos generados.
-- Una plantilla con slot es la que usa la app para producir ese documento (anexo8, anexo9, declaracion_273a,
-- demanda_lvs); su versión queda anotada en cada documento generado. Idempotente.

alter table public.legal_templates add column if not exists slot text;
create unique index if not exists legal_templates_slot_unico on public.legal_templates (slot) where slot is not null;
comment on column public.legal_templates.slot is 'Papel fijo en la LVS: anexo8, anexo9, declaracion_273a, demanda_lvs';

create table if not exists public.legal_lvs_generados (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.legal_clients (id) on delete cascade,
  tipo text not null check (tipo in ('anexo8', 'anexo9', 'declaracion_273a', 'demanda_lvs', 'anexo3', 'anexo4', 'anexo5', 'anexo6', 'anexo7')),
  template_id uuid references public.legal_templates (id) on delete set null,
  template_version integer,
  document_id uuid references public.legal_documents (id) on delete set null,
  storage_path text not null,
  file_name text not null,
  estado text not null default 'borrador' check (estado in ('borrador', 'final', 'reemplazado')),
  replaces_id uuid references public.legal_lvs_generados (id) on delete set null,
  datos jsonb,
  advertencias jsonb,
  generado_por uuid default auth.uid() references auth.users (id) on delete set null,
  generado_at timestamptz not null default now()
);
create index if not exists legal_lvs_generados_client_idx on public.legal_lvs_generados (client_id, generado_at desc);

alter table public.legal_lvs_generados enable row level security;
grant select, insert, update, delete on public.legal_lvs_generados to authenticated;
drop policy if exists "generados: ver" on public.legal_lvs_generados;
create policy "generados: ver" on public.legal_lvs_generados for select using ((select public.has_permission('legal.view')));
drop policy if exists "generados: crear" on public.legal_lvs_generados;
create policy "generados: crear" on public.legal_lvs_generados for insert with check ((select public.has_permission('documents.edit')));
drop policy if exists "generados: editar" on public.legal_lvs_generados;
create policy "generados: editar" on public.legal_lvs_generados for update using ((select public.has_permission('documents.edit'))) with check ((select public.has_permission('documents.edit')));
drop policy if exists "generados: eliminar" on public.legal_lvs_generados;
create policy "generados: eliminar" on public.legal_lvs_generados for delete using ((select public.has_permission('documents.manage')));

create or replace function public.legal_lvs_generados_history()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.legal_case_history (client_id, actor_id, actor_name, kind, summary, after)
    values (new.client_id, auth.uid(), public.member_name(auth.uid()), 'lvs', 'Documento generado: ' || new.file_name,
      jsonb_build_object('tipo', new.tipo, 'plantilla', new.template_id, 'version', new.template_version));
    perform public.audit('lvs.generado', 'legal_lvs_generado', new.id::text, null, jsonb_build_object('tipo', new.tipo, 'cliente', new.client_id));
  elsif new.estado is distinct from old.estado then
    insert into public.legal_case_history (client_id, actor_id, actor_name, kind, summary, before, after)
    values (new.client_id, auth.uid(), public.member_name(auth.uid()), 'lvs', 'Documento ' || new.file_name || ': ' || old.estado || ' → ' || new.estado,
      jsonb_build_object('estado', old.estado), jsonb_build_object('estado', new.estado));
  end if;
  return new;
end $$;
drop trigger if exists legal_lvs_generados_history on public.legal_lvs_generados;
create trigger legal_lvs_generados_history after insert or update on public.legal_lvs_generados
  for each row execute function public.legal_lvs_generados_history();
