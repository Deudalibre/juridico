-- 0014 · Plantillas Word con variables (editor de plantillas del estudio)
-- Idempotente.
--
-- Cada plantilla es un .docx en el bucket privado 'legal-templates' más la lista de variables que usa
-- ({nombre_completo}, {rut}, …). El archivo se reescribe al marcar o quitar variables desde el editor;
-- `version` sube en cada cambio del archivo. Ver: documents.view · crear/editar: documents.edit · borrar: documents.manage.

create table if not exists public.legal_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  procedure_type text,
  storage_path text not null,
  file_name text,
  file_size integer,
  version integer not null default 1,
  variables jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.legal_templates enable row level security;

drop trigger if exists legal_templates_touch on public.legal_templates;
create trigger legal_templates_touch before update on public.legal_templates
  for each row execute function public.touch_updated_at();

drop policy if exists "plantillas: ver" on public.legal_templates;
create policy "plantillas: ver" on public.legal_templates for select using ((select public.has_permission('documents.view')));
drop policy if exists "plantillas: crear" on public.legal_templates;
create policy "plantillas: crear" on public.legal_templates for insert with check ((select public.has_permission('documents.edit')));
drop policy if exists "plantillas: editar" on public.legal_templates;
create policy "plantillas: editar" on public.legal_templates for update using ((select public.has_permission('documents.edit'))) with check ((select public.has_permission('documents.edit')));
drop policy if exists "plantillas: eliminar" on public.legal_templates;
create policy "plantillas: eliminar" on public.legal_templates for delete using ((select public.has_permission('documents.manage')));
grant select, insert, update, delete on public.legal_templates to authenticated;

-- Auditoría: alta, cambios de archivo/variables/nombre y borrado
create or replace function public.legal_templates_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.audit('plantilla.creada', 'plantilla', new.id::text, null, jsonb_build_object('name', new.name, 'file', new.file_name));
    return new;
  elsif tg_op = 'UPDATE' then
    if new.variables is distinct from old.variables or new.version <> old.version or new.name <> old.name or new.procedure_type is distinct from old.procedure_type then
      perform public.audit('plantilla.editada', 'plantilla', new.id::text,
        jsonb_build_object('name', old.name, 'version', old.version, 'variables', jsonb_array_length(old.variables)),
        jsonb_build_object('name', new.name, 'version', new.version, 'variables', jsonb_array_length(new.variables)));
    end if;
    return new;
  else
    perform public.audit('plantilla.eliminada', 'plantilla', old.id::text, jsonb_build_object('name', old.name, 'version', old.version), null);
    return old;
  end if;
end $$;
drop trigger if exists legal_templates_audit on public.legal_templates;
create trigger legal_templates_audit after insert or update or delete on public.legal_templates
  for each row execute function public.legal_templates_audit();

-- Bucket privado solo para .docx
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('legal-templates', 'legal-templates', false, 26214400, array['application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "plantillas word: ver" on storage.objects;
create policy "plantillas word: ver" on storage.objects for select
  using (bucket_id = 'legal-templates' and (select public.has_permission('documents.view')));
drop policy if exists "plantillas word: subir" on storage.objects;
create policy "plantillas word: subir" on storage.objects for insert
  with check (bucket_id = 'legal-templates' and (select public.has_permission('documents.edit')));
drop policy if exists "plantillas word: editar" on storage.objects;
create policy "plantillas word: editar" on storage.objects for update
  using (bucket_id = 'legal-templates' and (select public.has_permission('documents.edit')))
  with check (bucket_id = 'legal-templates' and (select public.has_permission('documents.edit')));
drop policy if exists "plantillas word: eliminar" on storage.objects;
create policy "plantillas word: eliminar" on storage.objects for delete
  using (bucket_id = 'legal-templates' and (select public.has_permission('documents.manage')));
