-- Permissions closure: server-side DCF/status/period guards, controlled overrides,
-- explicit transition matrices, and protected role-default administration.

begin;

create table if not exists public.dcf_override_grants (
  id bigint generated always as identity primary key,
  actor_user_id bigint not null references public.users(id),
  module text not null,
  action text not null,
  target_type text,
  target_id text,
  target_month text,
  reason text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 minutes'),
  used_at timestamptz
);

create index if not exists dcf_override_grants_lookup_idx
  on public.dcf_override_grants(actor_user_id, module, action, target_type, target_id, target_month, used_at);

alter table public.dcf_override_grants enable row level security;
revoke all on public.dcf_override_grants from anon, authenticated;

create or replace function public.dcf_module_key(p_module text)
returns text
language sql
immutable
as $$
  select case p_module
    when 'Subprojects' then 'subprojects'
    when 'Activities' then 'activities'
    when 'Program Management - Office Requirements' then 'office_requirements'
    when 'Program Management - Staffing Requirements' then 'staffing_requirements'
    when 'Program Management - Other Program Expenses' then 'other_program_expenses'
    else null
  end;
$$;

create or replace function public.dcf_entity_module(p_entity_type text)
returns text
language sql
immutable
as $$
  select case p_entity_type
    when 'subprojects' then 'Subprojects'
    when 'activities' then 'Activities'
    when 'office_requirements' then 'Program Management - Office Requirements'
    when 'staffing_requirements' then 'Program Management - Staffing Requirements'
    when 'other_program_expenses' then 'Program Management - Other Program Expenses'
    else null
  end;
$$;

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

-- Financial actuals are stored both in dedicated tables and in legacy JSON
-- columns on the five DCF entity tables.  These helpers classify a parent-row
-- update without treating physical actuals, targets, status, or workflow state
-- as financial changes.  They are intentionally immutable so the same
-- classification can be used by triggers and direct RPC tests.
create or replace function public.dcf_strip_financial_actual_fields(p_value jsonb)
returns jsonb
language sql
immutable
as $$
  select case jsonb_typeof(p_value)
    when 'object' then coalesce((
      select jsonb_object_agg(key, public.dcf_strip_financial_actual_fields(value) order by key)
      from jsonb_each(coalesce(p_value, '{}'::jsonb))
      where lower(key) not in ('obligations', 'disbursements', 'actualamount', 'obligatedamount', 'actuals')
        and lower(key) not like 'actualobligation%'
        and lower(key) not like 'actualdisbursement%'
    ), '{}'::jsonb)
    when 'array' then coalesce((
      select jsonb_agg(public.dcf_strip_financial_actual_fields(value) order by ordinality)
      from jsonb_array_elements(coalesce(p_value, '[]'::jsonb)) with ordinality
    ), '[]'::jsonb)
    else p_value
  end;
$$;

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
        'actualdate', 'actualenddate', 'actualcompletiondate', 'actualnumberofunits',
        'actualparticipantsmale', 'actualparticipantsfemale', 'actualpwd', 'actualmuslim',
        'actuallgbtq', 'actualsoloparent', 'actualsenior', 'actualyouth', 'actualyield',
        'iscompleted', 'physical_accomplishment_submitted_at'
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
      = public.dcf_strip_financial_actual_fields(p_after)
  and public.dcf_strip_physical_actual_fields(p_before)
      is distinct from public.dcf_strip_physical_actual_fields(p_after);
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
      = public.dcf_strip_physical_actual_fields(p_after)
  and public.dcf_strip_financial_actual_fields(p_before)
      is distinct from public.dcf_strip_financial_actual_fields(p_after);
$$;

create or replace function public.dcf_collect_actual_months(
  p_value jsonb,
  p_kind text,
  p_context text default null
)
returns table(month text)
language plpgsql
immutable
as $$
declare
  v_pair record;
  v_child text;
