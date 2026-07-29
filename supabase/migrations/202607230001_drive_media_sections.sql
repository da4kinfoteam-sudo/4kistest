-- Separate Gallery uploads from general Files uploads while preserving all
-- existing Google Drive objects in place.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'ipo_drive_files',
    'subproject_drive_files',
    'activity_drive_files'
  ] loop
    execute format(
      'alter table public.%I
         add column if not exists upload_section text,
         add column if not exists display_name text,
         add column if not exists caption text',
      table_name
    );

    execute format(
      'update public.%I
          set upload_section = case
            when lower(coalesce(mime_type, '''')) like ''image/%%''
              or lower(file_name) ~ ''\.(gif|jpe?g|png|webp)$''
            then ''gallery''
            else ''files''
          end
        where upload_section is null
           or upload_section not in (''gallery'', ''files'')',
      table_name
    );

    execute format(
      'alter table public.%I
         alter column upload_section set default ''files'',
         alter column upload_section set not null',
      table_name
    );

    if not exists (
      select 1
      from pg_constraint
      where conname = table_name || '_upload_section_check'
        and conrelid = ('public.' || table_name)::regclass
    ) then
      execute format(
        'alter table public.%I
           add constraint %I check (upload_section in (''gallery'', ''files''))',
        table_name,
        table_name || '_upload_section_check'
      );
    end if;
  end loop;
end
$$;

create index if not exists ipo_drive_files_section_active_idx
on public.ipo_drive_files (ipo_id, upload_section, uploaded_at desc)
where deleted_at is null;

create index if not exists subproject_drive_files_section_active_idx
on public.subproject_drive_files (subproject_id, upload_section, uploaded_at desc)
where deleted_at is null;

create index if not exists activity_drive_files_section_active_idx
on public.activity_drive_files (activity_id, upload_section, uploaded_at desc)
where deleted_at is null;
