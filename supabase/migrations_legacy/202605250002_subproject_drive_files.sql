-- Additive Google Drive Subproject documentation storage
-- Author: 4K

create table if not exists public.subproject_drive_folders (
  id bigint primary key generated always as identity,
  subproject_id bigint not null references public.subprojects(id) on delete cascade,
  connection_id uuid references public.google_drive_connections(id) on delete set null,
  folder_id text not null,
  folder_name text not null,
  module text not null default 'Subprojects',
  folder_year integer not null,
  operating_unit text not null,
  ipo_name text not null,
  subproject_name text not null,
  module_folder_id text,
  year_folder_id text,
  operating_unit_folder_id text,
  ipo_folder_id text,
  created_by bigint references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists subproject_drive_folders_subproject_module_year_idx
on public.subproject_drive_folders (subproject_id, module, folder_year);

create index if not exists subproject_drive_folders_folder_id_idx
on public.subproject_drive_folders (folder_id);

create index if not exists subproject_drive_folders_year_ou_idx
on public.subproject_drive_folders (folder_year, operating_unit);

drop trigger if exists subproject_drive_folders_set_updated_at on public.subproject_drive_folders;
create trigger subproject_drive_folders_set_updated_at
before update on public.subproject_drive_folders
for each row execute function public.set_google_drive_updated_at();

create table if not exists public.subproject_drive_files (
  id bigint primary key generated always as identity,
  subproject_id bigint not null references public.subprojects(id) on delete cascade,
  connection_id uuid references public.google_drive_connections(id) on delete set null,
  folder_id text not null,
  folder_name text not null,
  module text not null default 'Subprojects',
  folder_year integer not null,
  operating_unit text not null,
  ipo_name text not null,
  subproject_name text not null,
  module_folder_id text,
  year_folder_id text,
  operating_unit_folder_id text,
  ipo_folder_id text,
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

create unique index if not exists subproject_drive_files_file_id_idx
on public.subproject_drive_files (file_id);

create index if not exists subproject_drive_files_subproject_active_idx
on public.subproject_drive_files (subproject_id, uploaded_at desc)
where deleted_at is null;

create index if not exists subproject_drive_files_subproject_year_active_idx
on public.subproject_drive_files (subproject_id, folder_year, uploaded_at desc)
where deleted_at is null;

drop trigger if exists subproject_drive_files_set_updated_at on public.subproject_drive_files;
create trigger subproject_drive_files_set_updated_at
before update on public.subproject_drive_files
for each row execute function public.set_google_drive_updated_at();

alter table public.subproject_drive_folders disable row level security;
alter table public.subproject_drive_files disable row level security;

revoke all on table public.subproject_drive_folders from anon, authenticated;
revoke all on table public.subproject_drive_files from anon, authenticated;

grant all on table public.subproject_drive_folders to service_role;
grant all on table public.subproject_drive_files to service_role;

revoke all on sequence public.subproject_drive_folders_id_seq from anon, authenticated;
revoke all on sequence public.subproject_drive_files_id_seq from anon, authenticated;

grant usage, select on sequence public.subproject_drive_folders_id_seq to service_role;
grant usage, select on sequence public.subproject_drive_files_id_seq to service_role;
