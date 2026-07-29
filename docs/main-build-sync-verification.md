# Main Build to 4KISTest Synchronization

## Result

On July 29, 2026, the 4KISTest source was rebuilt directly from the latest committed production source:

- Production repository: `da4kinfoteam-sudo/4K-Information-System`
- Source commit: `d8952898a068e1b77cd75f9b94ce14cc391a80a8`
- Source subject: `Polish detail gallery and files`
- Test repository: `da4kinfoteam-sudo/4kistest`

The production repository was inspected read-only. Its unrelated uncommitted `sampleIPOs.tsx`, `samples.tsx`, `.agents/`, and `AGENTS.md` changes were not copied.

## Preserved test-only boundaries

- Vercel project: `4kistest` (`prj_eMoPNzdqAuH5ELkLbzIARwc4qfEj`)
- Supabase project ref: `zojmlmolznkqhxgwthsq`
- Consolidated test schema baseline and synthetic seed data
- Activity Title and immutable entity-ID feature
- Test-only data-quality and reversible verification scripts

The production Vercel project, production Supabase project, live rows, production authentication users, and Drive credentials were not modified or copied.

## Main-build parity

These files are identical to the source commit:

- `components/ui/DriveMediaSections.tsx`
- `components/ui/RecordDetailLayout.tsx`
- `styles/main.css`

Activity, Subproject, and IPO detail pages use the latest record-detail layout, KPI hierarchy, responsive panels, Gallery, and separate Files sections. Their only intentional differences are the ID-first relationship and Activity Title integrations.

The latest financial breakdown hierarchy and its deterministic verification script are also present.

## Test backend synchronization

The following main-build Drive migrations were applied to the test Supabase project:

- `202607230001_drive_media_sections.sql`
- `202607230002_drive_folder_registration_race_fix.sql`

The test project migration history now contains:

- `202607150001`
- `202607150002`
- `202607230001`
- `202607230002`
- `202607280001`
- `202607280002`

All 16 Google Drive Edge Functions were redeployed to the test project. The three file-update functions were added and the existing functions were rebuilt with the latest shared Drive implementation.

## Verification

Passed:

- `npm run test:identity`
- `npm run test:financial-breakdown`
- `npm run lint`
- `npm run build`
- `npm run audit:ui`
- `npm run audit:legacy-ui`
- Post-sync identity data-quality audit

Browser verification covered the synchronized Activity, Subproject, and IPO detail pages at desktop and 390px widths. All three used the new record-detail layout, Gallery/File sections remained visible, the Activity Title fallback remained correct, there was no page-level horizontal overflow, and no browser console errors were recorded.
