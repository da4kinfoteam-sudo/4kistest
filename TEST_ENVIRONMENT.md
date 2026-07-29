# 4kistest

This repository is the isolated test deployment of the 4K Information System.

## Linked resources

- GitHub: `da4kinfoteam-sudo/4kistest`
- Vercel project: `4kistest`
- Supabase project: `4kistest` (`zojmlmolznkqhxgwthsq`, Singapore)

The app uses the main build's source history, but its Vercel and Supabase resources are separate from production. The database baseline in `supabase/migrations/202607150001_main_schema_baseline.sql` is a schema-only snapshot: production rows and authentication users are not copied.

Historical incremental migrations from the production repository are retained under `supabase/migrations_legacy/` for reference. They are not applied after the consolidated test baseline.

## Current main-build synchronization

The July 29, 2026 synchronization is based directly on production repository commit:

- `d8952898a068e1b77cd75f9b94ce14cc391a80a8` — `Polish detail gallery and files`

The shared Gallery/File components, record-detail layout primitives, and global styling are unchanged from that main-build commit. The only intentional code differences are the isolated test-environment artifacts and the Activity Title/immutable entity-ID feature under test.

The test Supabase project also includes the main build's additive Drive migrations:

- `202607230001_drive_media_sections.sql`
- `202607230002_drive_folder_registration_race_fix.sql`

All Drive Edge Functions are deployed separately to the test Supabase project. Production credentials, rows, authentication users, and Drive tokens are not copied.

## Synthetic test data

`supabase/migrations/202607150002_test_seed_data.sql` provides a repeatable, synthetic fixture across all 53 public tables. It does not contain production records, production users, or live Google Drive tokens.

Test administrator login:

- Username: `testadmin`
- Password: `Test4K!2026`

Additional role-scoped accounts are `testfocal` and `testrfo`; they use the same test-only password. Mock Google Drive metadata is linked to a deliberately disconnected placeholder connection, so it cannot access a real Drive account.

## Syncing future main changes

```powershell
git fetch upstream
git merge upstream/main
git push origin main
```

Review any new database migration before applying it to the test Supabase project.
