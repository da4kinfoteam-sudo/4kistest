begin;

do $$
begin
  if exists (select 1 from public.users where is_active = true and auth_id is null) then
    raise exception 'Cannot remove legacy credentials while active users remain unlinked to Supabase Auth';
  end if;
  if exists (select 1 from public.users where auth_id is null) then
    raise exception 'All preserved application identities must be linked before Auth hardening';
  end if;
end $$;

alter table public.users alter column auth_id set not null;
create unique index if not exists users_auth_id_unique on public.users(auth_id);
alter table public.users drop column if exists password;

create or replace function public.prevent_append_only_event_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception '% is append-only', tg_table_name;
end;
$$;

drop trigger if exists prevent_authorization_audit_mutation on public.authorization_audit_events;
create trigger prevent_authorization_audit_mutation before update or delete on public.authorization_audit_events
for each row execute function public.prevent_append_only_event_mutation();

drop trigger if exists prevent_workflow_event_mutation on public.workflow_events;
create trigger prevent_workflow_event_mutation before update or delete on public.workflow_events
for each row execute function public.prevent_append_only_event_mutation();

revoke update, delete, truncate on public.authorization_audit_events from anon, authenticated;
revoke update, delete, truncate on public.workflow_events from anon, authenticated;

commit;
