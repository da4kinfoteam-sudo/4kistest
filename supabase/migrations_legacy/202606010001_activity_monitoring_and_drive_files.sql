-- Activity monitoring reports and Google Drive activity documentation
-- Author: 4K

alter table public.activities
add column if not exists reference_activity_id bigint references public.reference_activities(id) on delete set null;

create index if not exists activities_reference_activity_id_idx
on public.activities (reference_activity_id);

update public.activities a
set reference_activity_id = ra.id
from public.reference_activities ra
where a.reference_activity_id is null
  and ra.activity_name = 'Subproject Monitoring'
  and ra.component = 'Program Management'
  and ra.type = 'Activity'
  and a.name = ra.activity_name
  and a.component = ra.component
  and a.type = ra.type;

create table if not exists public.activity_monitoring_reports (
  id bigint primary key generated always as identity,
  activity_id bigint not null references public.activities(id) on delete cascade,
  ipo_id bigint not null references public.ipos(id) on delete cascade,
  status text not null default 'Pending' check (status in ('Pending', 'Ongoing', 'Completed')),
  findings text,
  issues text,
  recommendations text,
  reported_by bigint references public.users(id) on delete set null,
  reported_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by bigint references public.users(id) on delete set null,
  deleted_by_name text
);

create unique index if not exists activity_monitoring_reports_active_activity_ipo_idx
on public.activity_monitoring_reports (activity_id, ipo_id)
where deleted_at is null;

create index if not exists activity_monitoring_reports_activity_idx
on public.activity_monitoring_reports (activity_id, updated_at desc)
where deleted_at is null;

create index if not exists activity_monitoring_reports_ipo_idx
on public.activity_monitoring_reports (ipo_id, updated_at desc)
where deleted_at is null;

drop trigger if exists activity_monitoring_reports_set_updated_at on public.activity_monitoring_reports;
create trigger activity_monitoring_reports_set_updated_at
before update on public.activity_monitoring_reports
for each row execute function public.set_google_drive_updated_at();

create table if not exists public.activity_monitoring_actions (
  id bigint primary key generated always as identity,
  monitoring_report_id bigint not null references public.activity_monitoring_reports(id) on delete cascade,
  action_taken text not null,
  created_by bigint references public.users(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_by bigint references public.users(id) on delete set null,
  edited_by_name text,
  edited_at timestamptz,
  deleted_by bigint references public.users(id) on delete set null,
  deleted_by_name text,
  deleted_at timestamptz
);

create index if not exists activity_monitoring_actions_report_active_idx
on public.activity_monitoring_actions (monitoring_report_id, created_at desc)
where deleted_at is null;

drop trigger if exists activity_monitoring_actions_set_updated_at on public.activity_monitoring_actions;
create trigger activity_monitoring_actions_set_updated_at
before update on public.activity_monitoring_actions
for each row execute function public.set_google_drive_updated_at();

create table if not exists public.activity_drive_folders (
  id bigint primary key generated always as identity,
  activity_id bigint not null references public.activities(id) on delete cascade,
  connection_id uuid references public.google_drive_connections(id) on delete set null,
  folder_id text not null,
  folder_name text not null,
  module text not null default 'Activities',
  folder_year integer not null,
  operating_unit text not null,
  component text not null,
  activity_name text not null,
  activity_type text,
  module_folder_id text,
  year_folder_id text,
  operating_unit_folder_id text,
  component_folder_id text,
  created_by bigint references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists activity_drive_folders_activity_module_year_idx
on public.activity_drive_folders (activity_id, module, folder_year);

create index if not exists activity_drive_folders_folder_id_idx
on public.activity_drive_folders (folder_id);

create index if not exists activity_drive_folders_year_ou_idx
on public.activity_drive_folders (folder_year, operating_unit);

drop trigger if exists activity_drive_folders_set_updated_at on public.activity_drive_folders;
create trigger activity_drive_folders_set_updated_at
before update on public.activity_drive_folders
for each row execute function public.set_google_drive_updated_at();

create table if not exists public.activity_drive_files (
  id bigint primary key generated always as identity,
  activity_id bigint not null references public.activities(id) on delete cascade,
  connection_id uuid references public.google_drive_connections(id) on delete set null,
  folder_id text not null,
  folder_name text not null,
  module text not null default 'Activities',
  folder_year integer not null,
  operating_unit text not null,
  component text not null,
  activity_name text not null,
  activity_type text,
  module_folder_id text,
  year_folder_id text,
  operating_unit_folder_id text,
  component_folder_id text,
  file_id text not null,
  file_name text not null,
  mime_type text,
  file_size bigint,
  web_view_link text,
  web_content_link text,
  preview_url text,
  preview_supported boolean not null default false,
  preview_permission_id text,
  preview_permission_type text,
  uploaded_by bigint references public.users(id) on delete set null,
  uploaded_by_name text,
  uploaded_at timestamptz not null default now(),
  deleted_by bigint references public.users(id) on delete set null,
  deleted_by_name text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists activity_drive_files_file_id_idx
on public.activity_drive_files (file_id);

create index if not exists activity_drive_files_activity_active_idx
on public.activity_drive_files (activity_id, uploaded_at desc)
where deleted_at is null;

create index if not exists activity_drive_files_activity_year_active_idx
on public.activity_drive_files (activity_id, folder_year, uploaded_at desc)
where deleted_at is null;

drop trigger if exists activity_drive_files_set_updated_at on public.activity_drive_files;
create trigger activity_drive_files_set_updated_at
before update on public.activity_drive_files
for each row execute function public.set_google_drive_updated_at();

alter table public.activity_monitoring_reports disable row level security;
alter table public.activity_monitoring_actions disable row level security;
alter table public.activity_drive_folders disable row level security;
alter table public.activity_drive_files disable row level security;

revoke all on table public.activity_drive_folders from anon, authenticated;
revoke all on table public.activity_drive_files from anon, authenticated;

grant all on table public.activity_monitoring_reports to anon, authenticated;
grant all on table public.activity_monitoring_actions to anon, authenticated;
grant all on table public.activity_monitoring_reports to service_role;
grant all on table public.activity_monitoring_actions to service_role;
grant all on table public.activity_drive_folders to service_role;
grant all on table public.activity_drive_files to service_role;

revoke all on sequence public.activity_drive_folders_id_seq from anon, authenticated;
revoke all on sequence public.activity_drive_files_id_seq from anon, authenticated;

grant usage, select on sequence public.activity_monitoring_reports_id_seq to anon, authenticated;
grant usage, select on sequence public.activity_monitoring_actions_id_seq to anon, authenticated;
grant usage, select on sequence public.activity_monitoring_reports_id_seq to service_role;
grant usage, select on sequence public.activity_monitoring_actions_id_seq to service_role;
grant usage, select on sequence public.activity_drive_folders_id_seq to service_role;
grant usage, select on sequence public.activity_drive_files_id_seq to service_role;
