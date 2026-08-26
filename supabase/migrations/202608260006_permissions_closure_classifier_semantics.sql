begin;

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
  -- Removing financial actual fields yields the same projection, while the
  -- physical projection changes only when physical actuals also changed.
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

commit;
