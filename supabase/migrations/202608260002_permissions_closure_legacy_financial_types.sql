-- Keep legacy seeded financial rows compatible with the canonical financial
-- source-module resolver while routing new writes through the same DCF guard.
begin;

create or replace function public.financial_actual_source_module(p_row jsonb)
returns text
language sql
immutable
as $$
  select case p_row->>'entity_type'
    when 'subproject_detail' then 'Subprojects'
    when 'subproject' then 'Subprojects'
    when 'activity_expense' then 'Activities'
    when 'activity' then 'Activities'
    when 'office_requirement' then 'Program Management - Office Requirements'
    when 'staffing_expense' then 'Program Management - Staffing Requirements'
    when 'other_program_expense' then 'Program Management - Other Program Expenses'
    else null
  end;
$$;

create or replace function public.application_record_ou(p_table text, p_row jsonb)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_ou text;
  v_parent_id bigint;
  v_entity_type text;
begin
  v_ou := coalesce(p_row->>'operatingUnit', p_row->>'operating_unit');
  if v_ou is not null then return v_ou; end if;
  if p_table in ('financial_obligations','financial_disbursements') then
    v_parent_id := nullif(p_row->>'parent_id', '')::bigint;
    v_entity_type := p_row->>'entity_type';
    if v_entity_type in ('subproject_detail', 'subproject') then select "operatingUnit" into v_ou from public.subprojects where id = v_parent_id;
    elsif v_entity_type in ('activity_expense', 'activity') then select "operatingUnit" into v_ou from public.activities where id = v_parent_id;
    elsif v_entity_type = 'office_requirement' then select "operatingUnit" into v_ou from public.office_requirements where id = v_parent_id;
    elsif v_entity_type = 'staffing_expense' then select "operatingUnit" into v_ou from public.staffing_requirements where id = v_parent_id;
    elsif v_entity_type = 'other_program_expense' then select "operatingUnit" into v_ou from public.other_program_expenses where id = v_parent_id;
    end if;
  elsif p_table in ('activity_ipos','activity_monitoring_reports') then
    select "operatingUnit" into v_ou from public.activities where id = nullif(p_row->>'activity_id', '')::bigint;
  elsif p_table = 'activity_monitoring_actions' then
    select a."operatingUnit" into v_ou from public.activities a
    join public.activity_monitoring_reports r on r.activity_id = a.id
    where r.id = nullif(coalesce(p_row->>'monitoring_report_id', p_row->>'report_id'), '')::bigint;
  elsif p_table = 'subproject_accomplishments' then
    select "operatingUnit" into v_ou from public.subprojects where id = nullif(p_row->>'subproject_id', '')::bigint;
  end if;
  return v_ou;
end;
$$;

create or replace function public.normalize_financial_entity_type()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_type text := case when tg_op = 'DELETE' then old.entity_type else new.entity_type end;
  v_normalized text := case v_type
    when 'subproject' then 'subproject_detail'
    when 'activity' then 'activity_expense'
    else v_type
  end;
begin
  if tg_op = 'DELETE' then
    old.entity_type := v_normalized;
    return old;
  end if;
  new.entity_type := v_normalized;
  return new;
end;
$$;

drop trigger if exists a_normalize_financial_entity_type on public.financial_obligations;
create trigger a_normalize_financial_entity_type
before insert or update or delete on public.financial_obligations
for each row execute function public.normalize_financial_entity_type();

drop trigger if exists a_normalize_financial_entity_type on public.financial_disbursements;
create trigger a_normalize_financial_entity_type
before insert or update or delete on public.financial_disbursements
for each row execute function public.normalize_financial_entity_type();

commit;
