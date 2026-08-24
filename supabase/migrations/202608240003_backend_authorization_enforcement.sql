begin;

-- Keep protected hierarchy rules enforceable even when a client bypasses the UI.
create or replace function public.enforce_authorization_rule_hierarchy()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users%rowtype;
  v_target public.users%rowtype;
  v_role text := coalesce(new.role, old.role);
  v_action text := coalesce(new.action, old.action);
begin
  select * into v_actor from public.users where auth_id = auth.uid() and is_active = true;
  if v_actor.id is null then raise exception 'Active authenticated profile required'; end if;

  if tg_table_name = 'authorization_user_rules' or tg_table_name = 'authorization_user_scopes' then
    select * into v_target from public.users where id = coalesce(new.user_id, old.user_id);
    if v_target.role = 'Super Admin' then raise exception 'Super Admin authorization is immutable'; end if;
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
  return coalesce(new, old);
end;
$$;

drop trigger if exists enforce_role_rule_hierarchy on public.authorization_role_rules;
create trigger enforce_role_rule_hierarchy before insert or update or delete on public.authorization_role_rules
for each row execute function public.enforce_authorization_rule_hierarchy();
drop trigger if exists enforce_user_rule_hierarchy on public.authorization_user_rules;
create trigger enforce_user_rule_hierarchy before insert or update or delete on public.authorization_user_rules
for each row execute function public.enforce_authorization_rule_hierarchy();
drop trigger if exists enforce_user_scope_hierarchy on public.authorization_user_scopes;
create trigger enforce_user_scope_hierarchy before insert or update or delete on public.authorization_user_scopes
for each row execute function public.enforce_authorization_rule_hierarchy();

create or replace function public.enforce_self_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Provider/admin service operations are validated by their authenticated Edge boundary.
  if auth.uid() is null or coalesce(current_setting('app.user_admin', true), '') = 'true' then return new; end if;
  if old.auth_id is distinct from auth.uid() then raise exception 'Only your own profile may be updated'; end if;
  if (to_jsonb(old) - array['username','fullName','updated_at'])
     is distinct from (to_jsonb(new) - array['username','fullName','updated_at']) then
    raise exception 'Role, scope, account state, email, approver, and identity fields require authorized user administration';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists enforce_self_profile_update on public.users;
create trigger enforce_self_profile_update before update on public.users
for each row execute function public.enforce_self_profile_update();

drop policy if exists users_self_profile_update on public.users;
create policy users_self_profile_update on public.users for update to authenticated
using (auth_id = auth.uid() and public.current_user_has_access('Profile', 'edit'))
with check (auth_id = auth.uid() and public.current_user_has_access('Profile', 'edit'));
grant update (username, "fullName", updated_at) on public.users to authenticated;

