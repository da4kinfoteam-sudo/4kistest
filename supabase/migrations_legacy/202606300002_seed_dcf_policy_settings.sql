-- Seed the recommended DCF editing policy only when no admin-saved policy exists.
-- This intentionally does not overwrite existing settings.

insert into public.dcf_policy_settings (settings_key, settings)
with roles(role_name) as (
  values
    ('Super Admin'),
    ('Administrator'),
    ('Management'),
    ('Focal - User'),
    ('RFO - User'),
    ('User'),
    ('Guest')
),
modules(module_key, statuses) as (
  values
    ('subprojects', array['Proposed', 'Ongoing', 'Completed', 'Cancelled']::text[]),
    ('activities', array['Proposed', 'Ongoing', 'Completed', 'Cancelled']::text[]),
    ('office_requirements', array['Proposed', 'Ongoing', 'Completed', 'Cancelled']::text[]),
    ('staffing_requirements', array['Proposed', 'Filled', 'Unfilled']::text[]),
    ('other_program_expenses', array['Proposed', 'Ongoing', 'Completed', 'Cancelled']::text[])
),
status_rules as (
  select
    roles.role_name,
    modules.module_key,
    status_name,
    case
      when roles.role_name in ('Super Admin', 'Administrator') then
        jsonb_build_object(
          'editDetails', true,
          'editBudget', true,
          'editPhysicalAccomplishment', true,
          'editFinancialAccomplishment', true,
          'delete', true
        )
      when roles.role_name = 'Guest' then
        jsonb_build_object(
          'editDetails', false,
          'editBudget', false,
          'editPhysicalAccomplishment', false,
          'editFinancialAccomplishment', false,
          'delete', false
        )
      when status_name = 'Proposed' then
        jsonb_build_object(
          'editDetails', true,
          'editBudget', true,
          'editPhysicalAccomplishment', false,
          'editFinancialAccomplishment', false,
          'delete', true
        )
      when status_name = 'Ongoing' then
        jsonb_build_object(
          'editDetails', false,
          'editBudget', false,
          'editPhysicalAccomplishment', true,
          'editFinancialAccomplishment', true,
          'delete', false
        )
      else
        jsonb_build_object(
          'editDetails', false,
          'editBudget', false,
          'editPhysicalAccomplishment', false,
          'editFinancialAccomplishment', false,
          'delete', false
        )
    end as action_rules
  from roles
  cross join modules
  cross join unnest(modules.statuses) as status_name
),
module_rules as (
  select
    role_name,
    module_key,
    jsonb_object_agg(status_name, action_rules order by status_name) as status_map
  from status_rules
  group by role_name, module_key
),
role_rules as (
  select
    role_name,
    jsonb_object_agg(module_key, status_map order by module_key) as module_map
  from module_rules
  group by role_name
),
policy as (
  select jsonb_build_object(
    'version', 1,
    'roleRules', jsonb_object_agg(role_name, module_map order by role_name),
    'monthLock', jsonb_build_object(
      'enabled', true,
      'dateSource', 'server',
      'graceDays', 5,
      'blockPastMonthsAfterGrace', true,
      'blockFutureMonths', true,
      'overrideRoles', to_jsonb(array['Super Admin', 'Administrator']),
      'requireOverrideReason', true
    )
  ) as settings
  from role_rules
)
select 'dcf_editing_policy', settings
from policy
on conflict (settings_key) do nothing;
