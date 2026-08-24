# Gallery and Files Upload Contract

The main build uses one shared media contract for IPO, Subproject, and Activity detail pages. This document is the implementation reference for the later `4kistest` redesign port.

## Stored metadata

Each row in `ipo_drive_files`, `subproject_drive_files`, and `activity_drive_files` contains:

- `upload_section`: `gallery` or `files`.
- `display_name`: optional app-visible image name. The original Google Drive filename remains in `file_name`.
- `caption`: optional app-only image caption.

Gallery membership is based on `upload_section`, not MIME type. Gallery uploads accept supported images only. Files uploads accept the existing PDF and image types, and an image uploaded to Files does not appear in Gallery.

## Google Drive layout

New uploads add a final folder below the existing entity folder:

```text
<existing entity folder>/Gallery
<existing entity folder>/Files
```

Migration `202607230001_drive_media_sections.sql` classifies existing image rows as Gallery and other existing rows as Files. It does not move, delete, rename, or re-upload existing Google Drive objects.

Migration `202607230002_drive_folder_registration_race_fix.sql` makes folder mappings connection-aware, adds persisted `gallery_folder_id` and `files_folder_id` references, and adds short-lived initialization locks. It does not update existing folder or file metadata.

## Folder identity and initialization

An entity folder mapping belongs to the active Google Drive connection that created it. The canonical identities are:

- IPO: IPO, connection, module, upload year, and operating unit.
- Subproject: subproject, connection, module, and upload year.
- Activity: activity, connection, module, and upload year.

Historical mappings from an older Drive connection remain unchanged. Reconnecting Drive can create a mapping for the new connection without colliding with or reassigning the historical mapping.

New entity folders use the database ID as the stable identity while retaining the readable name:

- IPO: `IPO-{id} - {name}`
- Subproject: `SP-{id} - {name}`
- Activity: `ACT-{id} - {name}`

Changing an entity name does not create a replacement folder when that entity already has a valid mapping. The persisted mapping remains authoritative. Name-only Drive folder discovery must not be used to establish entity ownership.

The backend follows this sequence:

1. Look for the canonical mapping using the complete connection-aware identity.
2. Acquire a short-lived database initialization lock when no mapping exists.
3. Recheck after acquiring the lock.
4. Create/find the Drive hierarchy and attempt to register it.
5. Treat a concurrent unique conflict as recoverable, then retrieve the canonical row with bounded retries.
6. Return a user-safe folder preparation message if recovery cannot complete.

### Legacy shared-folder isolation

Older mappings may point multiple same-name entities to one physical Drive folder. Before reusing an existing mapping, the backend checks whether another entity under the same active connection owns the same `folder_id`.

If a collision exists, the next upload for the current entity creates its ID-qualified folder and updates only that entity's folder mapping. Its `gallery_folder_id` and `files_folder_id` are reset so new section folders are created below the new entity folder. The application does not move, rename, copy, delete, or re-upload historical Drive objects, and it does not rewrite historical file rows.

The remaining legacy mapping may continue using the old folder after the conflicting entity moves. This stops future cross-entity uploads while preserving the historical Drive layout.

Existing file ownership always comes from the exact database foreign key (`ipo_id`, `subproject_id`, or `activity_id`). List, preview, metadata update, download, and delete operations continue using the stored file row and `file_id`; they must never infer ownership by folder name or enumerate a shared Drive folder into multiple entities. Drive-only objects without a database file row are not assigned automatically.

Raw PostgreSQL, PostgREST, constraint, and SQLSTATE messages must never be returned to the upload queue.

## Gallery and Files child folders

The entity folder row persists the canonical child IDs in `gallery_folder_id` and `files_folder_id`. Existing rows begin with these values empty. The first upload searches for an existing same-name child before creating one and then persists the canonical ID. Legacy Drive objects stay in their original locations.

Short-lived locks serialize first-time entity and section folder creation. The browser also processes uploads sequentially until the first file succeeds, then uses bounded concurrency for the remaining files. This keeps partial-success behavior while avoiding simultaneous hierarchy initialization.

