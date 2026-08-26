begin;

-- The first closure migration shipped the two predicates with their
-- comparison sides reversed.  Keep the classifier explicit: a financial-only
-- edit changes financial actuals while the physical projection is unchanged;
-- a physical-only edit does the converse.  Mixed/structural edits continue to
-- require ordinary Edit permission.
create or replace function public.dcf_strip_physical_actual_fields(p_value jsonb)
returns jsonb
language sql
immutable
as $$
  select case jsonb_typeof(p_value)
    when 'object' then coalesce((
      select jsonb_object_agg(key, public.dcf_strip_physical_actual_fields(value) order by key)
      from jsonb_each(coalesce(p_value, '{}'::jsonb))
      where lower(key) not in (
        'actualdate', 'actualenddate', 'actualcompletiondate', 'actualdeliverydate',
        'delivery_date', 'physicaldeliverydate', 'actualnumberofunits',
        'actualparticipantsmale', 'actualparticipantsfemale', 'actualmale',
        'actualfemale', 'actualmalebeneficiaries', 'actualfemalebeneficiaries',
        'actualfourpsbeneficiaries', 'actualpwd', 'actualmuslim', 'actuallgbtq',
        'actualsoloparent', 'actualsenior', 'actualyouth', 'actualyield',
        'actualquantity', 'actualqty', 'iscompleted', 'physical_accomplishment_submitted_at'
      )
    ), '{}'::jsonb)
    when 'array' then coalesce((
      select jsonb_agg(public.dcf_strip_physical_actual_fields(value) order by ordinality)
      from jsonb_array_elements(coalesce(p_value, '[]'::jsonb)) with ordinality
    ), '[]'::jsonb)
    else p_value
  end;
$$;

create or replace function public.dcf_is_financial_only_change(
  p_table text,
  p_before jsonb,
  p_after jsonb
)
returns boolean
language sql
immutable
as $$
  select p_table in (
    'subprojects', 'activities', 'office_requirements',
    'staffing_requirements', 'other_program_expenses'
  )
  and p_before is distinct from p_after
  and public.dcf_strip_financial_actual_fields(p_before)
      is distinct from public.dcf_strip_financial_actual_fields(p_after)
  and public.dcf_strip_physical_actual_fields(p_before)
      = public.dcf_strip_physical_actual_fields(p_after);
$$;

create or replace function public.dcf_is_physical_only_change(
  p_table text,
  p_before jsonb,
  p_after jsonb
)
returns boolean
language sql
immutable
as $$
  select p_table in (
    'subprojects', 'activities', 'office_requirements',
    'staffing_requirements', 'other_program_expenses'
  )
  and p_before is distinct from p_after
  and public.dcf_strip_physical_actual_fields(p_before)
      is distinct from public.dcf_strip_physical_actual_fields(p_after)
  and public.dcf_strip_financial_actual_fields(p_before)
      = public.dcf_strip_financial_actual_fields(p_after);
$$;

-- Super Admin remains subject to valid status values and required audit, but
-- is not constrained by the configurable transition matrix.
create or replace function public.transition_item_status(
  p_entity_type text,
  p_entity_id bigint,
  p_new_status text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users%rowtype;
  v_module text;
  v_table regclass;
  v_column text;
  v_old_status text;
  v_ou text;
begin
  select * into v_actor from public.users where auth_id = auth.uid() and is_active = true;
  if v_actor.id is null then raise exception 'Active authenticated profile required'; end if;
  v_module := public.dcf_entity_module(p_entity_type);
  if v_module is null then raise exception 'Unsupported status entity'; end if;
  v_table := to_regclass('public.' || p_entity_type);
  if v_table is null then raise exception 'Status entity table not found'; end if;
  v_column := case when p_entity_type = 'staffing_requirements' then 'hiringStatus' else 'status' end;
  execute format('select %I, "operatingUnit" from %s where id = $1', v_column, v_table)
    into v_old_status, v_ou using p_entity_id;
  if not found then raise exception 'Status entity not found'; end if;
  if p_new_status is null or p_new_status not in (
    select unnest(case when p_entity_type = 'staffing_requirements'
      then array['Proposed','Filled','Unfilled']::text[]
      else array['Proposed','Ongoing','Completed','Cancelled']::text[] end)
  ) then
    raise exception 'Invalid status transition target';
  end if;
  if p_new_status = v_old_status then
    return jsonb_build_object('status', v_old_status, 'unchanged', true);
  end if;
  if not public.current_user_has_access(v_module, 'manage_status', v_ou) then
    raise exception 'Manage Status permission is required';
  end if;
  if v_actor.role <> 'Super Admin'
     and not public.dcf_transition_allowed(p_entity_type, v_old_status, p_new_status) then
    raise exception 'Invalid % transition: % to %', p_entity_type, v_old_status, p_new_status;
  end if;
  if v_actor.role <> 'Super Admin' and p_new_status in ('Cancelled', 'Unfilled')
     and nullif(trim(p_reason), '') is null then
    raise exception 'A reason is required for % transitions', p_new_status;
  end if;
  perform set_config('app.status_transition', 'true', true);
  execute format('update %s set %I = $1 where id = $2', v_table, v_column)
    using p_new_status, p_entity_id;
  perform public.log_authorization_event(
    v_module, 'manage_status', p_entity_type, p_entity_id::text, v_ou,
    jsonb_build_object('status', v_old_status),
    jsonb_build_object('status', p_new_status), p_reason, 'allowed',
    jsonb_build_object('source', 'transition_item_status', 'super_bypass', v_actor.role = 'Super Admin')
  );
  return jsonb_build_object('status', p_new_status);
end;
$$;

commit;
