begin;

alter table public.users add column if not exists is_active boolean not null default true;
alter table public.users add column if not exists deactivated_at timestamptz;
alter table public.users add column if not exists permission_version bigint not null default 1;
alter table public.users add column if not exists password_reset_required boolean not null default true;

create table if not exists public.authorization_policy (
  singleton boolean primary key default true check (singleton),
  policy_version bigint not null default 1,
  legacy_user_auto_approve_enabled boolean not null default true,
  legacy_user_auto_approve_owner text,
  legacy_user_auto_approve_cutoff date,
  updated_at timestamptz not null default now(),
  updated_by bigint references public.users(id)
);

insert into public.authorization_policy (singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists public.authorization_role_rules (
  role text not null,
  module text not null,
  action text not null,
  allowed boolean not null default false,
  visibility_scope text not null default 'Own OU' check (visibility_scope in ('All OUs', 'Own OU')),
  updated_at timestamptz not null default now(),
  updated_by bigint references public.users(id),
  primary key (role, module, action)
);

create table if not exists public.authorization_user_rules (
  user_id bigint not null references public.users(id) on delete cascade,
  module text not null,
  action text not null,
  effect text not null check (effect in ('allow', 'deny')),
  updated_at timestamptz not null default now(),
  updated_by bigint references public.users(id),
  primary key (user_id, module, action)
);

create table if not exists public.authorization_user_scopes (
  user_id bigint not null references public.users(id) on delete cascade,
  module text not null,
  visibility_scope text not null check (visibility_scope in ('All OUs', 'Own OU')),
  updated_at timestamptz not null default now(),
  updated_by bigint references public.users(id),
  primary key (user_id, module)
);

create table if not exists public.authorization_audit_events (
  id bigint generated always as identity primary key,
  actor_user_id bigint references public.users(id),
  actor_auth_id uuid,
  actor_role text,
  module text not null,
  action text not null,
  target_type text,
  target_id text,
  operating_unit text,
  before_state jsonb,
  after_state jsonb,
  reason text,
  policy_version bigint not null default 0,
  outcome text not null check (outcome in ('allowed', 'denied', 'failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists authorization_audit_actor_idx on public.authorization_audit_events(actor_user_id, created_at desc);
create index if not exists authorization_audit_target_idx on public.authorization_audit_events(target_type, target_id, created_at desc);

create or replace function public.bump_authorization_policy_version()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.authorization_policy
  set policy_version = policy_version + 1,
      updated_at = now(),
      updated_by = coalesce((select id from public.users where auth_id = auth.uid()), updated_by)
  where singleton = true;
  return null;
end;
$$;

drop trigger if exists authorization_role_rules_version on public.authorization_role_rules;
create trigger authorization_role_rules_version
after insert or update or delete on public.authorization_role_rules
for each statement execute function public.bump_authorization_policy_version();

drop trigger if exists authorization_user_rules_version on public.authorization_user_rules;
create trigger authorization_user_rules_version
after insert or update or delete on public.authorization_user_rules
for each statement execute function public.bump_authorization_policy_version();

drop trigger if exists authorization_user_scopes_version on public.authorization_user_scopes;
create trigger authorization_user_scopes_version
after insert or update or delete on public.authorization_user_scopes
for each statement execute function public.bump_authorization_policy_version();

create or replace function public.resolve_login_identifier(p_identifier text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select email
  from public.users
  where is_active = true
    and (lower(username) = lower(trim(p_identifier)) or lower(email) = lower(trim(p_identifier)))
    and auth_id is not null
  limit 1;
$$;

create or replace function public.resolve_access_for_user(
  p_user_id bigint,
  p_module text,
  p_action text,
  p_record_ou text default null
)
returns table (
  allowed boolean,
  decision_source text,
  decision_reason text,
  visibility_scope text,
  policy_version bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user public.users%rowtype;
  v_user_effect text;
  v_role_allowed boolean;
  v_view_effect text;
  v_view_allowed boolean;
  v_scope text;
  v_version bigint;
begin
  select * into v_user from public.users where id = p_user_id;
  select ap.policy_version into v_version from public.authorization_policy ap where ap.singleton = true;
  v_version := coalesce(v_version, 0);

  if v_user.id is null then
    return query select false, 'unauthenticated', 'No linked application profile.', 'Own OU', v_version;
    return;
  end if;
  if not coalesce(v_user.is_active, false) then
    return query select false, 'inactive_account', 'The account is inactive.', 'Own OU', v_version;
    return;
  end if;
  if v_user.role = 'Super Admin' then
    return query select true, 'super_admin_invariant', 'Protected Super Admin allow-all invariant.', 'All OUs', v_version;
    return;
  end if;

  select aus.visibility_scope into v_scope
  from public.authorization_user_scopes aus
  where aus.user_id = v_user.id and aus.module = p_module;
  v_scope := coalesce(v_scope, v_user.visibility_scope, (
    select arr.visibility_scope from public.authorization_role_rules arr
    where arr.role = v_user.role and arr.module = p_module
    order by case when arr.action = p_action then 0 else 1 end
    limit 1
  ), 'Own OU');

  if v_user.role in ('Management', 'Guest')
     and p_action not in ('view', 'export', 'view_files', 'view_monitoring') then
    return query select false, 'protected_read_only_ceiling', v_user.role || ' is a protected read-only role.', v_scope, v_version;
    return;
  end if;

  if p_action <> 'view' then
    select aur.effect into v_view_effect
    from public.authorization_user_rules aur
    where aur.user_id = v_user.id and aur.module = p_module and aur.action = 'view';
    if v_view_effect is not null then
      v_view_allowed := v_view_effect = 'allow';
    else
      select arr.allowed into v_view_allowed
      from public.authorization_role_rules arr
      where arr.role = v_user.role and arr.module = p_module and arr.action = 'view';
    end if;
    if not coalesce(v_view_allowed, false) then
      return query select false,
        case when v_view_effect is not null then 'user_override' else 'view_required' end,
        case when v_view_effect = 'deny' then 'Explicit user view deny overrides ordinary actions.' else 'Page view access is required for this action.' end,
        v_scope,
        v_version;
      return;
    end if;
  end if;

  select aur.effect into v_user_effect
  from public.authorization_user_rules aur
  where aur.user_id = v_user.id and aur.module = p_module and aur.action = p_action;

  if v_user_effect is not null then
    if v_user_effect = 'deny' then
      return query select false, 'user_override', 'Explicit user deny override.', v_scope, v_version;
      return;
    end if;
    v_role_allowed := true;
  else
    select arr.allowed into v_role_allowed
    from public.authorization_role_rules arr
    where arr.role = v_user.role and arr.module = p_module and arr.action = p_action;
    if v_role_allowed is null then
      return query select false, 'missing_policy', 'No matching policy; access fails closed.', v_scope, v_version;
      return;
    end if;
    if not v_role_allowed then
      return query select false, 'role_default', 'Inherited role deny.', v_scope, v_version;
      return;
    end if;
  end if;

  if v_scope = 'Own OU' and p_record_ou is not null and p_record_ou <> v_user."operatingUnit" then
    return query select false, 'scope_denied', 'The record is outside the account operating unit.', v_scope, v_version;
    return;
  end if;

  return query select true,
    case when v_user_effect = 'allow' then 'user_override' else 'role_default' end,
    case when v_user_effect = 'allow' then 'Explicit user allow override.' else 'Inherited role allow.' end,
    v_scope,
    v_version;
end;
$$;

create or replace function public.current_user_has_access(
  p_module text,
  p_action text,
  p_record_ou text default null
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select r.allowed
    from public.resolve_access_for_user(
      (select u.id from public.users u where u.auth_id = auth.uid() limit 1),
      p_module,
      p_action,
      p_record_ou
    ) r
    limit 1
  ), false);
$$;

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
begin
  select * into v_actor from public.users where auth_id = auth.uid() and is_active = true;
  if v_actor.id is null then raise exception 'Active authenticated application profile required'; end if;
  if p_outcome = 'allowed' and not public.current_user_has_access(p_module, p_action, p_operating_unit) then
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

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing_id bigint;
begin
  update public.users
  set auth_id = new.id,
      email = coalesce(new.email, email),
      password_reset_required = false,
      updated_at = now()
  where auth_id is null and lower(email) = lower(new.email)
  returning id into v_existing_id;

  if v_existing_id is null then
    insert into public.users (
      auth_id, email, "fullName", username, role, "operatingUnit", visibility_scope,
      is_active, password_reset_required
    ) values (
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data->>'full_name', 'New Auth User'),
      coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
      coalesce(new.raw_user_meta_data->>'role', 'User'),
      coalesce(new.raw_user_meta_data->>'operatingUnit', 'NPMO'),
      'Own OU',
      true,
      false
    );
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

with modules(module) as (
  values
    ('Home'), ('Profile'), ('Dashboards'), ('Reports'), ('Subprojects'), ('Activities'),
    ('Program Management'), ('Accomplishment - Financial'), ('Accomplishment - Physical'),
    ('IPO Management'), ('Marketing Database'), ('Level of Development'),
    ('Gender and Development'), ('Commodity Mapping'), ('References'), ('System Management'),
    ('Settings - User Management'), ('Settings - Access Control'), ('Settings - Data Scope'),
    ('Settings - Workflow'), ('Settings - DCF and Status'), ('Settings - Physical Accomplishment'),
    ('Settings - Financial Accomplishment'), ('Settings - System'),
    ('Settings - Audit and Security'), ('Settings - Google Drive'), ('Settings - LOD'), ('Settings - Archive')
), actions(action) as (
  values
    ('view'), ('create'), ('edit'), ('delete'), ('import'), ('clone'), ('export'), ('approve'),
    ('manage_status'), ('view_monitoring'), ('manage_monitoring'), ('add_monitoring_action'),
    ('delete_monitoring_action'), ('view_files'), ('upload_files'), ('delete_files'),
    ('edit_physical_target'), ('edit_physical_actual'), ('edit_financial_actual'),
    ('delete_financial_actual'), ('override_physical_lock'), ('override_financial_lock'),
    ('override_period'), ('manage_users'), ('manage_roles'), ('manage_permissions'),
    ('manage_approver_assignments'), ('manage_user_scopes'), ('manage_user_overrides'),
    ('manage_super_admins'), ('manage_settings')
), roles(role) as (
  values ('Super Admin'), ('Administrator'), ('Management'), ('Focal - User'), ('RFO - User'), ('User'), ('Guest')
), matrix as (
  select roles.role, modules.module, actions.action,
    case
      when roles.role = 'Super Admin' then true
      when modules.module = 'Profile' and actions.action = 'view' then true
      when modules.module = 'Profile' and actions.action = 'edit' and roles.role not in ('Management', 'Guest') then true
      when roles.role = 'Administrator' and actions.action <> 'manage_super_admins' then true
      when roles.role = 'Management' and actions.action in ('view', 'export', 'view_files', 'view_monitoring')
        and modules.module not like 'Settings - %' then true
      when roles.role = 'Guest' and actions.action = 'view'
        and modules.module in ('Home', 'Dashboards', 'Reports', 'Commodity Mapping') then true
      when roles.role in ('Focal - User', 'RFO - User', 'User') and actions.action = 'view' then
        coalesce((select rc.can_view from public.roles_config rc where rc.role = roles.role and rc.module = modules.module), modules.module = 'Home')
      when roles.role in ('Focal - User', 'RFO - User', 'User') and actions.action in (
        'create', 'edit', 'import', 'clone', 'manage_status', 'manage_monitoring',
        'add_monitoring_action', 'upload_files', 'edit_physical_target',
        'edit_physical_actual', 'edit_financial_actual'
      ) then coalesce((select rc.can_edit from public.roles_config rc where rc.role = roles.role and rc.module = modules.module), false)
      when roles.role in ('Focal - User', 'RFO - User', 'User') and actions.action in ('delete', 'delete_files', 'delete_financial_actual', 'delete_monitoring_action') then
        coalesce((select rc.can_delete from public.roles_config rc where rc.role = roles.role and rc.module = modules.module), false)
      when roles.role in ('Focal - User', 'RFO - User', 'User') and actions.action in ('export', 'view_files', 'view_monitoring') then
        coalesce((select rc.can_view from public.roles_config rc where rc.role = roles.role and rc.module = modules.module), false)
      else false
    end as allowed,
    case
      when roles.role in ('Super Admin', 'Administrator', 'Management') then 'All OUs'
      else coalesce((select rc.visibility_scope from public.roles_config rc where rc.role = roles.role and rc.module = modules.module), 'Own OU')
    end as visibility_scope
  from roles cross join modules cross join actions
)
insert into public.authorization_role_rules (role, module, action, allowed, visibility_scope)
select role, module, action, allowed, visibility_scope from matrix
on conflict (role, module, action) do nothing;

insert into public.authorization_user_scopes (user_id, module, visibility_scope)
select u.id, m.module, coalesce(u.visibility_scope, 'Own OU')
from public.users u
cross join (select distinct module from public.authorization_role_rules) m
on conflict (user_id, module) do nothing;

insert into public.authorization_user_rules (user_id, module, action, effect)
select u.id,
       module_entry.key,
       case permission_entry.key
         when 'can_view' then 'view'
         when 'can_edit' then 'edit'
         when 'can_delete' then 'delete'
         when 'can_manage' then 'manage_settings'
       end,
       case when permission_entry.value::text = 'true' then 'allow' else 'deny' end
from public.users u
cross join lateral jsonb_each(coalesce(u.permissions_override, '{}'::jsonb)) module_entry
cross join lateral jsonb_each(module_entry.value) permission_entry
where permission_entry.key in ('can_view', 'can_edit', 'can_delete', 'can_manage')
on conflict (user_id, module, action) do update set effect = excluded.effect;

alter table public.authorization_policy enable row level security;
alter table public.authorization_role_rules enable row level security;
alter table public.authorization_user_rules enable row level security;
alter table public.authorization_user_scopes enable row level security;
alter table public.authorization_audit_events enable row level security;
alter table public.users enable row level security;

drop policy if exists authorization_policy_read on public.authorization_policy;
create policy authorization_policy_read on public.authorization_policy for select to authenticated using (true);
drop policy if exists authorization_policy_manage on public.authorization_policy;
create policy authorization_policy_manage on public.authorization_policy for update to authenticated
using (public.current_user_has_access('Settings - Access Control', 'manage_permissions'))
with check (public.current_user_has_access('Settings - Access Control', 'manage_permissions'));

drop policy if exists authorization_role_rules_read on public.authorization_role_rules;
create policy authorization_role_rules_read on public.authorization_role_rules for select to authenticated using (true);
drop policy if exists authorization_role_rules_manage on public.authorization_role_rules;
create policy authorization_role_rules_manage on public.authorization_role_rules for all to authenticated
using (public.current_user_has_access('Settings - Access Control', 'manage_roles'))
with check (public.current_user_has_access('Settings - Access Control', 'manage_roles'));

drop policy if exists authorization_user_rules_read on public.authorization_user_rules;
create policy authorization_user_rules_read on public.authorization_user_rules for select to authenticated
using (user_id = (select id from public.users where auth_id = auth.uid())
  or public.current_user_has_access('Settings - Access Control', 'manage_user_overrides'));
drop policy if exists authorization_user_rules_manage on public.authorization_user_rules;
create policy authorization_user_rules_manage on public.authorization_user_rules for all to authenticated
using (public.current_user_has_access('Settings - Access Control', 'manage_user_overrides'))
with check (public.current_user_has_access('Settings - Access Control', 'manage_user_overrides'));

drop policy if exists authorization_user_scopes_read on public.authorization_user_scopes;
create policy authorization_user_scopes_read on public.authorization_user_scopes for select to authenticated
using (user_id = (select id from public.users where auth_id = auth.uid())
  or public.current_user_has_access('Settings - Data Scope', 'manage_user_scopes'));
drop policy if exists authorization_user_scopes_manage on public.authorization_user_scopes;
create policy authorization_user_scopes_manage on public.authorization_user_scopes for all to authenticated
using (public.current_user_has_access('Settings - Data Scope', 'manage_user_scopes'))
with check (public.current_user_has_access('Settings - Data Scope', 'manage_user_scopes'));

drop policy if exists authorization_audit_read on public.authorization_audit_events;
create policy authorization_audit_read on public.authorization_audit_events for select to authenticated
using (public.current_user_has_access('Settings - Audit and Security', 'view'));

drop policy if exists users_self_or_authorized_read on public.users;
create policy users_self_or_authorized_read on public.users for select to authenticated
using (auth_id = auth.uid() or public.current_user_has_access('Settings - User Management', 'manage_users'));

drop policy if exists "Allow anonymous to check users count" on public.users;
drop policy if exists "Enable read access for all users" on public.users;
drop policy if exists "Public Access Users" on public.users;

revoke all on public.users from anon;
revoke all on public.authorization_policy from anon;
revoke all on public.authorization_role_rules from anon;
revoke all on public.authorization_user_rules from anon;
revoke all on public.authorization_user_scopes from anon;
revoke all on public.authorization_audit_events from anon;
grant select on public.users to authenticated;
grant select, update on public.authorization_policy to authenticated;
grant select, insert, update, delete on public.authorization_role_rules to authenticated;
grant select, insert, update, delete on public.authorization_user_rules to authenticated;
grant select, insert, update, delete on public.authorization_user_scopes to authenticated;
grant select on public.authorization_audit_events to authenticated;
grant usage, select on sequence public.authorization_audit_events_id_seq to authenticated;

revoke all on function public.resolve_login_identifier(text) from public;
grant execute on function public.resolve_login_identifier(text) to anon, authenticated;
revoke all on function public.resolve_access_for_user(bigint, text, text, text) from public;
grant execute on function public.resolve_access_for_user(bigint, text, text, text) to authenticated;
revoke all on function public.current_user_has_access(text, text, text) from public;
grant execute on function public.current_user_has_access(text, text, text) to authenticated;
revoke all on function public.log_authorization_event(text, text, text, text, text, jsonb, jsonb, text, text, jsonb) from public;
grant execute on function public.log_authorization_event(text, text, text, text, text, jsonb, jsonb, text, text, jsonb) to authenticated;

commit;
