begin;

alter table public.authorization_policy
  add column if not exists legacy_user_auto_approve_role text not null default 'User',
  add column if not exists legacy_user_auto_approve_modules text[] not null default array[
    'Subprojects',
    'Activities',
    'Program Management - Office Requirements',
    'Program Management - Staffing Requirements',
    'Program Management - Other Program Expenses'
  ]::text[];

update public.authorization_policy
set legacy_user_auto_approve_role = coalesce(nullif(legacy_user_auto_approve_role, ''), 'User'),
    legacy_user_auto_approve_modules = case
      when coalesce(array_length(legacy_user_auto_approve_modules, 1), 0) = 0 then array[
        'Subprojects', 'Activities',
        'Program Management - Office Requirements',
        'Program Management - Staffing Requirements',
        'Program Management - Other Program Expenses'
      ]::text[]
      else legacy_user_auto_approve_modules
    end
where singleton = true;

-- The hierarchy trigger intentionally requires an end-user actor. These are trusted,
-- set-preserving migration copies, so suspend user triggers only for this seed block.
alter table public.authorization_role_rules disable trigger user;
alter table public.authorization_user_rules disable trigger user;
alter table public.authorization_user_scopes disable trigger user;

-- Preserve existing policy intent while splitting parent pages into independently configurable children.
with module_map(parent_module, child_module) as (
  values
    ('Dashboards', 'Dashboard - Physical'),
    ('Dashboards', 'Dashboard - Financial'),
    ('Dashboards', 'Dashboard - SCAD'),
    ('Dashboards', 'Dashboard - Agricultural Interventions'),
    ('Dashboards', 'Dashboard - Farm Productivity and Income'),
    ('Dashboards', 'Dashboard - Commodities'),
    ('Dashboards', 'Dashboard - IPO Level of Development'),
    ('Dashboards', 'Dashboard - GAD'),
    ('Dashboards', 'Dashboard - Nutrition'),
    ('Dashboards', 'Dashboard - Awards and Rankings'),
    ('Reports', 'Report - WFP'),
    ('Reports', 'Report - BP Forms'),
    ('Reports', 'Report - BEDS'),
    ('Reports', 'Report - PICS'),
    ('Reports', 'Report - BAR1'),
    ('Reports', 'Report - Budget Utilization'),
    ('Reports', 'Report - Monthly Matrix'),
    ('Reports', 'Report - Detailed Accomplishment Data'),
    ('Reports', 'Report - Financial Audit'),
    ('Program Management', 'Program Management - Office Requirements'),
    ('Program Management', 'Program Management - Staffing Requirements'),
    ('Program Management', 'Program Management - Other Program Expenses'),
    ('References', 'References - UACS Codes'),
    ('References', 'References - Subproject Items'),
    ('References', 'References - Crops'),
    ('References', 'References - Livestock'),
    ('References', 'References - Agricultural Inputs'),
    ('References', 'References - Equipment'),
    ('References', 'References - Infrastructure'),
    ('References', 'References - Training'),
    ('References', 'References - GIDA Areas'),
    ('References', 'References - ELCAC Areas')
)
insert into public.authorization_role_rules(role, module, action, allowed, visibility_scope, updated_at, updated_by)
select rule.role, map.child_module, rule.action, rule.allowed, rule.visibility_scope, now(), rule.updated_by
from public.authorization_role_rules rule
join module_map map on map.parent_module = rule.module
on conflict (role, module, action) do nothing;

