-- 0012 · Documentos: checklist por procedimiento y archivos del cliente (etapa 4 del área jurídica)
-- Idempotente.

-- Un ítem del checklist puede marcarse como «no aplica» (p. ej. contrato de arriendo si vive en casa propia)
alter table public.legal_checklist_items
  add column if not exists not_applicable boolean not null default false,
  add column if not exists category_id uuid references public.legal_document_categories (id) on delete set null;

alter table public.legal_checklist_template_items
  add column if not exists category_id uuid references public.legal_document_categories (id) on delete set null;

-- Vínculo documento ↔ ítem del checklist (además de legal_checklist_items.document_id, para consultar por documento)
alter table public.legal_documents
  add column if not exists checklist_item_id uuid references public.legal_checklist_items (id) on delete set null;
create index if not exists legal_documents_checklist_idx on public.legal_documents (checklist_item_id);

-- Políticas de checklist (mismo criterio que el resto del área jurídica)
alter table public.legal_checklist_items enable row level security;
alter table public.legal_checklist_templates enable row level security;
alter table public.legal_checklist_template_items enable row level security;

-- Las políticas de 0009 (nombres antiguos) se reemplazan por las de abajo
drop policy if exists "checklist cliente: ver" on public.legal_checklist_items;
drop policy if exists "checklist cliente: crear" on public.legal_checklist_items;
drop policy if exists "checklist cliente: editar" on public.legal_checklist_items;
drop policy if exists "checklist cliente: eliminar" on public.legal_checklist_items;
drop policy if exists "checklist plantillas: ver" on public.legal_checklist_templates;
drop policy if exists "checklist plantillas: administrar" on public.legal_checklist_templates;
drop policy if exists "checklist items plantilla: ver" on public.legal_checklist_template_items;
drop policy if exists "checklist items plantilla: administrar" on public.legal_checklist_template_items;

drop policy if exists "checklist: ver" on public.legal_checklist_items;
create policy "checklist: ver" on public.legal_checklist_items for select using ((select public.has_permission('legal.view')));
drop policy if exists "checklist: crear" on public.legal_checklist_items;
create policy "checklist: crear" on public.legal_checklist_items for insert with check ((select public.has_permission('legal.edit')));
drop policy if exists "checklist: editar" on public.legal_checklist_items;
create policy "checklist: editar" on public.legal_checklist_items for update using ((select public.has_permission('legal.edit'))) with check ((select public.has_permission('legal.edit')));
drop policy if exists "checklist: eliminar" on public.legal_checklist_items;
create policy "checklist: eliminar" on public.legal_checklist_items for delete using ((select public.has_permission('legal.edit')));

drop policy if exists "plantillas checklist: ver" on public.legal_checklist_templates;
create policy "plantillas checklist: ver" on public.legal_checklist_templates for select using ((select public.has_permission('legal.view')));
drop policy if exists "plantillas checklist: administrar" on public.legal_checklist_templates;
create policy "plantillas checklist: administrar" on public.legal_checklist_templates for all using ((select public.has_permission('legal.settings'))) with check ((select public.has_permission('legal.settings')));
drop policy if exists "items plantilla checklist: ver" on public.legal_checklist_template_items;
create policy "items plantilla checklist: ver" on public.legal_checklist_template_items for select using ((select public.has_permission('legal.view')));
drop policy if exists "items plantilla checklist: administrar" on public.legal_checklist_template_items;
create policy "items plantilla checklist: administrar" on public.legal_checklist_template_items for all using ((select public.has_permission('legal.settings'))) with check ((select public.has_permission('legal.settings')));

grant select, insert, update, delete on public.legal_checklist_items, public.legal_checklist_templates, public.legal_checklist_template_items to authenticated;

-- Checklists iniciales por procedimiento (antecedentes que exige la Ley 20.720 al presentar la solicitud).
-- Son una propuesta editable: el estudio los ajusta desde Configuración.
do $$
declare
  t_liq uuid; t_simp uuid; t_ren uuid;
  cat_id uuid; cat_fin uuid; cat_proc uuid; cat_adm uuid;
begin
  select id into cat_id from public.legal_document_categories where name = 'Identificación';
  select id into cat_fin from public.legal_document_categories where name = 'Antecedentes financieros';
  select id into cat_proc from public.legal_document_categories where name = 'Procedimiento';
  select id into cat_adm from public.legal_document_categories where name = 'Administrativos';

  if not exists (select 1 from public.legal_checklist_templates where procedure_type = 'Liquidación voluntaria') then
    insert into public.legal_checklist_templates (name, procedure_type) values ('Liquidación voluntaria · antecedentes', 'Liquidación voluntaria') returning id into t_liq;
    insert into public.legal_checklist_template_items (template_id, label, position, category_id) values
      (t_liq, 'Cédula de identidad (ambos lados)', 1, cat_id),
      (t_liq, 'Certificado de deudas (CMF)', 2, cat_fin),
      (t_liq, 'Lista de bienes con valor estimado y gravámenes', 3, cat_fin),
      (t_liq, 'Bienes de terceros o legalmente excluidos', 4, cat_fin),
      (t_liq, 'Juicios pendientes con efectos patrimoniales', 5, cat_proc),
      (t_liq, 'Estado de deudas: acreedores, montos y vencimientos', 6, cat_fin),
      (t_liq, 'Liquidaciones de sueldo o boletas (últimos 3 meses)', 7, cat_fin),
      (t_liq, 'Declaración jurada (sin liquidación forzosa notificada ni acuerdo vigente)', 8, cat_proc),
      (t_liq, 'Patrocinio y poder del abogado', 9, cat_adm);
  end if;

  if not exists (select 1 from public.legal_checklist_templates where procedure_type = 'Liquidación simplificada') then
    insert into public.legal_checklist_templates (name, procedure_type) values ('Liquidación simplificada · antecedentes', 'Liquidación simplificada') returning id into t_simp;
    insert into public.legal_checklist_template_items (template_id, label, position, category_id) values
      (t_simp, 'Cédula de identidad (ambos lados)', 1, cat_id),
      (t_simp, 'Certificado de deudas (CMF)', 2, cat_fin),
      (t_simp, 'Lista de bienes con valor estimado y gravámenes', 3, cat_fin),
      (t_simp, 'Estado de deudas: acreedores, montos y vencimientos', 4, cat_fin),
      (t_simp, 'Liquidaciones de sueldo o boletas (últimos 3 meses)', 5, cat_fin),
      (t_simp, 'Declaración jurada de cumplir los requisitos del art. 273 A', 6, cat_proc),
      (t_simp, 'Patrocinio y poder del abogado', 7, cat_adm);
  end if;

  if not exists (select 1 from public.legal_checklist_templates where procedure_type = 'Renegociación') then
    insert into public.legal_checklist_templates (name, procedure_type) values ('Renegociación · antecedentes', 'Renegociación') returning id into t_ren;
    insert into public.legal_checklist_template_items (template_id, label, position, category_id) values
      (t_ren, 'Cédula de identidad (ambos lados)', 1, cat_id),
      (t_ren, 'Declaración jurada de deudas, con documentos que las acrediten', 2, cat_fin),
      (t_ren, 'Certificado de deudas (CMF)', 3, cat_fin),
      (t_ren, 'Ingresos: liquidaciones, boletas o pensión (últimos 3 meses)', 4, cat_fin),
      (t_ren, 'Lista de bienes con valor estimado', 5, cat_fin),
      (t_ren, 'Certificado de cotizaciones (AFP)', 6, cat_fin),
      (t_ren, 'Propuesta de renegociación', 7, cat_proc);
  end if;
end $$;
