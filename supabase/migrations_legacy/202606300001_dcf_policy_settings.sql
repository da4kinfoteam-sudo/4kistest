-- DCF status editing policy and accomplishment period lock controller
-- Author: 4K

create table if not exists public.dcf_policy_settings (
  settings_key text primary key,
  settings jsonb not null default '{}'::jsonb,
  updated_by bigint references public.users(id) on delete set null,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_dcf_policy_settings_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists dcf_policy_settings_set_updated_at on public.dcf_policy_settings;
create trigger dcf_policy_settings_set_updated_at
before update on public.dcf_policy_settings
for each row execute function public.set_dcf_policy_settings_updated_at();

create or replace function public.get_app_current_date()
returns date
language sql
stable
as $$
  select (now() at time zone 'Asia/Manila')::date;
$$;

alter table public.dcf_policy_settings disable row level security;

grant select, insert, update, delete on table public.dcf_policy_settings to anon, authenticated;
grant execute on function public.get_app_current_date() to anon, authenticated;