with module_map(parent_module, child_module) as (
  values
    ('Dashboards', 'Dashboard - Physical'), ('Dashboards', 'Dashboard - Financial'),
    ('Dashboards', 'Dashboard - SCAD'), ('Dashboards', 'Dashboard - Agricultural Interventions'),
    ('Dashboards', 'Dashboard - Farm Productivity and Income'), ('Dashboards', 'Dashboard - Commodities'),
    ('Dashboards', 'Dashboard - IPO Level of Development'), ('Dashboards', 'Dashboard - GAD'),
    ('Dashboards', 'Dashboard - Nutrition'), ('Dashboards', 'Dashboard - Awards and Rankings'),
    ('Reports', 'Report - WFP'), ('Reports', 'Report - BP Forms'), ('Reports', 'Report - BEDS'),
    ('Reports', 'Report - PICS'), ('Reports', 'Report - BAR1'), ('Reports', 'Report - Budget Utilization'),
    ('Reports', 'Report - Monthly Matrix'), ('Reports', 'Report - Detailed Accomplishment Data'),
    ('Reports', 'Report - Financial Audit'),
    ('Program Management', 'Program Management - Office Requirements'),
    ('Program Management', 'Program Management - Staffing Requirements'),
    ('Program Management', 'Program Management - Other Program Expenses'),
    ('References', 'References - UACS Codes'), ('References', 'References - Subproject Items'),
    ('References', 'References - Crops'), ('References', 'References - Livestock'),
    ('References', 'References - Agricultural Inputs'), ('References', 'References - Equipment'),
    ('References', 'References - Infrastructure'), ('References', 'References - Training'),
    ('References', 'References - GIDA Areas'), ('References', 'References - ELCAC Areas')
)
insert into public.authorization_user_rules(user_id, module, action, effect, updated_at, updated_by)
select rule.user_id, map.child_module, rule.action, rule.effect, now(), rule.updated_by
from public.authorization_user_rules rule
join module_map map on map.parent_module = rule.module
on conflict (user_id, module, action) do nothing;

with module_map(parent_module, child_module) as (
  values
    ('Dashboards', 'Dashboard - Physical'), ('Dashboards', 'Dashboard - Financial'),
    ('Dashboards', 'Dashboard - SCAD'), ('Dashboards', 'Dashboard - Agricultural Interventions'),
    ('Dashboards', 'Dashboard - Farm Productivity and Income'), ('Dashboards', 'Dashboard - Commodities'),
    ('Dashboards', 'Dashboard - IPO Level of Development'), ('Dashboards', 'Dashboard - GAD'),
    ('Dashboards', 'Dashboard - Nutrition'), ('Dashboards', 'Dashboard - Awards and Rankings'),
    ('Reports', 'Report - WFP'), ('Reports', 'Report - BP Forms'), ('Reports', 'Report - BEDS'),
    ('Reports', 'Report - PICS'), ('Reports', 'Report - BAR1'), ('Reports', 'Report - Budget Utilization'),
    ('Reports', 'Report - Monthly Matrix'), ('Reports', 'Report - Detailed Accomplishment Data'),
    ('Reports', 'Report - Financial Audit'),
    ('Program Management', 'Program Management - Office Requirements'),
    ('Program Management', 'Program Management - Staffing Requirements'),
    ('Program Management', 'Program Management - Other Program Expenses'),
    ('References', 'References - UACS Codes'), ('References', 'References - Subproject Items'),
    ('References', 'References - Crops'), ('References', 'References - Livestock'),
    ('References', 'References - Agricultural Inputs'), ('References', 'References - Equipment'),
    ('References', 'References - Infrastructure'), ('References', 'References - Training'),
    ('References', 'References - GIDA Areas'), ('References', 'References - ELCAC Areas')
)
insert into public.authorization_user_scopes(user_id, module, visibility_scope, updated_at, updated_by)
select scope.user_id, map.child_module, scope.visibility_scope, now(), scope.updated_by
from public.authorization_user_scopes scope
join module_map map on map.parent_module = scope.module
on conflict (user_id, module) do nothing;

-- Financial Audit previously used Reports.manage_settings; retain that default during the split.
insert into public.authorization_role_rules(role, module, action, allowed, visibility_scope, updated_at, updated_by)
select role, 'Report - Financial Audit', 'view', allowed, visibility_scope, now(), updated_by
from public.authorization_role_rules
where module = 'Reports' and action = 'manage_settings'
on conflict (role, module, action) do update
set allowed = excluded.allowed, visibility_scope = excluded.visibility_scope, updated_at = now();

insert into public.authorization_user_rules(user_id, module, action, effect, updated_at, updated_by)
select user_id, 'Report - Financial Audit', 'view', effect, now(), updated_by
from public.authorization_user_rules
where module = 'Reports' and action = 'manage_settings'
on conflict (user_id, module, action) do update set effect = excluded.effect, updated_at = now();

-- Named LOD controls replace hidden role assumptions while preserving current defaults.
insert into public.authorization_role_rules(role, module, action, allowed, visibility_scope, updated_at, updated_by)
select role, module, named.action, source.allowed, source.visibility_scope, now(), source.updated_by
from public.authorization_role_rules source
cross join (values
  ('edit_assessment', 'edit'),
  ('set_manual_level', 'manage_settings'),
  ('manage_controller', 'manage_settings'),
  ('inline_edit', 'manage_settings'),
  ('bulk_action', 'manage_settings')
) named(action, source_action)
where source.module = 'Level of Development' and source.action = named.source_action
on conflict (role, module, action) do nothing;

