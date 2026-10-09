-- =====================================================================
-- Jurídico · migración 0038 · cola de sincronización con el PJUD, priorizada
--
-- Una sola función decide el orden en que se leen las causas en la OJV; la usan el script del estudio
-- (scripts/pjud-sync.mts), la ruta /api/pjud/sync y la descarga de PDFs (scripts/pjud-download-docs.mts):
--   1. primero las causas con alguna actuación de p_desde en adelante (por defecto, el primer día de hace dos meses: hoy,
--      2026-08-01), leída dentro del jsonb cuadernos → actuaciones. Se mira fecha_diligencia y, si no la hay (la OJV casi
--      nunca la publica: 0 de 2.985 actuaciones al 2026-10-09), fecha_registro, que es la «Fec. Trámite» del PJUD;
--   2. después, las que llevan más tiempo sin sincronizar (synced_at ascendente, las nunca leídas primero);
--   3. nunca las causas cuya última lectura falló porque el PJUD no encontró el rol en ese tribunal, mientras el dato de
--      la causa (rol/tribunal) no se haya corregido después del error (legal_clients.updated_at > error_at).
-- =====================================================================

create or replace function public.pjud_cola_sync(p_limite int default null, p_desde date default null)
returns table (client_id uuid, rol text, tribunal text, synced_at timestamptz, error text, prioridad int)
language sql stable security definer set search_path = public as $$
  with desde as (select coalesce(p_desde, (date_trunc('month', now() - interval '2 months'))::date) as d)
  select c.id, c.rol, c.tribunal, d.synced_at, d.error,
         case when exists (
           select 1 from jsonb_array_elements(coalesce(d.cuadernos, '[]'::jsonb)) q, jsonb_array_elements(coalesce(q->'actuaciones', '[]'::jsonb)) a
            where coalesce(nullif(a->>'fecha_diligencia', ''), nullif(a->>'fecha_registro', ''))::date >= (select d from desde)
         ) then 0 else 1 end as prioridad
    from public.legal_clients c
    left join public.pjud_causa_data d on d.client_id = c.id
   where (auth.role() is null or auth.role() = 'service_role' or public.has_permission('legal.view')) -- sin JWT = SQL directo (migraciones, db:sql)
     and c.archived_at is null and c.rol is not null and c.tribunal is not null
     and c.rol ~* '^[A-Z]-[0-9]+-[0-9]{4}$'
     -- «tribunal no encontrado»: el PJUD no halló ese rol en ese tribunal (o la búsqueda fue ambigua); se omite hasta corregir el dato
     and not (d.error is not null and d.error_at is not null
              and (d.synced_at is null or d.error_at > d.synced_at)
              and d.error ~* 'No se encontr|no se puede elegir sin ambig'
              and c.updated_at <= d.error_at)
   order by prioridad asc, d.synced_at asc nulls first, c.created_at asc
   limit p_limite
$$;
revoke all on function public.pjud_cola_sync(int, date) from public, anon;
grant execute on function public.pjud_cola_sync(int, date) to authenticated, service_role;
