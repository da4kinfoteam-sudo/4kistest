begin;

create table if not exists public.workflow_settings (
  singleton boolean primary key default true check (singleton),
  default_administrator_id bigint references public.users(id),
  updated_at timestamptz not null default now(),
  updated_by bigint references public.users(id)
);
insert into public.workflow_settings(singleton) values (true) on conflict (singleton) do nothing;

create table if not exists public.workflow_assignments (
  id bigint generated always as identity primary key,
  submitter_user_id bigint not null references public.users(id) on delete cascade,
  approver_user_id bigint not null references public.users(id),
  module text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by bigint references public.users(id),
  unique (submitter_user_id, module)
);

create table if not exists public.workflow_events (
  id bigint generated always as identity primary key,
  entity_type text not null,
  entity_id bigint not null,
  module text not null,
  event_type text not null check (event_type in ('draft', 'submit', 'withdraw', 'approve', 'reject', 'resubmit', 'revision', 'override')),
  previous_status text,
  new_status text,
  revision_number integer not null default 1,
  actor_user_id bigint references public.users(id),
  actor_role text,
  approver_assignment_id bigint references public.workflow_assignments(id),
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists workflow_events_entity_idx on public.workflow_events(entity_type, entity_id, created_at desc);
create index if not exists workflow_assignments_approver_idx on public.workflow_assignments(approver_user_id, active, module);

do $$
declare
  table_name text;
begin
  foreach table_name in array array['subprojects','activities','office_requirements','staffing_requirements','other_program_expenses'] loop
    execute format('alter table public.%I add column if not exists created_by_user_id bigint references public.users(id)', table_name);
    execute format('alter table public.%I add column if not exists revision_number integer not null default 1', table_name);
    execute format('alter table public.%I add column if not exists approved_revision integer', table_name);
    execute format('alter table public.%I add column if not exists submitted_at timestamptz', table_name);
    execute format('alter table public.%I add column if not exists approved_at timestamptz', table_name);
    execute format('alter table public.%I add column if not exists approved_by_user_id bigint references public.users(id)', table_name);
    execute format('alter table public.%I add column if not exists rejected_at timestamptz', table_name);
    execute format('alter table public.%I add column if not exists rejected_by_user_id bigint references public.users(id)', table_name);
  end loop;
end $$;

-- Link historical ownership where possible without changing record identity.
do $$
declare v_table text;
begin
  foreach v_table in array array['subprojects','activities','office_requirements','staffing_requirements','other_program_expenses'] loop
    execute format(
      'update public.%I r set created_by_user_id = u.id from public.users u where r.created_by_user_id is null and lower(coalesce(r."encodedBy", '''')) in (lower(coalesce(u."fullName", '''')), lower(coalesce(u.email, '''')), lower(coalesce(u.username, '''')))',
      v_table
    );
  end loop;
end $$;

-- IPO and Marketing are explicitly outside workflow; retire stale legacy badges/states.
update public.ipos set workflow_status = 'APPROVED' where workflow_status is distinct from 'APPROVED';
update public.marketing_partners set workflow_status = 'APPROVED' where workflow_status is distinct from 'APPROVED';

insert into public.workflow_assignments (submitter_user_id, approver_user_id, module)
select u.id, u.approver_id, module
from public.users u
cross join (values ('Subprojects'), ('Activities'), ('Program Management')) modules(module)
where u.requires_approver = true and u.approver_id is not null
on conflict (submitter_user_id, module) do update
set approver_user_id = excluded.approver_user_id, active = true, updated_at = now();

update public.workflow_settings
set default_administrator_id = coalesce(default_administrator_id, (
  select id from public.users where role = 'Administrator' and is_active = true order by id limit 1
))
where singleton = true;

create or replace function public.workflow_entity_module(p_entity_type text)
returns text
language sql
immutable
as $$
  select case p_entity_type
    when 'subprojects' then 'Subprojects'
    when 'activities' then 'Activities'
    when 'office_requirements' then 'Program Management'
    when 'staffing_requirements' then 'Program Management'
    when 'other_program_expenses' then 'Program Management'
    else null
  end;
$$;

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
    if v_status not in ('DRAFT', 'REJECTED') then raise exception 'Only Draft or Rejected records may be submitted'; end if;
    v_auto_approve := v_actor.role = 'Super Admin'
      or (v_actor.role = 'User' and v_policy.legacy_user_auto_approve_enabled
          and nullif(trim(v_policy.legacy_user_auto_approve_owner), '') is not null
          and v_policy.legacy_user_auto_approve_cutoff is not null
          and current_date <= v_policy.legacy_user_auto_approve_cutoff);
    v_new_status := case when v_auto_approve then 'APPROVED' else 'PENDING' end;
    v_event := case when p_transition = 'resubmit' then 'resubmit' else 'submit' end;
    perform set_config('app.workflow_transition', 'true', true);
    execute format('update %s set workflow_status = $1, submitted_at = now(), approved_at = case when $1 = ''APPROVED'' then now() else null end, approved_by_user_id = case when $1 = ''APPROVED'' then $2 else null end, approved_revision = case when $1 = ''APPROVED'' then revision_number else approved_revision end where id = $3', v_table)
    using v_new_status, v_actor.id, p_entity_id;
  elsif p_transition in ('approve', 'reject') then
    if v_status <> 'PENDING' then raise exception 'Only Pending records may be decided'; end if;
    if v_creator = v_actor.id then raise exception 'Self-approval is not allowed'; end if;
    if not public.current_user_has_access(v_module, 'approve', v_ou) then raise exception 'Approve permission is required'; end if;
    if v_actor.role <> 'Super Admin' then
      select * into v_assignment from public.workflow_assignments
      where submitter_user_id = v_creator and approver_user_id = v_actor.id and module = v_module and active = true;
      if v_assignment.id is null and exists (
        select 1 from public.workflow_settings ws
        where ws.singleton = true and ws.default_administrator_id = v_actor.id
      ) and not exists (
        select 1 from public.workflow_assignments wa
        where wa.submitter_user_id = v_creator and wa.module = v_module and wa.active = true
      ) then
        v_assignment.id := null;
      elsif v_assignment.id is null then
        raise exception 'Only the assigned approver may decide this record';
      end if;
    end if;
    if p_transition = 'reject' and nullif(trim(p_reason), '') is null then raise exception 'A rejection reason is required'; end if;
    v_new_status := case when p_transition = 'approve' then 'APPROVED' else 'REJECTED' end;
    v_event := p_transition;
    perform set_config('app.workflow_transition', 'true', true);
    execute format('update %s set workflow_status = $1, approved_at = case when $1 = ''APPROVED'' then now() else approved_at end, approved_by_user_id = case when $1 = ''APPROVED'' then $2 else approved_by_user_id end, approved_revision = case when $1 = ''APPROVED'' then revision_number else approved_revision end, rejected_at = case when $1 = ''REJECTED'' then now() else null end, rejected_by_user_id = case when $1 = ''REJECTED'' then $2 else null end where id = $3', v_table)
    using v_new_status, v_actor.id, p_entity_id;
  elsif p_transition = 'withdraw' then
    if v_status <> 'PENDING' or v_creator <> v_actor.id then raise exception 'Only the submitter may withdraw a Pending record'; end if;
    v_new_status := 'DRAFT';
    v_event := 'withdraw';
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
    jsonb_build_object('automatic_approval', v_auto_approve)
  );
  perform public.log_authorization_event(v_module, 'approve', p_entity_type, p_entity_id::text, v_ou, jsonb_build_object('workflow_status', v_status), jsonb_build_object('workflow_status', v_new_status), p_reason, 'allowed', jsonb_build_object('transition', p_transition));
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
begin
  select * into v_actor from public.users where auth_id = auth.uid() and is_active = true;
  if v_actor.id is null then raise exception 'Active authenticated profile required'; end if;
  v_module := public.workflow_entity_module(p_entity_type);
  if v_module is null then raise exception 'This entity does not use workflow'; end if;
  v_table := to_regclass('public.' || p_entity_type);
  execute format('select workflow_status, created_by_user_id, "operatingUnit", revision_number from %s where id = $1', v_table)
  into v_status, v_creator, v_ou, v_revision using p_entity_id;
  if not public.current_user_has_access(v_module, 'edit', v_ou) then raise exception 'Edit permission is required'; end if;
  if v_status = 'PENDING' and v_actor.role <> 'Super Admin' then raise exception 'Pending records are read-only'; end if;
  if v_status = 'APPROVED' and v_actor.role <> 'Super Admin' then
    perform set_config('app.workflow_transition', 'true', true);
    execute format('update %s set workflow_status = ''DRAFT'', revision_number = revision_number + 1 where id = $1', v_table) using p_entity_id;
    insert into public.workflow_events(entity_type, entity_id, module, event_type, previous_status, new_status, revision_number, actor_user_id, actor_role, reason)
    values (p_entity_type, p_entity_id, v_module, 'revision', v_status, 'DRAFT', coalesce(v_revision, 1) + 1, v_actor.id, v_actor.role, nullif(trim(p_reason), ''));
    return jsonb_build_object('workflow_status', 'DRAFT', 'revision_number', coalesce(v_revision, 1) + 1);
  end if;
  if v_actor.role = 'Super Admin' then
    insert into public.workflow_events(entity_type, entity_id, module, event_type, previous_status, new_status, revision_number, actor_user_id, actor_role, reason, metadata)
    values (p_entity_type, p_entity_id, v_module, 'override', v_status, v_status, coalesce(v_revision, 1), v_actor.id, v_actor.role, nullif(trim(p_reason), ''), jsonb_build_object('material_edit', true));
  end if;
  return jsonb_build_object('workflow_status', v_status, 'revision_number', coalesce(v_revision, 1));