create or replace function public.replace_user_authorization(
  p_user_id bigint,
  p_rules jsonb,
  p_scopes jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users%rowtype;
  v_target public.users%rowtype;
  v_rule jsonb;
  v_scope jsonb;
  v_action text;
  v_module text;
  v_effect text;
begin
  select * into v_actor from public.users where auth_id = auth.uid() and is_active = true;
  select * into v_target from public.users where id = p_user_id;
  if v_actor.id is null or v_target.id is null then raise exception 'Active actor and target profiles are required'; end if;
  if v_target.role = 'Super Admin' then raise exception 'Super Admin authorization is immutable'; end if;
  if v_actor.id = v_target.id and v_actor.role <> 'Super Admin' then raise exception 'Administrators cannot modify their own authorization'; end if;
  if not public.current_user_has_access('Settings - Access Control', 'manage_user_overrides') then raise exception 'User override permission is required'; end if;
  if jsonb_typeof(coalesce(p_rules, '[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_scopes, '[]'::jsonb)) <> 'array' then raise exception 'Rules and scopes must be arrays'; end if;

  for v_rule in select value from jsonb_array_elements(coalesce(p_rules, '[]'::jsonb)) loop
    v_module := nullif(trim(v_rule->>'module'), '');
    v_action := nullif(trim(v_rule->>'action'), '');
    v_effect := v_rule->>'effect';
    if v_module is null or v_action is null or v_effect not in ('allow','deny') then raise exception 'Invalid user authorization rule'; end if;
    if not exists (select 1 from public.authorization_role_rules where module = v_module and action = v_action) then raise exception 'Unknown capability %.%', v_module, v_action; end if;
    if v_effect = 'allow' and v_target.role in ('Management','Guest') and v_action not in ('view','export','view_files','view_monitoring') then raise exception '% is protected read-only', v_target.role; end if;
    if v_effect = 'allow' and v_actor.role <> 'Super Admin' and not public.current_user_has_access(v_module, v_action) then raise exception 'You cannot grant %.%, which you do not hold', v_module, v_action; end if;
  end loop;

  if jsonb_array_length(coalesce(p_scopes, '[]'::jsonb)) > 0
     and not public.current_user_has_access('Settings - Data Scope', 'manage_user_scopes') then
    raise exception 'User scope permission is required';
  end if;
  for v_scope in select value from jsonb_array_elements(coalesce(p_scopes, '[]'::jsonb)) loop
    if nullif(trim(v_scope->>'module'), '') is null or v_scope->>'visibility_scope' not in ('Own OU','All OUs') then raise exception 'Invalid user scope'; end if;
  end loop;

  delete from public.authorization_user_rules where user_id = p_user_id;
  insert into public.authorization_user_rules(user_id, module, action, effect, updated_by)
  select p_user_id, value->>'module', value->>'action', value->>'effect', v_actor.id
  from jsonb_array_elements(coalesce(p_rules, '[]'::jsonb));

  insert into public.authorization_user_scopes(user_id, module, visibility_scope, updated_by)
  select p_user_id, value->>'module', value->>'visibility_scope', v_actor.id
  from jsonb_array_elements(coalesce(p_scopes, '[]'::jsonb))
  on conflict (user_id, module) do update set visibility_scope = excluded.visibility_scope, updated_at = now(), updated_by = excluded.updated_by;

  perform set_config('app.user_admin', 'true', true);
  update public.users set permission_version = permission_version + 1, updated_at = now() where id = p_user_id;
  perform public.log_authorization_event('Settings - Access Control', 'manage_user_overrides', 'user', p_user_id::text, null, null, jsonb_build_object('rules', p_rules, 'scopes', p_scopes), null, 'allowed', jsonb_build_object('source', 'replace_user_authorization'));
end;
$$;

revoke all on function public.replace_user_authorization(bigint, jsonb, jsonb) from public;
grant execute on function public.replace_user_authorization(bigint, jsonb, jsonb) to authenticated;

-- Configuration changes are append-only audited at the same database boundary that
-- enforces hierarchy. Migration/service-role writes have no end-user actor and are
-- intentionally excluded; operational service actions write their own actor audit.
create or replace function public.audit_central_configuration_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users%rowtype;
  v_module text := case tg_table_name
    when 'authorization_user_scopes' then 'Settings - Data Scope'
    when 'workflow_assignments' then 'Settings - Workflow'
    when 'workflow_settings' then 'Settings - Workflow'
    when 'dcf_policy_settings' then 'Settings - DCF and Status'
    else 'Settings - Access Control'
  end;
  v_action text := case tg_table_name
    when 'authorization_role_rules' then 'manage_roles'
    when 'authorization_user_rules' then 'manage_user_overrides'
    when 'authorization_user_scopes' then 'manage_user_scopes'
    when 'workflow_assignments' then 'manage_approver_assignments'
    when 'workflow_settings' then 'manage_approver_assignments'
    when 'dcf_policy_settings' then 'manage_settings'
    else 'manage_permissions'
  end;
  v_before jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_after jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
begin
  select * into v_actor from public.users where auth_id = auth.uid() and is_active = true;
  if v_actor.id is null then return coalesce(new, old); end if;
  perform public.log_authorization_event(
    v_module,
    v_action,
    tg_table_name,
    coalesce(v_after->>'id', v_after->>'user_id', v_after->>'role', v_before->>'id', v_before->>'user_id', v_before->>'role'),
    coalesce(v_after->>'visibility_scope', v_before->>'visibility_scope'),
    v_before,
    v_after,
    null,
    'allowed',
    jsonb_build_object('operation', tg_op, 'source', 'configuration_audit_trigger')
  );
  return coalesce(new, old);
end;
$$;

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'authorization_role_rules','authorization_user_rules','authorization_user_scopes',
    'workflow_assignments','workflow_settings','dcf_policy_settings'
  ] loop
    if to_regclass('public.' || v_table) is null then continue; end if;
    execute format('drop trigger if exists audit_central_configuration_change on public.%I', v_table);
    execute format('create trigger audit_central_configuration_change after insert or update or delete on public.%I for each row execute function public.audit_central_configuration_change()', v_table);
  end loop;
end $$;

create or replace function public.audit_self_profile_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null then
    perform public.log_authorization_event(
      'Profile', 'edit', 'user', new.id::text, new."operatingUnit",
      jsonb_build_object('username', old.username, 'fullName', old."fullName"),
      jsonb_build_object('username', new.username, 'fullName', new."fullName"),
      null, 'allowed', jsonb_build_object('source', 'self_profile_update')
    );
  end if;
  return new;
end;
$$;

drop trigger if exists audit_self_profile_change on public.users;
create trigger audit_self_profile_change after update of username, "fullName" on public.users
for each row when (old.username is distinct from new.username or old."fullName" is distinct from new."fullName")
execute function public.audit_self_profile_change();

create or replace function public.enforce_governed_transitions()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_status_column text := case when tg_table_name = 'staffing_requirements' then 'hiringStatus' else 'status' end;
  v_old_status text;
  v_new_status text;
  v_module text;
  v_ou text;
begin
  if new.workflow_status is distinct from old.workflow_status
     and coalesce(current_setting('app.workflow_transition', true), '') <> 'true' then
    raise exception 'Workflow status must be changed through transition_workflow';
  end if;
  v_old_status := to_jsonb(old)->>v_status_column;
  v_new_status := to_jsonb(new)->>v_status_column;
  if v_new_status is distinct from v_old_status
     and coalesce(current_setting('app.status_transition', true), '') <> 'true' then
    v_module := public.workflow_entity_module(tg_table_name);
    v_ou := to_jsonb(new)->>'operatingUnit';
    if not public.current_user_has_access(v_module, 'manage_status', v_ou) then
      raise exception 'Manage Status permission is required';
    end if;
    if v_new_status in ('Cancelled', 'Unfilled') then
      raise exception 'Cancelled or Unfilled transitions require a reason through transition_item_status';
    end if;
    if tg_table_name = 'staffing_requirements' and v_new_status not in ('Proposed', 'Filled', 'Unfilled') then
      raise exception 'Invalid staffing status';
    elsif tg_table_name <> 'staffing_requirements' and v_new_status not in ('Proposed', 'Ongoing', 'Completed', 'Cancelled') then
      raise exception 'Invalid item status';
    end if;
    perform public.log_authorization_event(v_module, 'manage_status', tg_table_name, new.id::text, v_ou, jsonb_build_object('status', v_old_status), jsonb_build_object('status', v_new_status), null, 'allowed', jsonb_build_object('source', 'governed_update_trigger'));
  end if;
  return new;
end;
$$;

create or replace function public.strip_operational_actual_fields(p_value jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  from jsonb_each(coalesce(p_value, '{}'::jsonb))
  where key not like 'actual%'
    and key not in (
      'updated_at','history','workflow_status','revision_number','approved_revision',
      'submitted_at','approved_at','approved_by_user_id','rejected_at','rejected_by_user_id',
      'physical_accomplishment_submitted_at','catchUpPlanRemarks','obligations','disbursements',
      'isCompleted','status','hiringStatus'
    );
$$;

create or replace function public.strip_actual_fields_from_array(p_value jsonb)
returns jsonb
language sql
immutable
as $$
  select case
    when p_value is null then null
    when jsonb_typeof(p_value) <> 'array' then p_value
    else coalesce((select jsonb_agg(public.strip_operational_actual_fields(value) order by ordinality)
                   from jsonb_array_elements(p_value) with ordinality), '[]'::jsonb)
  end;
$$;

create or replace function public.enforce_approved_material_revision()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_actor public.users%rowtype;
  v_material_changed boolean := false;
  v_ou text := to_jsonb(new)->>'operatingUnit';
  v_module text := public.workflow_entity_module(tg_table_name);
begin
  if coalesce(old.workflow_status, 'DRAFT') <> 'APPROVED' then return new; end if;
  select * into v_actor from public.users where auth_id = auth.uid() and is_active = true;
  if v_actor.id is null then raise exception 'Active authenticated profile required'; end if;

  if tg_table_name = 'subprojects' then
    v_material_changed := public.strip_operational_actual_fields(to_jsonb(old) - 'details')
      is distinct from public.strip_operational_actual_fields(to_jsonb(new) - 'details')
      or public.strip_actual_fields_from_array(to_jsonb(old)->'details')
      is distinct from public.strip_actual_fields_from_array(to_jsonb(new)->'details');
  elsif tg_table_name = 'activities' then
    v_material_changed := public.strip_operational_actual_fields(to_jsonb(old) - 'expenses')
      is distinct from public.strip_operational_actual_fields(to_jsonb(new) - 'expenses')
      or public.strip_actual_fields_from_array(to_jsonb(old)->'expenses')
      is distinct from public.strip_actual_fields_from_array(to_jsonb(new)->'expenses');
  elsif tg_table_name = 'staffing_requirements' then
    v_material_changed := public.strip_operational_actual_fields(to_jsonb(old) - 'expenses')
      is distinct from public.strip_operational_actual_fields(to_jsonb(new) - 'expenses')
      or public.strip_actual_fields_from_array(to_jsonb(old)->'expenses')
      is distinct from public.strip_actual_fields_from_array(to_jsonb(new)->'expenses');
  else
    v_material_changed := public.strip_operational_actual_fields(to_jsonb(old))
      is distinct from public.strip_operational_actual_fields(to_jsonb(new));
  end if;

  if not v_material_changed then return new; end if;
  if v_actor.role = 'Super Admin' then
    perform public.log_authorization_event(v_module, 'edit', tg_table_name, new.id::text, v_ou, null, null, 'Protected Super Admin material-edit override', 'allowed', jsonb_build_object('source', 'approved_material_trigger'));
    return new;
  end if;
  raise exception 'Approved material changes require begin_workflow_revision and resubmission';
end;
$$;

do $$
declare v_table text;
begin
  foreach v_table in array array['subprojects','activities','office_requirements','staffing_requirements','other_program_expenses'] loop
    execute format('drop trigger if exists enforce_governed_transitions on public.%I', v_table);
    execute format('create trigger enforce_governed_transitions before update on public.%I for each row execute function public.enforce_governed_transitions()', v_table);
    execute format('drop trigger if exists enforce_approved_material_revision on public.%I', v_table);
    execute format('create trigger enforce_approved_material_revision before update on public.%I for each row execute function public.enforce_approved_material_revision()', v_table);
  end loop;
end $$;

create or replace function public.application_table_module(p_table text)
returns text
language sql
immutable
as $$
  select case
    when p_table = 'subprojects' then 'Subprojects'
    when p_table in ('activities','activity_ipos','activity_monitoring_reports','activity_monitoring_actions') then 'Activities'
    when p_table in ('office_requirements','staffing_requirements','other_program_expenses') then 'Program Management'
    when p_table in ('financial_obligations','financial_disbursements') then 'Accomplishment - Financial'
    when p_table = 'subproject_accomplishments' then 'Accomplishment - Physical'
    when p_table in ('ipos','ipo_history') then 'IPO Management'
    when p_table = 'marketing_partners' then 'Marketing Database'
    when p_table like 'lod_%' then 'Level of Development'
    when p_table like 'gad_%' then 'Gender and Development'
    when p_table in ('ref_commodities','ref_equipment','ref_equipment_categories','ref_infrastructure','ref_inputs','ref_livestock','ref_trainings','reference_activities','reference_commodities','reference_particulars','reference_uacs','gida_areas','elcac_areas') then 'Home'
    when p_table in ('award_manual_scores','award_ranking_settings','report_display_settings','bar1_report_snapshots') then 'Reports'
    when p_table = 'deadlines' then 'Settings - System'
    when p_table = 'budget_ceilings' then 'Settings - Financial Accomplishment'
    when p_table = 'budget_item_adjustment_history' then 'Accomplishment - Financial'
    when p_table = 'dcf_policy_settings' then 'Settings - DCF and Status'
    when p_table = 'trash_bin' then 'Settings - Archive'
    when p_table = 'user_logs' then 'Settings - Audit and Security'
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
    if v_entity_type = 'subproject_detail' then select "operatingUnit" into v_ou from public.subprojects where id = v_parent_id;
    elsif v_entity_type = 'activity_expense' then select "operatingUnit" into v_ou from public.activities where id = v_parent_id;
    elsif v_entity_type = 'office_requirement' then select "operatingUnit" into v_ou from public.office_requirements where id = v_parent_id;
    elsif v_entity_type = 'staffing_expense' then select "operatingUnit" into v_ou from public.staffing_requirements where id = v_parent_id;
    elsif v_entity_type = 'other_program_expense' then select "operatingUnit" into v_ou from public.other_program_expenses where id = v_parent_id;
    end if;
  elsif p_table in ('activity_ipos','activity_monitoring_reports') then
    select "operatingUnit" into v_ou from public.activities where id = nullif(p_row->>'activity_id', '')::bigint;
  elsif p_table = 'activity_monitoring_actions' then
    select a."operatingUnit" into v_ou from public.activities a join public.activity_monitoring_reports r on r.activity_id = a.id where r.id = nullif(coalesce(p_row->>'monitoring_report_id', p_row->>'report_id'), '')::bigint;
  elsif p_table = 'subproject_accomplishments' then
    select "operatingUnit" into v_ou from public.subprojects where id = nullif(p_row->>'subproject_id', '')::bigint;
  end if;
  return v_ou;
end;
$$;

create or replace function public.current_user_can_table_action(p_table text, p_operation text, p_row jsonb default '{}'::jsonb)
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
begin
  if v_module is null then return false; end if;
  v_action := case lower(p_operation)
    when 'select' then 'view'
    when 'insert' then 'create'
    when 'update' then 'edit'
    when 'delete' then 'delete'
    else null end;
  if p_table in ('financial_obligations','financial_disbursements') then
    v_action := case lower(p_operation) when 'select' then 'view' when 'delete' then 'delete_financial_actual' else 'edit_financial_actual' end;
  elsif p_table in ('dcf_policy_settings','roles_config','deadlines','budget_ceilings','award_ranking_settings','report_display_settings') and lower(p_operation) <> 'select' then
    v_action := 'manage_settings';
  elsif p_table in ('ref_commodities','ref_equipment','ref_equipment_categories','ref_infrastructure','ref_inputs','ref_livestock','ref_trainings','reference_activities','reference_commodities','reference_particulars','reference_uacs','gida_areas','elcac_areas') and lower(p_operation) <> 'select' then
    v_module := 'References';
  elsif p_table = 'activity_ipos' and lower(p_operation) <> 'select' then
    v_action := 'edit';
  elsif p_table = 'activity_monitoring_reports' then
    v_action := case lower(p_operation) when 'select' then 'view_monitoring' else 'manage_monitoring' end;
  elsif p_table = 'activity_monitoring_actions' then
    v_action := case lower(p_operation) when 'select' then 'view_monitoring' when 'delete' then 'delete_monitoring_action' else 'add_monitoring_action' end;
  elsif p_table = 'budget_item_adjustment_history' then
    v_action := case lower(p_operation) when 'select' then 'view' else 'edit_financial_actual' end;
  elsif p_table = 'trash_bin' and lower(p_operation) = 'insert' then
    v_module := case p_row->>'entity_type'
      when 'subproject' then 'Subprojects' when 'activity' then 'Activities'
      when 'office_requirement' then 'Program Management' when 'staffing_requirement' then 'Program Management'
      when 'other_program_expense' then 'Program Management' when 'ipo' then 'IPO Management'
      else 'Settings - Archive' end;
    v_action := case when v_module = 'Settings - Archive' then 'manage_settings' else 'delete' end;
    v_ou := coalesce(p_row->'data'->>'operatingUnit', p_row->'data'->>'operating_unit');
  elsif p_table = 'user_logs' then
    if lower(p_operation) = 'insert' then
      v_module := 'Profile';
      v_action := 'view';
    elsif lower(p_operation) = 'select' then
      v_action := 'view';
    else
      v_action := 'manage_settings';
    end if;
  end if;
  if v_action is null then return false; end if;
  v_ou := coalesce(v_ou, public.application_record_ou(p_table, p_row));
  return public.current_user_has_access(v_module, v_action, v_ou);
end;
$$;

-- Anonymous users receive no table data. Login identifier resolution remains an explicitly scoped RPC.
do $$
declare v_table record;
begin
  for v_table in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke all on table public.%I from anon', v_table.tablename);
  end loop;
end $$;

-- Apply uniform backend enforcement to application data tables. Central authorization/workflow tables retain their specialized policies.
do $$
declare
  v_table text;
  v_policy record;
  v_tables text[] := array[
    'subprojects','activities','office_requirements','staffing_requirements','other_program_expenses',
    'financial_obligations','financial_disbursements','subproject_accomplishments','activity_ipos',
    'activity_monitoring_reports','activity_monitoring_actions','ipos','ipo_history','marketing_partners',
    'lod_answers','lod_assessments','lod_choices','lod_level_configs','lod_questionnaire_versions','lod_questions','lod_sections',
    'gad_pimme_answers','gad_pimme_assessments','ref_commodities','ref_equipment','ref_equipment_categories','ref_infrastructure','ref_inputs',
    'ref_livestock','ref_trainings','reference_activities','reference_commodities','reference_particulars','reference_uacs','gida_areas','elcac_areas',
    'award_manual_scores','award_ranking_settings','report_display_settings','bar1_report_snapshots','deadlines','budget_ceilings',
    'budget_item_adjustment_history','dcf_policy_settings','trash_bin','user_logs'
  ];
begin
  foreach v_table in array v_tables loop
    if to_regclass('public.' || v_table) is null then continue; end if;
    execute format('alter table public.%I enable row level security', v_table);
    for v_policy in select policyname from pg_policies where schemaname = 'public' and tablename = v_table loop
      execute format('drop policy if exists %I on public.%I', v_policy.policyname, v_table);
    end loop;
    execute format('drop policy if exists centralized_select on public.%I', v_table);
    execute format('drop policy if exists centralized_insert on public.%I', v_table);
    execute format('drop policy if exists centralized_update on public.%I', v_table);
    execute format('drop policy if exists centralized_delete on public.%I', v_table);
    execute format('create policy centralized_select on public.%I for select to authenticated using (public.current_user_can_table_action(%L, ''select'', to_jsonb(%I)))', v_table, v_table, v_table);
    execute format('create policy centralized_insert on public.%I for insert to authenticated with check (public.current_user_can_table_action(%L, ''insert'', to_jsonb(%I)))', v_table, v_table, v_table);
    execute format('create policy centralized_update on public.%I for update to authenticated using (public.current_user_can_table_action(%L, ''update'', to_jsonb(%I))) with check (public.current_user_can_table_action(%L, ''update'', to_jsonb(%I)))', v_table, v_table, v_table, v_table, v_table);
    execute format('create policy centralized_delete on public.%I for delete to authenticated using (public.current_user_can_table_action(%L, ''delete'', to_jsonb(%I)))', v_table, v_table, v_table);
  end loop;
end $$;

create or replace function public.stamp_user_log_identity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_actor public.users%rowtype;
begin
  select * into v_actor from public.users where auth_id = auth.uid() and is_active = true;
  if v_actor.id is null then raise exception 'Active authenticated profile required'; end if;
  new.username := v_actor.username;
  new.operating_unit := v_actor."operatingUnit";
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists stamp_user_log_identity on public.user_logs;
create trigger stamp_user_log_identity before insert on public.user_logs
for each row execute function public.stamp_user_log_identity();

-- Retire legacy permission stores as authorization inputs. They remain preserved for
-- rollback/audit compatibility but have no authenticated read or write path.
do $$
declare v_table text; v_policy record;
begin
  foreach v_table in array array['roles_config','user_roles_config'] loop
    if to_regclass('public.' || v_table) is null then continue; end if;
    execute format('alter table public.%I enable row level security', v_table);
    for v_policy in select policyname from pg_policies where schemaname = 'public' and tablename = v_table loop
      execute format('drop policy if exists %I on public.%I', v_policy.policyname, v_table);
    end loop;
    execute format('revoke all on table public.%I from anon, authenticated', v_table);
  end loop;
end $$;

revoke all on function public.current_user_can_table_action(text, text, jsonb) from public;
grant execute on function public.current_user_can_table_action(text, text, jsonb) to authenticated;

commit;
