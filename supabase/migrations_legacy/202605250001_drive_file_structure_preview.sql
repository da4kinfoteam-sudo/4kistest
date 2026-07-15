-- Additive Google Drive IPO file structure and preview metadata
-- Author: 4K

alter table public.ipo_drive_folders
add column if not exists module text not null default 'IPO Management',
add column if not exists folder_year integer,
add column if not exists module_folder_id text,
add column if not exists year_folder_id text;

alter table public.ipo_drive_files
add column if not exists module text not null default 'IPO Management',
add column if not exists folder_year integer,
add column if not exists module_folder_id text,
add column if not exists year_folder_id text,
add column if not exists preview_url text,
add column if not exists preview_supported boolean not null default false,
add column if not exists preview_permission_id text,
add column if not exists preview_permission_type text;

drop index if exists public.ipo_drive_folders_ipo_id_idx;

create unique index if not exists ipo_drive_folders_ipo_module_year_idx
on public.ipo_drive_folders (ipo_id, module, folder_year)
where folder_year is not null;

create unique index if not exists ipo_drive_folders_ipo_legacy_idx
on public.ipo_drive_folders (ipo_id)
where folder_year is null;

create index if not exists ipo_drive_folders_year_folder_id_idx
on public.ipo_drive_folders (year_folder_id);

create index if not exists ipo_drive_files_ipo_year_active_idx
on public.ipo_drive_files (ipo_id, folder_year, uploaded_at desc)
where deleted_at is null;