end;
$$;

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
  v_allowed_values text[];
begin
  select * into v_actor from public.users where auth_id = auth.uid() and is_active = true;
  if v_actor.id is null then raise exception 'Active authenticated profile required'; end if;
  v_module := public.workflow_entity_module(p_entity_type);
  if v_module is null then raise exception 'Unsupported status entity'; end if;
  v_table := to_regclass('public.' || p_entity_type);
  v_column := case when p_entity_type = 'staffing_requirements' then 'hiringStatus' else 'status' end;
  v_allowed_values := case when p_entity_type = 'staffing_requirements'
    then array['Proposed','Filled','Unfilled']
    else array['Proposed','Ongoing','Completed','Cancelled'] end;
  if not (p_new_status = any(v_allowed_values)) then raise exception 'Invalid status transition target'; end if;
  execute format('select %I, "operatingUnit" from %s where id = $1', v_column, v_table) into v_old_status, v_ou using p_entity_id;
  if not public.current_user_has_access(v_module, 'manage_status', v_ou) then raise exception 'Manage Status permission is required'; end if;
  if v_actor.role <> 'Super Admin' and p_new_status in ('Cancelled', 'Unfilled') and nullif(trim(p_reason), '') is null then raise exception 'A reason is required'; end if;
  perform set_config('app.status_transition', 'true', true);
  execute format('update %s set %I = $1 where id = $2', v_table, v_column) using p_new_status, p_entity_id;
  perform public.log_authorization_event(v_module, 'manage_status', p_entity_type, p_entity_id::text, v_ou, jsonb_build_object('status', v_old_status), jsonb_build_object('status', p_new_status), p_reason, 'allowed', '{}'::jsonb);
  return jsonb_build_object('status', p_new_status);