insert into public.authorization_user_rules(user_id, module, action, effect, updated_at, updated_by)
select user_id, module, named.action, source.effect, now(), source.updated_by
from public.authorization_user_rules source
cross join (values
  ('edit_assessment', 'edit'),
  ('set_manual_level', 'manage_settings'),
  ('manage_controller', 'manage_settings'),
  ('inline_edit', 'manage_settings'),
  ('bulk_action', 'manage_settings')
) named(action, source_action)
where source.module = 'Level of Development' and source.action = named.source_action
on conflict (user_id, module, action) do nothing;

alter table public.authorization_role_rules enable trigger user;
alter table public.authorization_user_rules enable trigger user;
alter table public.authorization_user_scopes enable trigger user;

update public.authorization_policy
set policy_version = policy_version + 1, updated_at = now()
where singleton = true;

-- Migrate Program Management workflow assignments to each governed child module.
insert into public.workflow_assignments(submitter_user_id, module, approver_user_id, active, created_by, created_at, updated_at)
select assignment.submitter_user_id, child.module, assignment.approver_user_id,
       assignment.active, assignment.created_by, assignment.created_at, now()
from public.workflow_assignments assignment
cross join (values
  ('Program Management - Office Requirements'),
  ('Program Management - Staffing Requirements'),
  ('Program Management - Other Program Expenses')
) child(module)
where assignment.module = 'Program Management'
on conflict (submitter_user_id, module) do update
set approver_user_id = excluded.approver_user_id, active = excluded.active, updated_at = now();

update public.workflow_assignments set active = false, updated_at = now() where module = 'Program Management';

update public.workflow_settings settings
set default_administrator_id = (
  select id from public.users where role = 'Administrator' and is_active = true order by id limit 1
)
where settings.singleton = true
  and not exists (
    select 1 from public.users administrator
    where administrator.id = settings.default_administrator_id
      and administrator.role = 'Administrator' and administrator.is_active = true
  );

create or replace function public.workflow_entity_module(p_entity_type text)
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

-- Extend the temporary migration exception with its configured role and module list.
do $$
declare
  definition text;
  old_condition text := 'v_actor.role = ''User'' and v_policy.legacy_user_auto_approve_enabled';
  new_condition text := 'v_actor.role = coalesce(v_policy.legacy_user_auto_approve_role, ''User'') and v_module = any(coalesce(v_policy.legacy_user_auto_approve_modules, array[]::text[])) and v_policy.legacy_user_auto_approve_enabled';
begin
  definition := pg_get_functiondef('public.transition_workflow(text,bigint,text,text)'::regprocedure);
  if position(old_condition in definition) = 0 then
    raise exception 'Unable to align transition_workflow temporary auto-approval condition.';
  end if;
  execute replace(definition, old_condition, new_condition);
end $$;

