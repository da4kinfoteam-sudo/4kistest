-- Permissions closure follow-up: policy reads must fail closed.
-- Ordinary users must never inherit permissive client/default behavior when
-- the centralized DCF policy is missing or malformed. Super Admin retains a
-- protected recovery path for status/period administration.

create or replace function public.dcf_status_action_allowed(
  p_module text,
  p_action text,
  p_status text,
  p_operating_unit text default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users%rowtype;
  v_key text := public.dcf_module_key(p_module);
  v_policy jsonb;
  v_value jsonb;
  v_allowed boolean;
begin
  select * into v_actor from public.users where auth_id = auth.uid() and is_active = true;
  if v_actor.id is null then return false; end if;
  if v_actor.role = 'Super Admin' then return true; end if;
  if p_operating_unit is not null and not public.current_user_has_access(p_module, 'view', p_operating_unit) then return false; end if;
  if not public.current_user_has_access(p_module, p_action, p_operating_unit) then return false; end if;
  if p_action in ('edit_financial_actual', 'delete_financial_actual')
     and not public.current_user_has_access('Accomplishment - Financial', p_action, p_operating_unit) then
    return false;
  end if;
  if p_action = 'edit_physical_actual'
     and not public.current_user_has_access('Accomplishment - Physical', p_action, p_operating_unit) then
    return false;
  end if;

  select settings into v_policy from public.dcf_policy_settings where settings_key = 'dcf_editing_policy';
  if not found or coalesce(jsonb_typeof(v_policy), '') <> 'object' then
    return false;
  end if;
  if v_key is not null then
    v_value := v_policy #> array['roleRules', v_actor.role, v_key, coalesce(p_status, 'Proposed'), p_action];
    if jsonb_typeof(v_value) = 'boolean' then v_allowed := (v_value #>> '{}')::boolean; end if;
  end if;
  v_allowed := coalesce(v_allowed, public.dcf_default_action_allowed(v_actor.role, coalesce(p_status, 'Proposed'), p_action));
  -- Status ceilings remain protected from an over-broad or malformed matrix.
  if p_status in ('Cancelled', 'Unfilled') then return false; end if;
  if p_status in ('Completed', 'Filled')
     and p_action not in ('edit_financial_actual', 'delete_financial_actual') then
    return false;
  end if;
  return v_allowed;
end;
$$;

create or replace function public.dcf_transition_allowed(
  p_entity_type text,
  p_from text,
  p_to text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users%rowtype;
  v_settings jsonb;
  v_value jsonb;
begin
  select * into v_actor from public.users where auth_id = auth.uid() and is_active = true;
  if v_actor.id is null then return false; end if;
  select settings into v_settings from public.dcf_policy_settings where settings_key = 'dcf_editing_policy';
  if not found or coalesce(jsonb_typeof(v_settings), '') <> 'object' then
    return v_actor.role = 'Super Admin';
  end if;
  if p_from = p_to then return true; end if;
  v_value := v_settings #> array['transitionRules', p_entity_type, coalesce(p_from, 'Proposed'), coalesce(p_to, 'Proposed')];
  if jsonb_typeof(v_value) = 'boolean' then return (v_value #>> '{}')::boolean; end if;
  return public.dcf_default_transition_allowed(p_entity_type, p_from, p_to);
end;
$$;

create or replace function public.request_dcf_override(
  p_module text,
  p_action text,
  p_target_type text default null,
  p_target_id text default null,
  p_target_month text default null,
  p_operating_unit text default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users%rowtype;
  v_policy jsonb;
  v_id bigint;
begin
  select * into v_actor from public.users where auth_id = auth.uid() and is_active = true;
  if v_actor.id is null then raise exception 'Active authenticated profile required'; end if;
  if p_action not in ('edit_financial_actual', 'delete_financial_actual', 'edit_physical_actual') then
    raise exception 'Unsupported DCF override action';
  end if;
  select settings into v_policy from public.dcf_policy_settings where settings_key = 'dcf_editing_policy';
  if v_actor.role <> 'Super Admin' and (not found or coalesce(jsonb_typeof(v_policy), '') <> 'object') then
    raise exception 'DCF policy settings are unavailable';
  end if;
  if v_actor.role <> 'Super Admin' and p_action in ('edit_financial_actual', 'delete_financial_actual')
     and not public.current_user_has_access(p_module, 'override_financial_lock', p_operating_unit)
     and not public.current_user_has_access('Accomplishment - Financial', 'override_period', p_operating_unit) then
    raise exception 'Financial override permission is required';
  end if;
  if v_actor.role <> 'Super Admin' and p_action = 'edit_physical_actual'
     and not public.current_user_has_access(p_module, 'override_physical_lock', p_operating_unit)
     and not public.current_user_has_access('Accomplishment - Physical', 'override_period', p_operating_unit) then
    raise exception 'Physical override permission is required';
  end if;
  if v_actor.role <> 'Super Admin' and (p_reason is null or nullif(trim(p_reason), '') is null) then
    raise exception 'An override reason is required';
  end if;
  if v_actor.role = 'Super Admin' then
    perform set_config('app.dcf_override_audit', 'true', true);
    perform public.log_authorization_event(
      p_module, p_action, p_target_type, p_target_id, p_operating_unit,
      null, jsonb_build_object('target_month', p_target_month),
      'Protected Super Admin automatic override', 'allowed',
      jsonb_build_object('source', 'request_dcf_override', 'automatic', true, 'authorized_by_override', true)
    );
    return jsonb_build_object('allowed', true, 'automatic', true);
  end if;
  insert into public.dcf_override_grants(actor_user_id, module, action, target_type, target_id, target_month, reason)
  values (v_actor.id, p_module, p_action, p_target_type, p_target_id, p_target_month, nullif(trim(p_reason), ''))
  returning id into v_id;
  perform set_config('app.dcf_override_audit', 'true', true);
  perform public.log_authorization_event(
    p_module, p_action, p_target_type, p_target_id, p_operating_unit,
    null, jsonb_build_object('target_month', p_target_month),
    p_reason, 'allowed', jsonb_build_object('source', 'request_dcf_override', 'grant_id', v_id, 'authorized_by_override', true)
  );
  return jsonb_build_object('allowed', true, 'grant_id', v_id, 'automatic', false);
end;
$$;

create or replace function public.dcf_period_allowed(
  p_module text,
  p_action text,
  p_target_month text,
  p_operating_unit text default null,
  p_target_type text default null,
  p_target_id text default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users%rowtype;
  v_settings jsonb;
  v_lock jsonb;
  v_target date;
  v_current date;
  v_grace integer;
  v_enabled boolean;
  v_override boolean;
begin
  select * into v_actor from public.users where auth_id = auth.uid() and is_active = true;
  if v_actor.id is null then return false; end if;
  if p_target_month is null or trim(p_target_month) = '' then return false; end if;
  if trim(p_target_month) !~ '^\d{4}-(0[1-9]|1[0-2])(?:-\d{2})?$' then return false; end if;
  begin v_target := to_date(left(trim(p_target_month), 7) || '-01', 'YYYY-MM-DD'); exception when others then return false; end;
  select settings into v_settings from public.dcf_policy_settings where settings_key = 'dcf_editing_policy';
  if not found or coalesce(jsonb_typeof(v_settings), '') <> 'object' then
    return v_actor.role = 'Super Admin';
  end if;
  v_lock := coalesce(v_settings->'monthLock', '{}'::jsonb);
  if coalesce(jsonb_typeof(v_lock), '') <> 'object' then return v_actor.role = 'Super Admin'; end if;
  v_enabled := coalesce((v_lock->>'enabled')::boolean, false);
  if not v_enabled then return true; end if;
  v_current := public.get_app_current_date();
  if v_actor.role = 'Super Admin' then return true; end if;
  if date_trunc('month', v_target) = date_trunc('month', v_current) then return true; end if;
  v_grace := greatest(0, coalesce((v_lock->>'graceDays')::integer, 5));
  if date_trunc('month', v_target) = date_trunc('month', v_current - interval '1 month')
     and extract(day from v_current)::integer <= v_grace then return true; end if;
  v_override := public.dcf_override_grant_exists(p_module, p_action, p_target_type, p_target_id, to_char(v_target, 'YYYY-MM'));
  if v_override then return true; end if;
  if v_target < date_trunc('month', v_current)::date and coalesce((v_lock->>'blockPastMonthsAfterGrace')::boolean, true) then return false; end if;
  if v_target > date_trunc('month', v_current)::date and coalesce((v_lock->>'blockFutureMonths')::boolean, true) then return false; end if;
  return true;
end;
$$;

revoke all on function public.dcf_status_action_allowed(text, text, text, text) from public;
grant execute on function public.dcf_status_action_allowed(text, text, text, text) to authenticated;
revoke all on function public.dcf_transition_allowed(text, text, text) from public;
grant execute on function public.dcf_transition_allowed(text, text, text) to authenticated;
revoke all on function public.request_dcf_override(text, text, text, text, text, text, text) from public;
grant execute on function public.request_dcf_override(text, text, text, text, text, text, text) to authenticated;
revoke all on function public.dcf_period_allowed(text, text, text, text, text, text) from public;
grant execute on function public.dcf_period_allowed(text, text, text, text, text, text) to authenticated;