Google Drive permits duplicate folder names. A failed historical attempt may therefore have left an empty duplicate folder. Review such folders manually and delete only after confirming they are empty and are not referenced by any folder or file row. The application must never automatically guess or delete a duplicate.

## Shared frontend components

`components/ui/DriveMediaSections.tsx` exports:

- `DriveUploadDropzone`: multi-file picker, drag-and-drop, per-file validation, sequential first-success initialization, bounded two-upload concurrency for remaining files, partial failure handling, safe error messages, and batch results.
- `EntityGallery`: thumbnail/list/carousel views, large preview, app-visible name and caption editing, refresh, and deletion handoff.
- `EntityFilesList`: Files-only upload, bounded scroll list, preview/open controls, refresh, and deletion handoff.
- `getPersistedDriveUploadSection`: compatibility classification while clients and migrations are rolling out.

Entity pages continue to own authorization, Drive connection state, deletion confirmation, and their entity-specific API calls.

## Production data protections

Maintenance and future ports must not:

- Move, rename, delete, or re-upload an existing Drive object.
- Rewrite an existing folder/file `connection_id` or `folder_id`.
- Reassign a historical file to the current Drive connection.
- Automatically remove same-name or apparently duplicate folders.
- Reset the Google Drive connection as part of folder recovery.

## `4kistest` Port Checklist

### Required migrations

- Port `202607230001_drive_media_sections.sql`.
- Port `202607230002_drive_folder_registration_race_fix.sql`.
- Preserve their order and do not merge them into an existing deployed migration.
- Confirm all three folder tables have `gallery_folder_id` and `files_folder_id`.
- Confirm connection-aware unique indexes and `drive_folder_initialization_locks` exist.

### Shared Edge Functions

- Port the shared `DriveUploadSection` validation and metadata functions.
- Port connection-aware canonical folder lookup and registration.
- Port ID-qualified entity folder naming and legacy shared-folder collision isolation.
- Port short-lived entity/section initialization locks.
- Port bounded conflict visibility retries and safe public errors.
- Deploy the three upload functions after the migration:
  - `ipo-drive-file-upload`
  - `subproject-drive-file-upload`
  - `activity-drive-file-upload`
- Deploy the three metadata functions:
  - `ipo-drive-file-update`
  - `subproject-drive-file-update`
  - `activity-drive-file-update`

### Shared uploader

- Preserve multi-select and drag-and-drop.
- Process files sequentially until the first upload succeeds.
- Process remaining files with bounded concurrency.
- Preserve per-file state, duplicate validation, partial success, and safe error mapping.

### Page integration

- Integrate `EntityGallery` and `EntityFilesList` into IPO Detail.
- Integrate both components into Subproject Detail.
- Integrate both components into Activity Detail.
- Keep Gallery membership based on `upload_section`, not MIME type.
- Keep `display_name ?? file_name` and app-only captions.

### Deployment order

1. Apply both required migrations.
2. Deploy the affected Supabase Edge Functions.
3. Verify remote migration and function status.
4. Deploy the frontend.
5. Smoke-test all three entity types under the active connection.

### Regression tests

- Existing current-connection folder mapping is reused.
- A reconnected Drive creates a new connection-specific mapping without changing the old row.
- A new entity accepts a multi-file Gallery upload without duplicate folder records.
- Files uploads remain separate from Gallery uploads.
- One failed file does not roll back successful files.
- No raw database error appears in the UI.
- Two same-name IPOs, Subprojects, or Activities create different entity folder IDs and paths.
- A legacy shared mapping rotates forward for the uploading entity without changing historical file rows.
- Renaming an entity with an existing valid mapping does not create a new folder.
- Desktop/mobile layouts remain bounded and responsive.
- `npm run lint` and `npm run build` pass.

Port the storage types and API contract first, then reuse or adapt the shared UI components. Do not return to MIME-derived Gallery membership or connection-agnostic folder uniqueness. Keep the original Drive filename immutable unless a separate storage-rename feature is explicitly approved.