create or replace function public.application_table_module(p_table text)
returns text
language sql
immutable
as $$
  select case
    when p_table = 'subprojects' then 'Subprojects'
    when p_table in ('activities','activity_ipos','activity_monitoring_reports','activity_monitoring_actions') then 'Activities'
    when p_table = 'office_requirements' then 'Program Management - Office Requirements'
    when p_table = 'staffing_requirements' then 'Program Management - Staffing Requirements'
    when p_table = 'other_program_expenses' then 'Program Management - Other Program Expenses'
    when p_table in ('financial_obligations','financial_disbursements') then 'Accomplishment - Financial'
    when p_table = 'subproject_accomplishments' then 'Accomplishment - Physical'
    when p_table in ('ipos','ipo_history') then 'IPO Management'
    when p_table = 'marketing_partners' then 'Marketing Database'
    when p_table like 'lod_%' then 'Level of Development'
    when p_table like 'gad_%' then 'Gender and Development'
    when p_table = 'reference_uacs' then 'References - UACS Codes'
    when p_table = 'reference_particulars' then 'References - Subproject Items'
    when p_table in ('ref_commodities','reference_commodities') then 'References - Crops'
    when p_table = 'ref_livestock' then 'References - Livestock'
    when p_table = 'ref_inputs' then 'References - Agricultural Inputs'
    when p_table in ('ref_equipment','ref_equipment_categories') then 'References - Equipment'
    when p_table = 'ref_infrastructure' then 'References - Infrastructure'
    when p_table in ('ref_trainings','reference_activities') then 'References - Training'
    when p_table = 'gida_areas' then 'References - GIDA Areas'
    when p_table = 'elcac_areas' then 'References - ELCAC Areas'
    when p_table in ('award_manual_scores','award_ranking_settings') then 'Dashboard - Awards and Rankings'
    when p_table = 'bar1_report_snapshots' then 'Report - BAR1'
    when p_table = 'report_display_settings' then 'Reports'
    when p_table = 'deadlines' then 'Settings - System'
    when p_table = 'budget_ceilings' then 'Settings - Financial Accomplishment'
    when p_table = 'budget_item_adjustment_history' then 'Accomplishment - Financial'
    when p_table = 'dcf_policy_settings' then 'Settings - DCF and Status'
    when p_table = 'trash_bin' then 'Settings - Archive'
    when p_table = 'user_logs' then 'Settings - Audit and Security'
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
    when 'activity_expense' then 'Activities'
    when 'office_requirement' then 'Program Management - Office Requirements'
    when 'staffing_expense' then 'Program Management - Staffing Requirements'
    when 'other_program_expense' then 'Program Management - Other Program Expenses'
    else null
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
  v_parent text;
  v_source_module text;
begin
  if v_module is null then return false; end if;
  v_action := case lower(p_operation)
    when 'select' then 'view'
    when 'insert' then 'create'
    when 'update' then 'edit'
    when 'delete' then 'delete'
    else null end;

  if p_table in ('financial_obligations','financial_disbursements') then
    v_action := case lower(p_operation)
      when 'select' then 'view'
      when 'delete' then 'delete_financial_actual'
      else 'edit_financial_actual' end;
    v_ou := public.application_record_ou(p_table, p_row);
    v_source_module := public.financial_actual_source_module(p_row);
    if v_source_module is null then return false; end if;
    return public.current_user_has_access('Accomplishment - Financial', v_action, v_ou)
      and public.current_user_has_access(v_source_module, case when lower(p_operation) = 'select' then 'view' else v_action end, v_ou);
  elsif p_table in ('lod_assessments','lod_answers') and lower(p_operation) <> 'select' then
    v_action := case when lower(p_operation) = 'delete' then 'delete' else 'edit_assessment' end;
  elsif p_table in ('lod_sections','lod_questions','lod_choices','lod_level_configs','lod_questionnaire_versions') and lower(p_operation) <> 'select' then
    v_action := 'manage_settings';
  elsif p_table in ('dcf_policy_settings','roles_config','deadlines','budget_ceilings','award_ranking_settings','report_display_settings') and lower(p_operation) <> 'select' then
    v_action := 'manage_settings';
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
      when 'subproject' then 'Subprojects'
      when 'activity' then 'Activities'
      when 'office_requirement' then 'Program Management - Office Requirements'
      when 'staffing_requirement' then 'Program Management - Staffing Requirements'
      when 'other_program_expense' then 'Program Management - Other Program Expenses'
      when 'ipo' then 'IPO Management'
      else 'Settings - Archive' end;
    v_action := case when v_module = 'Settings - Archive' then 'manage_settings' else 'delete' end;
    v_ou := coalesce(p_row->'data'->>'operatingUnit', p_row->'data'->>'operating_unit');
  elsif p_table = 'user_logs' then
    if lower(p_operation) = 'insert' then v_module := 'Profile'; v_action := 'view';
    elsif lower(p_operation) = 'select' then v_action := 'view';
    else v_action := 'manage_settings'; end if;
  end if;

  if v_action is null then return false; end if;
  v_ou := coalesce(v_ou, public.application_record_ou(p_table, p_row));
  v_parent := case
    when v_module like 'Dashboard - %' then 'Dashboards'
    when v_module like 'Report - %' then 'Reports'
    when v_module like 'Program Management - %' then 'Program Management'
    when v_module like 'References - %' then 'References'
    else null end;
  return (v_parent is null or public.current_user_has_access(v_parent, 'view', v_ou))
    and public.current_user_has_access(v_module, v_action, v_ou);
