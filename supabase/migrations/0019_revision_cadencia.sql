-- Cadencia automática de revisión y aviso diario.
--
-- La próxima revisión ya no la elige quien revisa: sale del estado de la causa. Mientras no tenga el hito
-- (resolución de liquidación, o «Ejecución» en renegociación) se revisa cada 3 días; después, cada 7. Cada
-- mañana hábil un aviso en la campana le dice a cada abogado cuántas causas le tocan (y cuántas siguen sin
-- resolución), y al administrador cuáles llevan el doble del plazo sin revisarse.

-- Días de cadencia según el estado de la causa (misma regla que src/lib/legal.ts → reviewCadence)
create or replace function public.legal_review_cadence_days(p_client uuid)
returns int language sql stable security definer set search_path = public as $$
  select case
    when exists (
      select 1 from public.legal_case_steps s
      join public.legal_clients c on c.id = s.client_id
      where s.client_id = p_client
        and s.step = case when c.procedure_type = 'Renegociación' then 'Ejecución' else 'Resolución de liquidación' end
    ) then 7
    else 3
  end;
$$;
revoke all on function public.legal_review_cadence_days(uuid) from public, anon;
grant execute on function public.legal_review_cadence_days(uuid) to authenticated;

-- Aviso diario: a cada abogado sus causas por revisar; al administrador las descuidadas
create or replace function public.legal_review_digest()
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_total int; v_critical int; v_neglected int; v_names text;
begin
  for r in select id, role from public.profiles where active and role in ('juridico', 'administrador') loop
    select count(*), count(*) filter (where public.legal_review_cadence_days(c.id) = 3)
      into v_total, v_critical
      from public.legal_clients c
      where c.archived_at is null and c.lawyer_id = r.id
        and (c.last_review_at is null or c.next_review_at is null or c.next_review_at <= now());
    if v_total > 0 and not exists (
      select 1 from public.notifications n where n.user_id = r.id and n.title like 'Causas por revisar hoy%' and n.created_at::date = current_date
    ) then
      perform public.legal_notify(r.id, null,
        format('Causas por revisar hoy: %s', v_total),
        case when v_critical > 0 then format('%s sin resolución de liquidación. Entra a Revisión → Por revisar.', v_critical) else 'Entra a Revisión → Por revisar.' end);
    end if;

    if r.role = 'administrador' then
      select count(*), string_agg(c.full_name, ', ' order by c.next_review_at) filter (where rn <= 5)
        into v_neglected, v_names
        from (
          select c.*, row_number() over (order by c.next_review_at) as rn
          from public.legal_clients c
          where c.archived_at is null
            and coalesce(c.next_review_at, c.created_at) < now() - (public.legal_review_cadence_days(c.id) || ' days')::interval
        ) c;
      if v_neglected > 0 and not exists (
        select 1 from public.notifications n where n.user_id = r.id and n.title like 'Causas descuidadas%' and n.created_at::date = current_date
      ) then
        perform public.legal_notify(r.id, null,
          format('Causas descuidadas: %s', v_neglected),
          format('Llevan el doble del plazo sin revisión. %s%s', coalesce(v_names, ''), case when v_neglected > 5 then '…' else '' end));
      end if;
    end if;
  end loop;
end $$;
revoke all on function public.legal_review_digest() from public, anon, authenticated;

-- Todos los días hábiles a las 11:30 UTC (08:30 en Chile con horario de verano, 07:30 en invierno)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'juridico-revision-digest';
    perform cron.schedule('juridico-revision-digest', '30 11 * * 1-5', 'select public.legal_review_digest()');
  end if;
end $$;