end;
$$;

alter table public.workflow_settings enable row level security;
alter table public.workflow_assignments enable row level security;
alter table public.workflow_events enable row level security;

create policy workflow_settings_read on public.workflow_settings for select to authenticated using (public.current_user_has_access('Settings - Workflow', 'view'));
create policy workflow_settings_manage on public.workflow_settings for all to authenticated using (public.current_user_has_access('Settings - Workflow', 'manage_approver_assignments')) with check (public.current_user_has_access('Settings - Workflow', 'manage_approver_assignments'));
create policy workflow_assignments_read on public.workflow_assignments for select to authenticated using (
  submitter_user_id = (select id from public.users where auth_id = auth.uid())
  or approver_user_id = (select id from public.users where auth_id = auth.uid())
  or public.current_user_has_access('Settings - Workflow', 'manage_approver_assignments')
);
create policy workflow_assignments_manage on public.workflow_assignments for all to authenticated using (public.current_user_has_access('Settings - Workflow', 'manage_approver_assignments')) with check (public.current_user_has_access('Settings - Workflow', 'manage_approver_assignments'));
create policy workflow_events_read on public.workflow_events for select to authenticated using (public.current_user_has_access(module, 'view'));

grant select, insert, update, delete on public.workflow_settings to authenticated;
grant select, insert, update, delete on public.workflow_assignments to authenticated;
grant select on public.workflow_events to authenticated;
grant usage, select on sequence public.workflow_assignments_id_seq to authenticated;
grant usage, select on sequence public.workflow_events_id_seq to authenticated;
grant execute on function public.transition_workflow(text, bigint, text, text) to authenticated;
grant execute on function public.begin_workflow_revision(text, bigint, text) to authenticated;
grant execute on function public.transition_item_status(text, bigint, text, text) to authenticated;

commit;
