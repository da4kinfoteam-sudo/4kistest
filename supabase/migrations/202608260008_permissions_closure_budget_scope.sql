begin;

-- Budget ceilings are displayed by the Financial Accomplishment page, so
-- reads must follow that page's effective view/scope.  Writes remain a
-- separate administrative capability in Settings - Financial Accomplishment.
-- This prevents a settings-module classification from silently removing
-- budget data from otherwise authorized financial users.
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
  v_operation text := lower(p_operation);
  v_module text := case
    when p_table = 'budget_ceilings' and v_operation = 'select' then 'Accomplishment - Financial'
    else public.application_table_module(p_table)
  end;
  v_action text := case v_operation
    when 'select' then 'view'
    when 'insert' then 'create'
    when 'update' then 'edit'
    when 'delete' then 'delete'
    else null
  end;
  v_ou text;
  v_parent text;
  v_source_module text;
  v_is_core boolean := p_table in (
    'subprojects','activities','office_requirements',
    'staffing_requirements','other_program_expenses'
  );
begin
  if v_module is null then return false; end if;
  v_ou := public.application_record_ou(p_table, p_row);
  v_parent := case
    when v_module like 'Dashboard - %' then 'Dashboards'
    when v_module like 'Report - %' then 'Reports'
    when v_module like 'Program Management - %' then 'Program Management'
    when v_module like 'References - %' then 'References'
    else null end;
  if v_parent is not null and not public.current_user_has_access(v_parent, 'view', v_ou) then
    return false;
  end if;

  if p_table in ('financial_obligations','financial_disbursements') then
    v_action := case v_operation
      when 'select' then 'view'
      when 'delete' then 'delete_financial_actual'
      else 'edit_financial_actual' end;
    v_source_module := public.financial_actual_source_module(p_row);
    if v_source_module is null then return false; end if;
    return public.current_user_has_access('Accomplishment - Financial', v_action, v_ou)
      and public.current_user_has_access(v_source_module,
        case when v_operation = 'select' then 'view' else v_action end, v_ou);
  elsif p_table = 'subproject_accomplishments' and v_operation <> 'select' then
    v_action := 'edit_physical_actual';
  elsif v_is_core and v_operation = 'update' then
    return public.current_user_has_access(v_module, 'edit', v_ou)
      or (public.current_user_has_access(v_module, 'edit_financial_actual', v_ou)
        and public.current_user_has_access('Accomplishment - Financial', 'edit_financial_actual', v_ou))
      or (public.current_user_has_access(v_module, 'edit_physical_actual', v_ou)
        and public.current_user_has_access('Accomplishment - Physical', 'edit_physical_actual', v_ou));
  elsif p_table in ('lod_assessments','lod_answers') and v_operation <> 'select' then
    v_action := case when v_operation = 'delete' then 'delete' else 'edit_assessment' end;
  elsif p_table in (
    'lod_sections','lod_questions','lod_choices','lod_level_configs','lod_questionnaire_versions'
  ) and v_operation <> 'select' then
    v_action := 'manage_settings';
  elsif p_table in (
    'dcf_policy_settings','roles_config','deadlines','budget_ceilings',
    'award_ranking_settings','report_display_settings'
  ) and v_operation <> 'select' then
    v_action := 'manage_settings';
  elsif p_table = 'activity_ipos' and v_operation <> 'select' then
    v_action := 'edit';
  elsif p_table = 'activity_monitoring_reports' then
    v_action := case v_operation when 'select' then 'view_monitoring' else 'manage_monitoring' end;
  elsif p_table = 'activity_monitoring_actions' then
    v_action := case v_operation
      when 'select' then 'view_monitoring'
      when 'delete' then 'delete_monitoring_action'
      else 'add_monitoring_action' end;
  elsif p_table = 'budget_item_adjustment_history' then
    v_action := case when v_operation = 'select' then 'view' else 'edit_financial_actual' end;
  elsif p_table = 'trash_bin' and v_operation = 'insert' then
    v_module := case p_row->>'entity_type'
      when 'subproject' then 'Subprojects'
      when 'activity' then 'Activities'
      when 'office_requirement' then 'Program Management - Office Requirements'
      when 'staffing_requirement' then 'Program Management - Staffing Requirements'
      when 'other_program_expense' then 'Program Management - Other Program Expenses'
      when 'ipo' then 'IPO Management'
      else 'Settings - Archive' end;
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

revoke all on function public.current_user_can_table_action(text, text, jsonb) from public;
grant execute on function public.current_user_can_table_action(text, text, jsonb) to authenticated;

commit;