begin
  if p_value is null then return; end if;
  if jsonb_typeof(p_value) = 'object' then
    for v_pair in select key, value from jsonb_each(p_value) loop
      if jsonb_typeof(v_pair.value) in ('object', 'array') then
        return query select m.month
        from public.dcf_collect_actual_months(v_pair.value, p_kind, lower(v_pair.key)) m;
      elsif jsonb_typeof(v_pair.value) = 'string' then
        v_child := left(v_pair.value #>> '{}', 7);
        if v_child ~ '^\d{4}-(0[1-9]|1[0-2])'
           and (
             (p_kind = 'financial' and (
               lower(v_pair.key) in ('actualobligationdate', 'actualdisbursementdate')
               or (p_context in ('obligations', 'disbursements') and lower(v_pair.key) = 'date')
             ))
             or (p_kind = 'physical' and lower(v_pair.key) in (
               'actualdate', 'actualenddate', 'actualcompletiondate',
               'actualdeliverydate', 'delivery_date', 'physicaldeliverydate'
             ))
           ) then
          month := v_child;
          return next;
        end if;
      end if;
    end loop;
  elsif jsonb_typeof(p_value) = 'array' then
    for v_pair in select value from jsonb_array_elements(p_value) loop
      return query select m.month
      from public.dcf_collect_actual_months(v_pair.value, p_kind, p_context) m;
    end loop;
  end if;
end;
$$;

create or replace function public.dcf_default_action_allowed(
  p_role text,
  p_status text,
  p_action text
)
returns boolean
language sql
immutable
as $$
  select case
    when p_role = 'Super Admin' then true
    when p_role in ('Management', 'Guest') then false
    when p_status in ('Cancelled', 'Unfilled') then false
    when p_status = 'Proposed' and p_action in ('create', 'edit', 'delete') then true
    when p_status = 'Ongoing' and p_action in ('edit_physical_actual', 'edit_financial_actual') then true
    when p_status in ('Completed', 'Filled') and p_action in ('edit_financial_actual', 'delete_financial_actual') then true
    else false
  end;
$$;

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
  if v_key is not null then
    v_value := v_policy #> array['roleRules', v_actor.role, v_key, coalesce(p_status, 'Proposed'), p_action];
    if jsonb_typeof(v_value) = 'boolean' then v_allowed := (v_value #>> '{}')::boolean; end if;
  end if;
  v_allowed := coalesce(v_allowed, public.dcf_default_action_allowed(v_actor.role, coalesce(p_status, 'Proposed'), p_action));
  -- These status ceilings are not ordinary role defaults.  They prevent a
  -- malformed or over-broad DCF JSON policy from reopening locked physical or
  -- structural fields.  Financial posting remains independently governable.
  if p_status in ('Cancelled', 'Unfilled') then return false; end if;
  if p_status in ('Completed', 'Filled')
     and p_action not in ('edit_financial_actual', 'delete_financial_actual') then
    return false;
  end if;
  return v_allowed;
end;
$$;

create or replace function public.dcf_default_transition_allowed(
  p_entity_type text,
  p_from text,
  p_to text
)
returns boolean
language sql
immutable
as $$
  select case
    when p_from = p_to then true
    when p_entity_type = 'staffing_requirements' and p_from = 'Proposed' and p_to in ('Filled', 'Unfilled') then true
    when p_entity_type = 'staffing_requirements' and p_from = 'Unfilled' and p_to = 'Filled' then true
    when p_entity_type <> 'staffing_requirements' and p_from = 'Proposed' and p_to in ('Ongoing', 'Cancelled') then true
    when p_entity_type <> 'staffing_requirements' and p_from = 'Ongoing' and p_to in ('Completed', 'Cancelled') then true
    else false
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
  v_settings jsonb;
  v_value jsonb;
begin
  if p_from = p_to then return true; end if;
  select settings into v_settings from public.dcf_policy_settings where settings_key = 'dcf_editing_policy';
  v_value := v_settings #> array['transitionRules', p_entity_type, coalesce(p_from, 'Proposed'), coalesce(p_to, 'Proposed')];
  if jsonb_typeof(v_value) = 'boolean' then return (v_value #>> '{}')::boolean; end if;
  return public.dcf_default_transition_allowed(p_entity_type, p_from, p_to);
end;
$$;

-- Seed an explicit, reviewable default matrix without overwriting a matrix
-- already configured in User Settings.  Same-state writes are always allowed
-- by the function above.
update public.dcf_policy_settings
set settings = settings || jsonb_build_object(
  'transitionRules', jsonb_build_object(
    'subprojects', jsonb_build_object(
      'Proposed', jsonb_build_object('Ongoing', true, 'Cancelled', true),
      'Ongoing', jsonb_build_object('Completed', true, 'Cancelled', true),
      'Completed', jsonb_build_object(), 'Cancelled', jsonb_build_object()
    ),
    'activities', jsonb_build_object(
      'Proposed', jsonb_build_object('Ongoing', true, 'Cancelled', true),
      'Ongoing', jsonb_build_object('Completed', true, 'Cancelled', true),
      'Completed', jsonb_build_object(), 'Cancelled', jsonb_build_object()
    ),
    'office_requirements', jsonb_build_object(
      'Proposed', jsonb_build_object('Ongoing', true, 'Cancelled', true),
      'Ongoing', jsonb_build_object('Completed', true, 'Cancelled', true),
      'Completed', jsonb_build_object(), 'Cancelled', jsonb_build_object()
    ),
    'other_program_expenses', jsonb_build_object(
      'Proposed', jsonb_build_object('Ongoing', true, 'Cancelled', true),
      'Ongoing', jsonb_build_object('Completed', true, 'Cancelled', true),
      'Completed', jsonb_build_object(), 'Cancelled', jsonb_build_object()
    ),
    'staffing_requirements', jsonb_build_object(
      'Proposed', jsonb_build_object('Filled', true, 'Unfilled', true),
      'Filled', jsonb_build_object(), 'Unfilled', jsonb_build_object('Filled', true)
    )
  )
)
where settings_key = 'dcf_editing_policy'
  and not (settings ? 'transitionRules');

update public.authorization_policy
set legacy_user_auto_approve_enabled = false,
    updated_at = now()
where singleton = true
  and (nullif(trim(legacy_user_auto_approve_owner), '') is null
       or legacy_user_auto_approve_cutoff is null);

-- Capability- and scope-aware workflow command.  Approver assignment is
-- checked again at decision time so inactive, out-of-scope, stale, and
-- self-assigned approvers cannot decide by calling the RPC directly.
create or replace function public.transition_workflow(
  p_entity_type text,
  p_entity_id bigint,
  p_transition text,
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
  v_status text;
  v_creator bigint;
  v_ou text;
  v_revision integer;
  v_new_status text;
  v_event text;
  v_assignment public.workflow_assignments%rowtype;
  v_auto_approve boolean := false;
  v_policy public.authorization_policy%rowtype;
  v_approver_allowed boolean;
  v_audit_action text;
begin
  select * into v_actor from public.users where auth_id = auth.uid() and is_active = true;
  if v_actor.id is null then raise exception 'Active authenticated profile required'; end if;
  v_module := public.workflow_entity_module(p_entity_type);
  if v_module is null then raise exception 'This entity does not use workflow'; end if;
  v_table := to_regclass('public.' || p_entity_type);
  if v_table is null then raise exception 'Workflow entity table not found'; end if;

  execute format('select workflow_status, created_by_user_id, "operatingUnit", revision_number from %s where id = $1', v_table)
    into v_status, v_creator, v_ou, v_revision using p_entity_id;
  if not found then raise exception 'Workflow record not found'; end if;
  v_status := coalesce(v_status, 'DRAFT');
  v_revision := coalesce(v_revision, 1);
  select * into v_policy from public.authorization_policy where singleton = true;

  if p_transition in ('submit', 'resubmit') then
    if v_creator is distinct from v_actor.id and v_actor.role <> 'Super Admin' then raise exception 'Only the submitter may submit this record'; end if;
    if v_actor.role <> 'Super Admin' and not public.current_user_has_access(v_module, 'edit', v_ou) then
      raise exception 'Edit permission is required to submit this record';
    end if;
    if v_status not in ('DRAFT', 'REJECTED') then raise exception 'Only Draft or Rejected records may be submitted'; end if;
    v_auto_approve := v_actor.role = 'Super Admin'
      or (v_actor.role = coalesce(v_policy.legacy_user_auto_approve_role, 'User')
          and v_module = any(coalesce(v_policy.legacy_user_auto_approve_modules, array[]::text[]))
          and v_policy.legacy_user_auto_approve_enabled
          and nullif(trim(v_policy.legacy_user_auto_approve_owner), '') is not null
          and v_policy.legacy_user_auto_approve_cutoff is not null
          and current_date <= v_policy.legacy_user_auto_approve_cutoff);
    v_new_status := case when v_auto_approve then 'APPROVED' else 'PENDING' end;
    v_event := case when p_transition = 'resubmit' then 'resubmit' else 'submit' end;
    v_audit_action := 'edit';
    perform set_config('app.workflow_transition', 'true', true);
    execute format('update %s set workflow_status = $1, submitted_at = now(), approved_at = case when $1 = ''APPROVED'' then now() else null end, approved_by_user_id = case when $1 = ''APPROVED'' then $2 else null end, approved_revision = case when $1 = ''APPROVED'' then revision_number else approved_revision end where id = $3', v_table)
    using v_new_status, v_actor.id, p_entity_id;
  elsif p_transition in ('approve', 'reject') then
    if v_status <> 'PENDING' then raise exception 'Only Pending records may be decided'; end if;
    if v_creator = v_actor.id and v_actor.role <> 'Super Admin' then raise exception 'Self-approval is not allowed'; end if;
    if not public.current_user_has_access(v_module, 'approve', v_ou) then raise exception 'Approve permission is required'; end if;
    if v_actor.role <> 'Super Admin' then
      select * into v_assignment from public.workflow_assignments
      where submitter_user_id = v_creator and approver_user_id = v_actor.id and module = v_module and active = true;
      if v_assignment.id is null then
        if not exists (select 1 from public.workflow_assignments wa where wa.submitter_user_id = v_creator and wa.module = v_module and wa.active = true)
           and exists (select 1 from public.workflow_settings ws where ws.singleton = true and ws.default_administrator_id = v_actor.id) then
          select (r.allowed) into v_approver_allowed
          from public.resolve_access_for_user(v_actor.id, v_module, 'approve', v_ou) r limit 1;
          if not coalesce(v_approver_allowed, false) then raise exception 'Configured Administrator fallback lacks Approve permission'; end if;
        else
          raise exception 'Only the active assigned approver may decide this record';
        end if;
      else
        select (r.allowed) into v_approver_allowed
        from public.resolve_access_for_user(v_assignment.approver_user_id, v_module, 'approve', v_ou) r limit 1;
        if not coalesce(v_approver_allowed, false) then raise exception 'Assigned approver is inactive, out of scope, or lacks Approve permission'; end if;
      end if;
    end if;
    if p_transition = 'reject' and nullif(trim(p_reason), '') is null then raise exception 'A rejection reason is required'; end if;
    v_new_status := case when p_transition = 'approve' then 'APPROVED' else 'REJECTED' end;
    v_event := p_transition;
    v_audit_action := 'approve';
    perform set_config('app.workflow_transition', 'true', true);
    execute format('update %s set workflow_status = $1, approved_at = case when $1 = ''APPROVED'' then now() else approved_at end, approved_by_user_id = case when $1 = ''APPROVED'' then $2 else approved_by_user_id end, approved_revision = case when $1 = ''APPROVED'' then revision_number else approved_revision end, rejected_at = case when $1 = ''REJECTED'' then now() else null end, rejected_by_user_id = case when $1 = ''REJECTED'' then $2 else null end where id = $3', v_table)
    using v_new_status, v_actor.id, p_entity_id;
  elsif p_transition = 'withdraw' then
    if v_status <> 'PENDING' or v_creator <> v_actor.id then raise exception 'Only the submitter may withdraw a Pending record'; end if;
    if not public.current_user_has_access(v_module, 'edit', v_ou) then raise exception 'Edit permission is required to withdraw this record'; end if;
    v_new_status := 'DRAFT';
    v_event := 'withdraw';
    v_audit_action := 'edit';
    perform set_config('app.workflow_transition', 'true', true);
    execute format('update %s set workflow_status = ''DRAFT'' where id = $1', v_table) using p_entity_id;
  else
    raise exception 'Unsupported workflow transition';
  end if;

  insert into public.workflow_events (
    entity_type, entity_id, module, event_type, previous_status, new_status,
    revision_number, actor_user_id, actor_role, approver_assignment_id, reason,
    metadata
  ) values (
    p_entity_type, p_entity_id, v_module, v_event, v_status, v_new_status,
    v_revision, v_actor.id, v_actor.role, v_assignment.id, nullif(trim(p_reason), ''),
    jsonb_build_object('automatic_approval', v_auto_approve, 'transition', p_transition)
  );
  perform public.log_authorization_event(v_module, v_audit_action, p_entity_type, p_entity_id::text, v_ou,
    jsonb_build_object('workflow_status', v_status), jsonb_build_object('workflow_status', v_new_status),
    p_reason, 'allowed', jsonb_build_object('transition', p_transition, 'automatic_approval', v_auto_approve));
  return jsonb_build_object('workflow_status', v_new_status, 'revision_number', v_revision);
end;
$$;

create or replace function public.begin_workflow_revision(
  p_entity_type text,
  p_entity_id bigint,
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
  v_status text;
  v_creator bigint;
  v_ou text;
  v_revision integer;
  v_new_revision integer;
begin
  select * into v_actor from public.users where auth_id = auth.uid() and is_active = true;
  if v_actor.id is null then raise exception 'Active authenticated profile required'; end if;
  v_module := public.workflow_entity_module(p_entity_type);
  if v_module is null then raise exception 'This entity does not use workflow'; end if;
  v_table := to_regclass('public.' || p_entity_type);
  if v_table is null then raise exception 'Workflow entity table not found'; end if;
  execute format('select workflow_status, created_by_user_id, "operatingUnit", revision_number from %s where id = $1', v_table)
    into v_status, v_creator, v_ou, v_revision using p_entity_id;
  if not found then raise exception 'Workflow record not found'; end if;
  if not public.current_user_has_access(v_module, 'edit', v_ou) then raise exception 'Edit permission is required'; end if;
  if v_creator is distinct from v_actor.id and v_actor.role <> 'Super Admin' then raise exception 'Only the submitter or Super Admin may begin a revision'; end if;
  if v_status = 'PENDING' and v_actor.role <> 'Super Admin' then raise exception 'Pending records are read-only'; end if;
  if v_status = 'APPROVED' and v_actor.role <> 'Super Admin' then
    v_new_revision := coalesce(v_revision, 1) + 1;
    perform set_config('app.workflow_transition', 'true', true);
    execute format('update %s set workflow_status = ''DRAFT'', revision_number = $1 where id = $2', v_table)
      using v_new_revision, p_entity_id;
    insert into public.workflow_events(entity_type, entity_id, module, event_type, previous_status, new_status, revision_number, actor_user_id, actor_role, reason)
    values (p_entity_type, p_entity_id, v_module, 'revision', v_status, 'DRAFT', v_new_revision, v_actor.id, v_actor.role, nullif(trim(p_reason), ''));
    perform public.log_authorization_event(v_module, 'edit', p_entity_type, p_entity_id::text, v_ou,
      jsonb_build_object('workflow_status', v_status, 'revision_number', v_revision),
      jsonb_build_object('workflow_status', 'DRAFT', 'revision_number', v_new_revision),
      p_reason, 'allowed', jsonb_build_object('transition', 'revision'));
    return jsonb_build_object('workflow_status', 'DRAFT', 'revision_number', v_new_revision);
  end if;
  if v_actor.role = 'Super Admin' then
    insert into public.workflow_events(entity_type, entity_id, module, event_type, previous_status, new_status, revision_number, actor_user_id, actor_role, reason, metadata)
    values (p_entity_type, p_entity_id, v_module, 'override', v_status, v_status, coalesce(v_revision, 1), v_actor.id, v_actor.role, nullif(trim(p_reason), ''), jsonb_build_object('material_edit', true));
    perform public.log_authorization_event(v_module, 'edit', p_entity_type, p_entity_id::text, v_ou,
      jsonb_build_object('workflow_status', v_status, 'revision_number', v_revision),
      jsonb_build_object('workflow_status', v_status, 'revision_number', v_revision),
      p_reason, 'allowed', jsonb_build_object('transition', 'super_admin_material_override'));
  end if;
  return jsonb_build_object('workflow_status', v_status, 'revision_number', coalesce(v_revision, 1));
end;
$$;

create or replace function public.enforce_workflow_assignment_governance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_submitter public.users%rowtype;
  v_approver public.users%rowtype;
  v_allowed boolean;
  v_module text := case when tg_op = 'DELETE' then old.module else new.module end;
  v_submitter_id bigint := case when tg_op = 'DELETE' then old.submitter_user_id else new.submitter_user_id end;
  v_approver_id bigint := case when tg_op = 'DELETE' then old.approver_user_id else new.approver_user_id end;
begin
  if tg_op = 'DELETE' then return old; end if;
  if v_module not in ('Subprojects', 'Activities', 'Program Management - Office Requirements', 'Program Management - Staffing Requirements', 'Program Management - Other Program Expenses') then
    raise exception 'Workflow assignments are only supported for governed modules';
  end if;
  select * into v_submitter from public.users where id = v_submitter_id;
  select * into v_approver from public.users where id = v_approver_id;
  if v_submitter.id is null or v_approver.id is null or not coalesce(v_submitter.is_active, false) or not coalesce(v_approver.is_active, false) then
    raise exception 'Submitter and approver must be active application users';
  end if;
  if v_submitter.id = v_approver.id then raise exception 'A submitter cannot be assigned as their own approver'; end if;
  select r.allowed into v_allowed
  from public.resolve_access_for_user(v_approver.id, v_module, 'approve', v_submitter."operatingUnit") r limit 1;
  if not coalesce(v_allowed, false) then raise exception 'Approver lacks the required capability or compatible OU scope'; end if;
  return new;
end;
$$;

drop trigger if exists enforce_workflow_assignment_governance on public.workflow_assignments;
create trigger enforce_workflow_assignment_governance
before insert or update or delete on public.workflow_assignments
for each row execute function public.enforce_workflow_assignment_governance();

create or replace function public.dcf_override_grant_exists(
  p_module text,
  p_action text,
  p_target_type text default null,
  p_target_id text default null,
  p_target_month text default null
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.dcf_override_grants g
    join public.users u on u.id = g.actor_user_id
    where u.auth_id = auth.uid()
      and u.is_active = true
      and g.module = p_module
      and g.action = p_action
      and (g.target_type is null or g.target_type = p_target_type)
      and (g.target_id is null or g.target_id = p_target_id)
      and (g.target_month is null or g.target_month = p_target_month)
      and g.used_at is null
      and g.expires_at > now()
  );
$$;

create or replace function public.consume_dcf_override_grant(
  p_module text,
  p_action text,
  p_target_type text default null,
  p_target_id text default null,
  p_target_month text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id bigint;
begin
  select g.id into v_id
  from public.dcf_override_grants g
  join public.users u on u.id = g.actor_user_id
  where u.auth_id = auth.uid()
    and u.is_active = true
    and g.module = p_module
    and g.action = p_action
    and (g.target_type is null or g.target_type = p_target_type)
    and (g.target_id is null or g.target_id = p_target_id)
    and (g.target_month is null or g.target_month = p_target_month)
    and g.used_at is null
    and g.expires_at > now()
  order by g.id
  for update skip locked
  limit 1;
  if v_id is null then return false; end if;
  update public.dcf_override_grants set used_at = now() where id = v_id;
  return true;
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
  v_id bigint;
begin
  select * into v_actor from public.users where auth_id = auth.uid() and is_active = true;
  if v_actor.id is null then raise exception 'Active authenticated profile required'; end if;
  if p_action not in ('edit_financial_actual', 'delete_financial_actual', 'edit_physical_actual') then
    raise exception 'Unsupported DCF override action';
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

revoke all on function public.request_dcf_override(text, text, text, text, text, text, text) from public;
grant execute on function public.request_dcf_override(text, text, text, text, text, text, text) to authenticated;

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
  v_lock := coalesce(v_settings->'monthLock', '{}'::jsonb);
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

-- Protect role defaults from delegated administrators. User-specific non-Super
-- overrides remain manageable through replace_user_authorization.
create or replace function public.enforce_authorization_rule_hierarchy()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users%rowtype;
  v_target public.users%rowtype;
  v_role text := case when tg_op = 'DELETE' then old.role else new.role end;
  v_action text := case when tg_op = 'DELETE' then old.action else new.action end;
  v_target_id bigint := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
begin
  select * into v_actor from public.users where auth_id = auth.uid() and is_active = true;
  if v_actor.id is null then raise exception 'Active authenticated profile required'; end if;
  if tg_table_name = 'authorization_role_rules' and v_actor.role <> 'Super Admin' then
    raise exception 'Only Super Admin may edit role-level defaults';
  end if;
  if tg_table_name = 'authorization_user_rules' or tg_table_name = 'authorization_user_scopes' then
    select * into v_target from public.users where id = v_target_id;
    if v_target.role = 'Super Admin' then raise exception 'Super Admin authorization is immutable'; end if;
    if v_target.id = v_actor.id and v_actor.role <> 'Super Admin' then raise exception 'Administrators cannot modify their own authorization'; end if;
  elsif v_role = 'Super Admin' then
    raise exception 'Super Admin authorization is immutable';
  end if;
  if tg_table_name = 'authorization_role_rules'
     and v_role in ('Management', 'Guest')
     and v_action not in ('view', 'export', 'view_files', 'view_monitoring')
     and coalesce(new.allowed, false) then
    raise exception '% is a protected read-only role', v_role;
  end if;
  if tg_table_name in ('authorization_role_rules', 'authorization_user_rules')
     and tg_op <> 'DELETE'
     and (coalesce(new.allowed, false) or coalesce(new.effect, '') = 'allow')
     and v_actor.role <> 'Super Admin'
     and not public.current_user_has_access(new.module, new.action) then
    raise exception 'You cannot grant an authority you do not hold';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

-- Explicit transition validation is enforced inside the status RPC and in the
-- direct-update trigger below. Same-state writes remain harmless and allowed.
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
  if not public.current_user_has_access(v_module, 'manage_status', v_ou) then raise exception 'Manage Status permission is required'; end if;
  if not public.dcf_transition_allowed(p_entity_type, v_old_status, p_new_status) then
    raise exception 'Invalid % transition: % to %', p_entity_type, v_old_status, p_new_status;
  end if;
  if v_actor.role <> 'Super Admin' and p_new_status in ('Cancelled', 'Unfilled') and nullif(trim(p_reason), '') is null then
    raise exception 'A reason is required for % transitions', p_new_status;
  end if;
  perform set_config('app.status_transition', 'true', true);
  execute format('update %s set %I = $1 where id = $2', v_table, v_column) using p_new_status, p_entity_id;
  perform public.log_authorization_event(v_module, 'manage_status', p_entity_type, p_entity_id::text, v_ou, jsonb_build_object('status', v_old_status), jsonb_build_object('status', p_new_status), p_reason, 'allowed', jsonb_build_object('source', 'transition_item_status'));
  return jsonb_build_object('status', p_new_status);
end;
$$;

create or replace function public.enforce_governed_transitions()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_status_column text := case when tg_table_name = 'staffing_requirements' then 'hiringStatus' else 'status' end;
  v_old_status text := to_jsonb(old)->>v_status_column;
  v_new_status text := to_jsonb(new)->>v_status_column;
  v_module text := public.dcf_entity_module(tg_table_name);
  v_ou text := to_jsonb(new)->>'operatingUnit';
begin
  if coalesce(current_setting('app.workflow_transition', true), '') = 'true' then
    return new;
  end if;
  if coalesce(current_setting('app.status_transition', true), '') = 'true'
     and v_new_status is distinct from v_old_status then
    return new;
  end if;
  if new.workflow_status is distinct from old.workflow_status
     and coalesce(current_setting('app.workflow_transition', true), '') <> 'true' then
    raise exception 'Workflow status must be changed through transition_workflow';
  end if;
  if v_new_status is distinct from v_old_status then
    if coalesce(current_setting('app.status_transition', true), '') <> 'true' then
      raise exception 'Status must be changed through transition_item_status';
    end if;
    if not public.dcf_transition_allowed(tg_table_name, v_old_status, v_new_status) then
      raise exception 'Invalid % transition: % to %', tg_table_name, v_old_status, v_new_status;
    end if;
  end if;
  return new;
end;
$$;

-- Block direct table writes that bypass DCF status and period decisions. The
-- existing RLS policies still enforce module/action/scope; this trigger adds
-- status/period semantics at the mutation boundary.
create or replace function public.enforce_dcf_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row jsonb;
  v_before jsonb;
  v_after jsonb;
  v_module text;
  v_status text;
  v_ou text;
  v_entity_type text;
  v_parent_id bigint;
  v_target_type text;
  v_target_month text;
  v_action text;
  v_financial_only boolean := false;
  v_physical_only boolean := false;
  v_override boolean := false;
  v_consumed boolean := false;
  v_override_reason text;
  v_month text;
  v_source_module text;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_before := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_after := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  if tg_table_name not in ('subprojects','activities','office_requirements','staffing_requirements','other_program_expenses','financial_obligations','financial_disbursements','subproject_accomplishments') then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  -- Workflow and status RPCs have already performed their own authorization,
  -- transition-matrix, and audit checks.  Do not reinterpret their service
  -- update as an ordinary user edit.
  if tg_op = 'UPDATE'
     and coalesce(current_setting('app.workflow_transition', true), '') = 'true' then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and coalesce(current_setting('app.status_transition', true), '') = 'true' then
    return new;
  end if;

  if tg_table_name = 'financial_obligations' or tg_table_name = 'financial_disbursements' then
    v_entity_type := v_row->>'entity_type';
    v_parent_id := nullif(v_row->>'parent_id', '')::bigint;
    v_source_module := public.financial_actual_source_module(v_row);
    v_target_type := case v_entity_type
      when 'subproject_detail' then 'subprojects'
      when 'subproject' then 'subprojects'
      when 'activity_expense' then 'activities'
      when 'activity' then 'activities'
      when 'office_requirement' then 'office_requirements'
      when 'staffing_expense' then 'staffing_requirements'
      when 'other_program_expense' then 'other_program_expenses'
      else null end;
    if v_target_type is null or v_source_module is null then raise exception 'Unknown financial source entity'; end if;
    if v_target_type = 'staffing_requirements' then
      execute format('select "hiringStatus", "operatingUnit" from public.%I where id = $1', v_target_type) into v_status, v_ou using v_parent_id;
    else
      execute format('select status, "operatingUnit" from public.%I where id = $1', v_target_type) into v_status, v_ou using v_parent_id;
    end if;
    v_action := case when tg_op = 'DELETE' then 'delete_financial_actual' else 'edit_financial_actual' end;
    if not public.dcf_status_action_allowed(v_source_module, v_action, v_status, v_ou)
       and not public.dcf_override_grant_exists(v_source_module, v_action, v_target_type, v_parent_id::text, null)
       and not public.dcf_override_grant_exists(v_source_module, 'edit_financial_actual', v_target_type, v_parent_id::text, null) then
      raise exception 'Financial action is blocked for % records', coalesce(v_status, 'unknown');
    end if;
    v_target_month := left(coalesce(v_row->>'obligation_date', v_row->>'disbursement_date'), 7);
    if v_target_month is not null and not public.dcf_period_allowed(v_source_module, 'edit_financial_actual', v_target_month, v_ou, v_target_type, v_parent_id::text) then
      if not public.dcf_override_grant_exists(v_source_module, 'edit_financial_actual', v_target_type, v_parent_id::text, v_target_month) then
        raise exception 'Financial accomplishment month is blocked by the period policy';
      end if;
    end if;
    if public.dcf_override_grant_exists(v_source_module, v_action, v_target_type, v_parent_id::text, v_target_month)
       or public.dcf_override_grant_exists(v_source_module, 'edit_financial_actual', v_target_type, v_parent_id::text, v_target_month) then
      select g.reason into v_override_reason
      from public.dcf_override_grants g
      join public.users u on u.id = g.actor_user_id
      where u.auth_id = auth.uid() and u.is_active = true
        and g.module = v_source_module
        and g.action in (v_action, 'edit_financial_actual')
        and (g.target_type is null or g.target_type = v_target_type)
        and (g.target_id is null or g.target_id = v_parent_id::text)
        and (g.target_month is null or g.target_month = v_target_month)
        and g.used_at is null and g.expires_at > now()
      order by g.id limit 1;
      v_consumed := public.consume_dcf_override_grant(v_source_module, v_action, v_target_type, v_parent_id::text, v_target_month);
      if not v_consumed then
        v_consumed := public.consume_dcf_override_grant(v_source_module, 'edit_financial_actual', v_target_type, v_parent_id::text, v_target_month);
      end if;
      v_override := true;
    end if;
    if v_override then perform set_config('app.dcf_override_audit', 'true', true); end if;
    perform public.log_authorization_event(v_source_module, v_action, tg_table_name, v_row->>'id', v_ou, v_before, v_after, v_override_reason, 'allowed', jsonb_build_object('source', 'dcf_mutation_trigger', 'operation', tg_op, 'authorized_by_override', v_override));
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_table_name = 'subproject_accomplishments' then
    v_parent_id := nullif(v_row->>'subproject_id', '')::bigint;
    v_status := (select status from public.subprojects where id = v_parent_id);
    v_ou := (select "operatingUnit" from public.subprojects where id = v_parent_id);
    v_target_month := left(v_row->>'delivery_date', 7);
    if not public.dcf_status_action_allowed('Subprojects', 'edit_physical_actual', v_status, v_ou)
       and not public.dcf_override_grant_exists('Subprojects', 'edit_physical_actual', 'subprojects', v_parent_id::text, null) then
      raise exception 'Physical accomplishment is blocked for % records', coalesce(v_status, 'unknown');
    end if;
    if v_target_month is not null and not public.dcf_period_allowed('Subprojects', 'edit_physical_actual', v_target_month, v_ou, 'subprojects', v_parent_id::text)
       and not public.dcf_override_grant_exists('Subprojects', 'edit_physical_actual', 'subprojects', v_parent_id::text, v_target_month) then
      raise exception 'Physical accomplishment month is blocked by the period policy';
    end if;
    if public.dcf_override_grant_exists('Subprojects', 'edit_physical_actual', 'subprojects', v_parent_id::text, v_target_month) then
      select g.reason into v_override_reason
      from public.dcf_override_grants g join public.users u on u.id = g.actor_user_id
      where u.auth_id = auth.uid() and u.is_active = true and g.module = 'Subprojects'
        and g.action = 'edit_physical_actual' and (g.target_type is null or g.target_type = 'subprojects')
        and (g.target_id is null or g.target_id = v_parent_id::text)
        and (g.target_month is null or g.target_month = v_target_month)
        and g.used_at is null and g.expires_at > now()
      order by g.id limit 1;
      v_consumed := public.consume_dcf_override_grant('Subprojects', 'edit_physical_actual', 'subprojects', v_parent_id::text, v_target_month);
      v_override := true;
    end if;
    if v_override then perform set_config('app.dcf_override_audit', 'true', true); end if;
    perform public.log_authorization_event('Subprojects', 'edit_physical_actual', tg_table_name, v_row->>'id', v_ou, v_before, v_after, v_override_reason, 'allowed', jsonb_build_object('source', 'dcf_mutation_trigger', 'operation', tg_op, 'authorized_by_override', v_override));
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  v_module := public.dcf_entity_module(tg_table_name);
  v_status := case when tg_table_name = 'staffing_requirements' then v_row->>'hiringStatus' else v_row->>'status' end;
  v_ou := public.application_record_ou(tg_table_name, v_row);
  if tg_op = 'DELETE' then
    v_action := 'delete';
  elsif tg_op = 'INSERT' then
    v_action := 'create';
  else
    v_financial_only := public.dcf_is_financial_only_change(tg_table_name, v_before, v_after);
    v_physical_only := public.dcf_is_physical_only_change(tg_table_name, v_before, v_after);
    v_action := case when v_financial_only then 'edit_financial_actual'
      when v_physical_only then 'edit_physical_actual'
      else 'edit' end;
  end if;
  if not public.dcf_status_action_allowed(v_module, v_action, v_status, v_ou)
     and not public.dcf_override_grant_exists(v_module, v_action, tg_table_name, v_row->>'id', null) then
    raise exception 'The % action is blocked for % records', v_action, coalesce(v_status, 'unknown');
  end if;
  if v_action in ('edit_financial_actual', 'edit_physical_actual') then
    for v_month in select distinct month from public.dcf_collect_actual_months(v_row, case when v_action = 'edit_financial_actual' then 'financial' else 'physical' end) loop
      if not public.dcf_period_allowed(v_module, v_action, v_month, v_ou, tg_table_name, v_row->>'id')
         and not public.dcf_override_grant_exists(v_module, v_action, tg_table_name, v_row->>'id', v_month) then
        raise exception '% accomplishment month is blocked by the period policy', initcap(replace(v_action, '_', ' '));
      end if;
      if public.dcf_override_grant_exists(v_module, v_action, tg_table_name, v_row->>'id', v_month) then
        select g.reason into v_override_reason from public.dcf_override_grants g join public.users u on u.id = g.actor_user_id
        where u.auth_id = auth.uid() and u.is_active = true and g.module = v_module and g.action = v_action
          and (g.target_type is null or g.target_type = tg_table_name)
          and (g.target_id is null or g.target_id = v_row->>'id')
          and (g.target_month is null or g.target_month = v_month)
          and g.used_at is null and g.expires_at > now()
        order by g.id limit 1;
        v_consumed := public.consume_dcf_override_grant(v_module, v_action, tg_table_name, v_row->>'id', v_month);
        v_override := true;
      end if;
    end loop;
  end if;
  if v_override then perform set_config('app.dcf_override_audit', 'true', true); end if;
  perform public.log_authorization_event(v_module, v_action, tg_table_name, v_row->>'id', v_ou, v_before, v_after, v_override_reason, 'allowed', jsonb_build_object('source', 'dcf_mutation_trigger', 'operation', tg_op, 'authorized_by_override', v_override));
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

-- RLS must admit a candidate parent update when the actor has the exact
-- accomplishment capability even if they intentionally do not have ordinary
-- structural Edit.  The trigger above remains the final boundary and
-- classifies the submitted before/after JSON exactly.
create or replace function public.current_user_can_table_action(
  p_table text,
  p_operation text,
  p_row jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_module text := public.application_table_module(p_table);
  v_action text;
  v_ou text;
  v_parent text;
  v_source_module text;
  v_is_core boolean := p_table in ('subprojects','activities','office_requirements','staffing_requirements','other_program_expenses');
  v_operation text := lower(p_operation);
begin
  if v_module is null then return false; end if;
  v_ou := public.application_record_ou(p_table, p_row);
  v_parent := case
    when v_module like 'Dashboard - %' then 'Dashboards'
    when v_module like 'Report - %' then 'Reports'
    when v_module like 'Program Management - %' then 'Program Management'
    when v_module like 'References - %' then 'References'
    else null end;
  if v_parent is not null and not public.current_user_has_access(v_parent, 'view', v_ou) then return false; end if;

  if p_table in ('financial_obligations','financial_disbursements') then
    v_action := case v_operation when 'select' then 'view' when 'delete' then 'delete_financial_actual' else 'edit_financial_actual' end;
    v_source_module := public.financial_actual_source_module(p_row);
    if v_source_module is null then return false; end if;
    return public.current_user_has_access('Accomplishment - Financial', v_action, v_ou)
      and public.current_user_has_access(v_source_module, case when v_operation = 'select' then 'view' else v_action end, v_ou);
  elsif p_table = 'subproject_accomplishments' and v_operation <> 'select' then
    return public.current_user_has_access('Accomplishment - Physical', 'edit_physical_actual', v_ou);
  elsif v_is_core and v_operation = 'update' then
    return public.current_user_has_access(v_module, 'edit', v_ou)
      or (public.current_user_has_access(v_module, 'edit_financial_actual', v_ou)
        and public.current_user_has_access('Accomplishment - Financial', 'edit_financial_actual', v_ou))
      or (public.current_user_has_access(v_module, 'edit_physical_actual', v_ou)
        and public.current_user_has_access('Accomplishment - Physical', 'edit_physical_actual', v_ou));
  elsif v_is_core then
    v_action := case v_operation when 'select' then 'view' when 'insert' then 'create' when 'delete' then 'delete' else 'edit' end;
  elsif p_table in ('lod_assessments','lod_answers') and v_operation <> 'select' then
    v_action := case when v_operation = 'delete' then 'delete' else 'edit_assessment' end;
  elsif p_table in ('lod_sections','lod_questions','lod_choices','lod_level_configs','lod_questionnaire_versions') and v_operation <> 'select' then
    v_action := 'manage_settings';
  elsif p_table in ('dcf_policy_settings','roles_config','deadlines','budget_ceilings','award_ranking_settings','report_display_settings') and v_operation <> 'select' then
    v_action := 'manage_settings';
  elsif p_table = 'activity_ipos' and v_operation <> 'select' then
    v_action := 'edit';
  elsif p_table = 'activity_monitoring_reports' then
    v_action := case v_operation when 'select' then 'view_monitoring' else 'manage_monitoring' end;
  elsif p_table = 'activity_monitoring_actions' then
    v_action := case v_operation when 'select' then 'view_monitoring' when 'delete' then 'delete_monitoring_action' else 'add_monitoring_action' end;
  elsif p_table = 'budget_item_adjustment_history' then
    v_action := case v_operation when 'select' then 'view' else 'edit_financial_actual' end;
  elsif p_table = 'trash_bin' and v_operation = 'insert' then
    v_module := case p_row->>'entity_type'
      when 'subproject' then 'Subprojects' when 'activity' then 'Activities'
      when 'office_requirement' then 'Program Management - Office Requirements'
      when 'staffing_requirement' then 'Program Management - Staffing Requirements'
      when 'other_program_expense' then 'Program Management - Other Program Expenses'
      when 'ipo' then 'IPO Management' else 'Settings - Archive' end;
    v_action := case when v_module = 'Settings - Archive' then 'manage_settings' else 'delete' end;
    v_ou := coalesce(p_row->'data'->>'operatingUnit', p_row->'data'->>'operating_unit', v_ou);
  elsif p_table = 'user_logs' then
    if v_operation = 'insert' then v_module := 'Profile'; v_action := 'view';
    elsif v_operation = 'select' then v_action := 'view';
    else v_action := 'manage_settings'; end if;
  end if;
  if v_action is null then return false; end if;
  return public.current_user_has_access(v_module, v_action, v_ou);
end;
$$;

do $$
declare v_table text;
begin
  foreach v_table in array array['subprojects','activities','office_requirements','staffing_requirements','other_program_expenses','financial_obligations','financial_disbursements','subproject_accomplishments'] loop
    if to_regclass('public.' || v_table) is null then continue; end if;
    execute format('drop trigger if exists enforce_dcf_mutation on public.%I', v_table);
    execute format('create trigger enforce_dcf_mutation before insert or update or delete on public.%I for each row execute function public.enforce_dcf_mutation()', v_table);
  end loop;
end $$;

-- A reasoned DCF override is a separate authorization path.  Preserve the
-- exact privileged action in the immutable audit event while allowing the
-- trigger to record it when the actor holds only the configured override
-- capability.  Ordinary callers still cannot forge an allowed outcome.
create or replace function public.log_authorization_event(
  p_module text,
  p_action text,
  p_target_type text default null,
  p_target_id text default null,
  p_operating_unit text default null,
  p_before_state jsonb default null,
  p_after_state jsonb default null,
  p_reason text default null,
  p_outcome text default 'allowed',
  p_metadata jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users%rowtype;
  v_policy_version bigint;
  v_id bigint;
  v_override boolean := coalesce(current_setting('app.dcf_override_audit', true), '') = 'true'
    and coalesce((p_metadata->>'authorized_by_override')::boolean, false);
begin
  select * into v_actor from public.users where auth_id = auth.uid() and is_active = true;
  if v_actor.id is null then raise exception 'Active authenticated application profile required'; end if;
  if p_outcome = 'allowed' and not v_override
     and not public.current_user_has_access(p_module, p_action, p_operating_unit) then
    raise exception 'Cannot record an allowed audit outcome for an authority the actor does not hold';
  end if;
  select policy_version into v_policy_version from public.authorization_policy where singleton = true;
  insert into public.authorization_audit_events (
    actor_user_id, actor_auth_id, actor_role, module, action, target_type, target_id,
    operating_unit, before_state, after_state, reason, policy_version, outcome, metadata
  ) values (
    v_actor.id, auth.uid(), v_actor.role, p_module, p_action, p_target_type, p_target_id,
    p_operating_unit, p_before_state, p_after_state, nullif(trim(p_reason), ''),
    coalesce(v_policy_version, 0), p_outcome, coalesce(p_metadata, '{}'::jsonb)
  ) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.dcf_module_key(text) from public;
revoke all on function public.dcf_entity_module(text) from public;
revoke all on function public.dcf_status_action_allowed(text, text, text, text) from public;
revoke all on function public.dcf_transition_allowed(text, text, text) from public;
revoke all on function public.dcf_period_allowed(text, text, text, text, text, text) from public;
grant execute on function public.dcf_module_key(text) to authenticated;
grant execute on function public.dcf_entity_module(text) to authenticated;

commit;