end;
$$;

create or replace function public.enforce_lod_assessment_identity_and_controls()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor public.users%rowtype;
  sensitive_change boolean;
begin
  select * into actor from public.users where auth_id = auth.uid() and is_active = true;
  if actor.id is null then raise exception 'Active authenticated profile required'; end if;
  if not public.current_user_has_access('Level of Development', 'edit_assessment') then
    raise exception 'LOD assessment edit permission is required';
  end if;
  sensitive_change := tg_op = 'INSERT' and (
      new.manual_level is not null or coalesce(new.is_carried_over, false) or coalesce(new.is_dropped, false)
    ) or tg_op = 'UPDATE' and (
      (new.manual_level is not null and new.manual_level is distinct from old.manual_level)
      or (new.manual_override_reason is not null and new.manual_override_reason is distinct from old.manual_override_reason)
      or (coalesce(new.is_carried_over, false) and new.is_carried_over is distinct from old.is_carried_over)
      or (new.carried_over_from_assessment_id is not null and new.carried_over_from_assessment_id is distinct from old.carried_over_from_assessment_id)
      or (coalesce(new.is_dropped, false) and new.is_dropped is distinct from old.is_dropped)
    );
  if sensitive_change and not public.current_user_has_access('Level of Development', 'set_manual_level') then
    raise exception 'LOD manual-level permission is required';
  end if;
  new.assessed_by := actor.id;
  new.assessor_name := coalesce(nullif(actor."fullName", ''), actor.email, actor.username);
  return new;
end;
$$;

drop trigger if exists enforce_lod_assessment_identity_and_controls on public.lod_assessments;
create trigger enforce_lod_assessment_identity_and_controls
before insert or update on public.lod_assessments
for each row execute function public.enforce_lod_assessment_identity_and_controls();

-- Remove the legacy hard-coded Super-only gate; the trigger and named capabilities are authoritative.
do $$
declare
  definition text;
begin
  definition := pg_get_functiondef('public.save_lod_manual_overrides(jsonb,bigint,text,text)'::regprocedure);
  if position('where id = p_actor_id' in definition) = 0
     or position('actor.id is null or actor.role <> ''Super Admin''' in definition) = 0
     or position('if p_source not in (''lod_list_bulk'', ''lod_list_inline'')' in definition) = 0 then
    raise exception 'Unable to replace legacy LOD Super-only gate.';
  end if;
  definition := replace(definition,
    'where id = p_actor_id',
    'where auth_id = auth.uid() and is_active = true');
  definition := replace(definition,
    'actor.id is null or actor.role <> ''Super Admin''',
    'actor.id is null or actor.id is distinct from p_actor_id or not public.current_user_has_access(''Level of Development'', ''set_manual_level'')');
  definition := replace(definition,
    'if p_source not in (''lod_list_bulk'', ''lod_list_inline'')',
    'if p_source = ''lod_list_bulk'' and not public.current_user_has_access(''Level of Development'', ''bulk_action'') then raise exception ''LOD bulk-action permission is required.''; end if;' || chr(10)
    || '  if p_source = ''lod_list_inline'' and not public.current_user_has_access(''Level of Development'', ''inline_edit'') then raise exception ''LOD inline-edit permission is required.''; end if;' || chr(10)
    || '  if p_source not in (''lod_list_bulk'', ''lod_list_inline'')');
  execute definition;
end $$;

revoke all on function public.save_lod_manual_overrides(jsonb, bigint, text, text) from anon;
revoke all on function public.save_lod_assessment(integer, integer, jsonb, integer, text, boolean, integer, boolean, text, bigint, text) from anon;
revoke all on function public.bulk_save_lod_admin_states(jsonb, bigint, text) from anon;
revoke all on function public.save_lod_questionnaire_configuration(jsonb, jsonb, jsonb, jsonb, integer, bigint, text) from anon;

grant execute on function public.save_lod_manual_overrides(jsonb, bigint, text, text) to authenticated;
grant execute on function public.save_lod_assessment(integer, integer, jsonb, integer, text, boolean, integer, boolean, text, bigint, text) to authenticated;
grant execute on function public.bulk_save_lod_admin_states(jsonb, bigint, text) to authenticated;
grant execute on function public.save_lod_questionnaire_configuration(jsonb, jsonb, jsonb, jsonb, integer, bigint, text) to authenticated;

commit;
