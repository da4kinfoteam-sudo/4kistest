alter table public.subprojects
  add column if not exists physical_accomplishment_submitted_at timestamptz;

alter table public.activities
  add column if not exists physical_accomplishment_submitted_at timestamptz;

alter table public.office_requirements
  add column if not exists physical_accomplishment_submitted_at timestamptz;

alter table public.staffing_requirements
  add column if not exists physical_accomplishment_submitted_at timestamptz;

create index if not exists idx_subprojects_physical_accomplishment_submitted_at
  on public.subprojects (physical_accomplishment_submitted_at);

create index if not exists idx_activities_physical_accomplishment_submitted_at
  on public.activities (physical_accomplishment_submitted_at);

create index if not exists idx_office_requirements_physical_accomplishment_submitted_at
  on public.office_requirements (physical_accomplishment_submitted_at);

create index if not exists idx_staffing_requirements_physical_accomplishment_submitted_at
  on public.staffing_requirements (physical_accomplishment_submitted_at);

update public.subprojects
set physical_accomplishment_submitted_at = coalesce(
  (
    select min((entry ->> 'date')::timestamptz)
    from jsonb_array_elements(coalesce(to_jsonb(history), '[]'::jsonb)) entry
    where nullif(entry ->> 'date', '') is not null
      and (entry ->> 'event') ~* '(accomplishment|subproject completed|completed)'
  ),
  updated_at,
  created_at
)
where physical_accomplishment_submitted_at is null
  and nullif("actualCompletionDate"::text, '') is not null;

update public.activities
set physical_accomplishment_submitted_at = coalesce(
  (
    select min((entry ->> 'date')::timestamptz)
    from jsonb_array_elements(coalesce(to_jsonb(history), '[]'::jsonb)) entry
    where nullif(entry ->> 'date', '') is not null
      and (entry ->> 'event') ~* '(accomplishment|completed)'
  ),
  updated_at,
  created_at
)
where physical_accomplishment_submitted_at is null
  and nullif("actualDate"::text, '') is not null;

update public.office_requirements
set physical_accomplishment_submitted_at = coalesce(updated_at, created_at)
where physical_accomplishment_submitted_at is null
  and (
    nullif("actualDate"::text, '') is not null
    or nullif("actualObligationDate"::text, '') is not null
  );

update public.staffing_requirements
set physical_accomplishment_submitted_at = coalesce(updated_at, created_at)
where physical_accomplishment_submitted_at is null
  and (
    nullif("actualDate"::text, '') is not null
    or nullif("actualObligationDate"::text, '') is not null
  );
