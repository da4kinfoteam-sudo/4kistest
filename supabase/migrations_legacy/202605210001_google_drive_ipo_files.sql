-- Phase 11: Google Drive IPO file storage
-- Author: 4K

create extension if not exists pgcrypto;

create or replace function public.set_google_drive_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table if not exists public.google_drive_connections (
  id uuid primary key default gen_random_uuid(),
  connected_by bigint references public.users(id) on delete set null,
  google_account_email text not null,
  encrypted_refresh_token text not null,
  scopes text[] not null default '{}',
  root_folder_id text,
  root_folder_name text not null default '4KIS Master File Storage',
  status text not null default 'active' check (status in ('active', 'disconnected')),
  connected_at timestamptz not null default now(),
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists google_drive_connections_single_active_idx
on public.google_drive_connections ((status))
where status = 'active';

drop trigger if exists google_drive_connections_set_updated_at on public.google_drive_connections;
create trigger google_drive_connections_set_updated_at
before update on public.google_drive_connections
for each row execute function public.set_google_drive_updated_at();

create table if not exists public.ipo_drive_folders (
  id bigint primary key generated always as identity,
  ipo_id bigint not null references public.ipos(id) on delete cascade,
  connection_id uuid references public.google_drive_connections(id) on delete set null,
  folder_id text not null,
  folder_name text not null,
  created_by bigint references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ipo_drive_folders_ipo_id_idx
on public.ipo_drive_folders (ipo_id);

create index if not exists ipo_drive_folders_folder_id_idx
on public.ipo_drive_folders (folder_id);

drop trigger if exists ipo_drive_folders_set_updated_at on public.ipo_drive_folders;
create trigger ipo_drive_folders_set_updated_at
before update on public.ipo_drive_folders
for each row execute function public.set_google_drive_updated_at();

create table if not exists public.ipo_drive_files (
  id bigint primary key generated always as identity,
  ipo_id bigint not null references public.ipos(id) on delete cascade,
  connection_id uuid references public.google_drive_connections(id) on delete set null,
  folder_id text not null,
  file_id text not null,
  file_name text not null,
  mime_type text,
  file_size bigint,
  web_view_link text,
  web_content_link text,
  uploaded_by bigint references public.users(id) on delete set null,
  uploaded_by_name text,
  uploaded_at timestamptz not null default now(),
  deleted_by bigint references public.users(id) on delete set null,
  deleted_by_name text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ipo_drive_files_file_id_idx
on public.ipo_drive_files (file_id);

create index if not exists ipo_drive_files_ipo_active_idx
on public.ipo_drive_files (ipo_id, uploaded_at desc)
where deleted_at is null;

drop trigger if exists ipo_drive_files_set_updated_at on public.ipo_drive_files;
create trigger ipo_drive_files_set_updated_at
before update on public.ipo_drive_files
for each row execute function public.set_google_drive_updated_at();

alter table public.google_drive_connections disable row level security;
alter table public.ipo_drive_folders disable row level security;
alter table public.ipo_drive_files disable row level security;

revoke all on table public.google_drive_connections from anon, authenticated;
revoke all on table public.ipo_drive_folders from anon, authenticated;
revoke all on table public.ipo_drive_files from anon, authenticated;

grant all on table public.google_drive_connections to service_role;
grant all on table public.ipo_drive_folders to service_role;
grant all on table public.ipo_drive_files to service_role;

revoke all on sequence public.ipo_drive_folders_id_seq from anon, authenticated;
revoke all on sequence public.ipo_drive_files_id_seq from anon, authenticated;

grant usage, select on sequence public.ipo_drive_folders_id_seq to service_role;
grant usage, select on sequence public.ipo_drive_files_id_seq to service_role;
