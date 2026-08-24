-- Allow signed actual-obligation adjustments without rewriting production data.
-- This migration is intentionally limited to CHECK constraints that reference
-- actual-obligation amount columns and explicitly compare them with zero.

do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select
      ns.nspname as schema_name,
      cls.relname as table_name,
      con.conname as constraint_name
    from pg_constraint con
    join pg_class cls on cls.oid = con.conrelid
    join pg_namespace ns on ns.oid = cls.relnamespace
    where ns.nspname = 'public'
      and con.contype = 'c'
      and cls.relname in (
        'financial_obligations',
        'office_requirements',
        'staffing_requirements',
        'other_program_expenses'
      )
      and (
        (cls.relname = 'financial_obligations' and pg_get_constraintdef(con.oid) ~* '\mamount\M')
        or pg_get_constraintdef(con.oid) ~* 'actualObligationAmount'
      )
      and (
        pg_get_constraintdef(con.oid) ~ '(>=|>)\s*\(*\s*0(\s*\)*\s*::[[:alnum:]_]+)?'
        or pg_get_constraintdef(con.oid) ~ '0(\s*\)*\s*::[[:alnum:]_]+)?\s*(<=|<)'
      )
  loop
    execute format(
      'alter table %I.%I drop constraint if exists %I',
      constraint_row.schema_name,
      constraint_row.table_name,
      constraint_row.constraint_name
    );
  end loop;
end
$$;

comment on column public.financial_obligations.amount is
  'Signed actual obligation amount. Negative values represent adjustments or reversals.';
