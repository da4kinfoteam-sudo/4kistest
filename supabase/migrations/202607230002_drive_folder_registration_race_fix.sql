-- Make Drive folder mappings connection-aware and provide short-lived
-- initialization locks. This migration does not move or rewrite Drive data.

alter table public.ipo_drive_folders
add column if not exists gallery_folder_id text,
add column if not exists files_folder_id text;

alter table public.subproject_drive_folders
add column if not exists gallery_folder_id text,
add column if not exists files_folder_id text;

alter table public.activity_drive_folders
add column if not exists gallery_folder_id text,
add column if not exists files_folder_id text;

create table if not exists public.drive_folder_initialization_locks (
  lock_key text primary key,
  owner_token uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists drive_folder_initialization_locks_expires_idx
on public.drive_folder_initialization_locks (expires_at);

alter table public.drive_folder_initialization_locks disable row level security;
revoke all on table public.drive_folder_initialization_locks from anon, authenticated;
grant all on table public.drive_folder_initialization_locks to service_role;

-- Create the replacement indexes before dropping the previous stricter
-- indexes. Existing data must satisfy both definitions for this migration
-- to continue.

create unique index if not exists ipo_drive_folders_ipo_connection_module_year_ou_idx
on public.ipo_drive_folders (
  ipo_id,
  connection_id,
  module,
  folder_year,
  operating_unit
)
where folder_year is not null
  and operating_unit is not null;

create unique index if not exists ipo_drive_folders_ipo_connection_module_year_no_ou_idx
on public.ipo_drive_folders (
  ipo_id,
  connection_id,
  module,
  folder_year
)
where folder_year is not null
  and operating_unit is null;

create unique index if not exists ipo_drive_folders_ipo_connection_legacy_idx
on public.ipo_drive_folders (ipo_id, connection_id)
where folder_year is null;

create unique index if not exists subproject_drive_folders_subproject_connection_module_year_idx
on public.subproject_drive_folders (
  subproject_id,
  connection_id,
  module,
  folder_year
);

create unique index if not exists activity_drive_folders_activity_connection_module_year_idx
on public.activity_drive_folders (
  activity_id,
  connection_id,
  module,
  folder_year
);

drop index if exists public.ipo_drive_folders_ipo_module_year_ou_idx;
drop index if exists public.ipo_drive_folders_ipo_module_year_legacy_idx;
drop index if exists public.ipo_drive_folders_ipo_legacy_idx;
drop index if exists public.subproject_drive_folders_subproject_module_year_idx;
drop index if exists public.activity_drive_folders_activity_module_year_idx;
