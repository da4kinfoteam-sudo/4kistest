begin;

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
    when p_table = 'report_display_settings' then 'Report - Detailed Accomplishment Data'
    when p_table = 'deadlines' then 'Settings - System'
    when p_table = 'budget_ceilings' then 'Settings - Financial Accomplishment'
    when p_table = 'budget_item_adjustment_history' then 'Accomplishment - Financial'
    when p_table = 'dcf_policy_settings' then 'Settings - DCF and Status'
    when p_table = 'trash_bin' then 'Settings - Archive'
    when p_table = 'user_logs' then 'Settings - Audit and Security'
    else null
  end;
$$;

commit;
