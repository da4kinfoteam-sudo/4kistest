# 4kistest

This repository is the isolated test deployment of the 4K Information System.

## Linked resources

- GitHub: `da4kinfoteam-sudo/4kistest`
- Vercel project: `4kistest`
- Supabase project: `4kistest` (`zojmlmolznkqhxgwthsq`, Singapore)

The app uses the main build's source history, but its Vercel and Supabase resources are separate from production. The database baseline in `supabase/migrations/202607150001_main_schema_baseline.sql` is a schema-only snapshot: production rows and authentication users are not copied.

Historical incremental migrations from the production repository are retained under `supabase/migrations_legacy/` for reference. They are not applied after the consolidated test baseline.

## Syncing future main changes

```powershell
git fetch upstream
git merge upstream/main
git push origin main
```

Review any new database migration before applying it to the test Supabase project.
