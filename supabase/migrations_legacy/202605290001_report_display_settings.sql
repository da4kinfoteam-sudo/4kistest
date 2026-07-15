-- Global report display controller settings
-- Author: 4K

create table if not exists public.report_display_settings (
  report_key text primary key,
  settings jsonb not null default '{}'::jsonb,
  updated_by bigint references public.users(id) on delete set null,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_report_display_settings_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists report_display_settings_set_updated_at on public.report_display_settings;
create trigger report_display_settings_set_updated_at
before update on public.report_display_settings
for each row execute function public.set_report_display_settings_updated_at();

alter table public.report_display_settings disable row level security;

grant select, insert, update, delete on table public.report_display_settings to anon, authenticated;
