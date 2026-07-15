-- Additive Google Drive IPO operating unit folder metadata
-- Author: 4K

alter table public.ipo_drive_folders
add column if not exists operating_unit text,
add column if not exists operating_unit_folder_id text;

alter table public.ipo_drive_files
add column if not exists operating_unit text,
add column if not exists operating_unit_folder_id text;

drop index if exists public.ipo_drive_folders_ipo_module_year_idx;

create unique index if not exists ipo_drive_folders_ipo_module_year_ou_idx
on public.ipo_drive_folders (ipo_id, module, folder_year, operating_unit)
where folder_year is not null and operating_unit is not null;

create unique index if not exists ipo_drive_folders_ipo_module_year_legacy_idx
on public.ipo_drive_folders (ipo_id, module, folder_year)
where folder_year is not null and operating_unit is null;

create index if not exists ipo_drive_folders_operating_unit_folder_id_idx
on public.ipo_drive_folders (operating_unit_folder_id);

create index if not exists ipo_drive_files_ipo_year_ou_active_idx
on public.ipo_drive_files (ipo_id, folder_year, operating_unit, uploaded_at desc)
where deleted_at is null;
