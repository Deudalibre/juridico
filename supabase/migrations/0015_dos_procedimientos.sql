-- 0015 · Solo dos procedimientos: Liquidación voluntaria y Renegociación
-- Idempotente. La «Liquidación simplificada» no se distingue (es la misma liquidación voluntaria por dentro),
-- así que se retira su checklist sembrado en 0012 y cualquier causa o plantilla marcada así pasa a Liquidación voluntaria.

update public.legal_clients set procedure_type = 'Liquidación voluntaria' where procedure_type = 'Liquidación simplificada';
update public.legal_templates set procedure_type = 'Liquidación voluntaria' where procedure_type = 'Liquidación simplificada';

delete from public.legal_checklist_template_items
  where template_id in (select id from public.legal_checklist_templates where procedure_type = 'Liquidación simplificada');
delete from public.legal_checklist_templates where procedure_type = 'Liquidación simplificada';
