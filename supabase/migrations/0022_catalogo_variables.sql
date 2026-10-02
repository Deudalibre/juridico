-- 0022 · Catálogo de variables del estudio
--
-- Hasta ahora cada plantilla guardaba sus propias variables. Con el catálogo el estudio define una vez
-- cada dato ({domicilio}, {comuna}, {estado_civil}…) y lo reutiliza en todos los Word: al subir una
-- plantilla, los marcadores que coinciden se reconocen con su etiqueta, tipo y fuente; y en el editor
-- se ofrecen para marcar sin volver a definirlos.
--
-- La fuente es un campo de la ficha del cliente (se rellena sola) o null («se pide al generar»).

create table if not exists public.legal_variables (
  name text primary key check (name ~ '^[a-z][a-z0-9_]{0,39}$'),
  label text not null check (char_length(label) between 1 and 120),
  type text not null default 'texto' check (type in ('texto', 'fecha', 'numero', 'moneda')),
  source text,
  hint text check (hint is null or char_length(hint) <= 240),
  position integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.legal_variables enable row level security;

drop trigger if exists legal_variables_touch on public.legal_variables;
create trigger legal_variables_touch before update on public.legal_variables
  for each row execute function public.touch_updated_at();

drop policy if exists "variables: ver" on public.legal_variables;
create policy "variables: ver" on public.legal_variables for select using ((select public.has_permission('documents.view')));
drop policy if exists "variables: crear" on public.legal_variables;
create policy "variables: crear" on public.legal_variables for insert with check ((select public.has_permission('documents.edit')));
drop policy if exists "variables: editar" on public.legal_variables;
create policy "variables: editar" on public.legal_variables for update using ((select public.has_permission('documents.edit'))) with check ((select public.has_permission('documents.edit')));
drop policy if exists "variables: eliminar" on public.legal_variables;
create policy "variables: eliminar" on public.legal_variables for delete using ((select public.has_permission('documents.manage')));
grant select, insert, update, delete on public.legal_variables to authenticated;

-- Auditoría: alta, cambios y borrado del catálogo
create or replace function public.legal_variables_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.audit('variable.creada', 'variable', new.name, null, jsonb_build_object('label', new.label, 'type', new.type, 'source', new.source));
    return new;
  elsif tg_op = 'UPDATE' then
    perform public.audit('variable.editada', 'variable', new.name,
      jsonb_build_object('label', old.label, 'type', old.type, 'source', old.source),
      jsonb_build_object('label', new.label, 'type', new.type, 'source', new.source));
    return new;
  else
    perform public.audit('variable.eliminada', 'variable', old.name, jsonb_build_object('label', old.label), null);
    return old;
  end if;
end $$;
drop trigger if exists legal_variables_audit on public.legal_variables;
create trigger legal_variables_audit after insert or update or delete on public.legal_variables
  for each row execute function public.legal_variables_audit();
