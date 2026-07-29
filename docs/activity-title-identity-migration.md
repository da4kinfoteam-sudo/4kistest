# Activity Titles and Immutable Entity Identity

## Environment

This implementation and every database verification in this document apply only to:

- Repository: `da4kinfoteam-sudo/4kistest`
- Local repository: `Testing/4kistest/4kistest`
- Frontend target: `https://4kistest.vercel.app`
- Vercel project: `4kistest` (`prj_eMoPNzdqAuH5ELkLbzIARwc4qfEj`)
- Supabase project ref: `zojmlmolznkqhxgwthsq`

The production repository, `4kis` Vercel project, `https://4kis.vercel.app`, and production Supabase project `iwswkepfkzdfytaukrsx` were not modified, migrated, or deployed.

## Identity model

- Database `id` is the authoritative relationship key.
- `uid` remains the business-facing code used for display and data exchange.
- Names remain editable display values and compatibility snapshots.
- Legacy names resolve only when an exact normalized name has one match.
- An immutable ID always wins over a stale or ambiguous name.
- Ambiguous normalized names are returned for review and are never guessed.
- Existing numeric primary keys were not replaced and no UID constraint was added.

### Subprojects and IPOs

`subprojects.ipo_id` is authoritative. `indigenousPeopleOrganization` remains a legacy/display snapshot during the compatibility phase. Shared hydration resolves and displays the current IPO name without rewriting the Subproject row after an IPO rename.

### Activities and IPOs

`activity_ipos` is the authoritative many-to-many relationship:

| Column | Behavior |
| --- | --- |
| `id` | Generated primary key |
| `activity_id` | Required FK to `activities.id`; cascades when an Activity is deleted |
| `ipo_id` | Required FK to `ipos.id`; restricts IPO deletion while linked |
| `created_at` / `updated_at` | Database-managed timestamps |
| `created_by` | Optional audit snapshot |

The unique constraint on `(activity_id, ipo_id)` prevents duplicate pairs. Reads use junction rows first, then `participating_ipo_ids`, then uniquely resolved `participatingIpos` names. Creates, edits, repeats, clones, and imports write the junction and both legacy snapshots.

### Marketing Linkages

Nested Marketing Linkages now store `ipoId` as the transitional immutable identity. `ipoName` remains a display snapshot. Create, edit, detail, aggregation, IPO Detail, and Farm Productivity paths resolve by `ipoId` first. Immediate table normalization was deferred because the existing nested JSON workflow can safely transition without a destructive rewrite.

## Activity Titles

`activities.activity_title` is nullable during migration.

- New explicit Activity create/detail edits require an Activity Title.
- Training titles mirror the existing Training `name` for compatibility.
- Three legacy Training records were backfilled from their existing specific names.
- Existing non-training records were not assigned guessed database titles.
- Accomplishment and expense editing do not require a legacy record to acquire a title.
- Repeated and cloned Activities preserve the title while UID and dates distinguish occurrences.
- Duplicate titles within the same Operating Unit, Fund Year, and target date produce a non-blocking warning.

The shared fallback for an untitled legacy non-training Activity is:

`<Activity Type> — <Primary IPO or Location> — <Target Date>`

The shared secondary context is:

`<Activity Type> · <Target Date> · <Primary IPO or Location>`

## Migrations

Applied to the test Supabase project in this order:

1. `202607280001_activity_titles_and_immutable_relationships.sql`
   - Adds `activities.activity_title`.
   - Backfills Training titles only.
   - Creates and backfills `activity_ipos`.
   - Backfills missing `subprojects.ipo_id` only for unique normalized matches.
   - Adds and conditionally validates the nullable Subproject FK.
   - Adds `ipoId` to uniquely resolvable nested Marketing Linkages.
2. `202607280002_backfill_activity_ipo_legacy_ids.sql`
   - Populates only empty or malformed legacy Activity IPO ID arrays from verified junction rows.
   - Does not overwrite non-empty ID arrays or any legacy name snapshot.

Both migrations are additive. Legacy fields remain in place and stricter title/UID constraints are deferred.

## Data-quality results

The read-only pre-migration report is `docs/identity-data-quality-before.json`. The final report is `docs/identity-data-quality-after.json`.

| Finding | Before | After |
| --- | ---: | ---: |
| IPOs | 4 | 4 |
| Subprojects | 7 | 7 |
| Activities | 4 | 5 |
| Marketing Partners | 2 | 2 |
| Activity/IPO junction rows | 0 | 6 |
| Activities with stored specific titles | 0 | 4 |
| Subprojects missing `ipo_id` | 0 | 0 |
| Subproject linked-name mismatches | 0 | 0 |
| Activities missing legacy linked IPO IDs | 1 | 0 |
| Activities missing required junction rows | N/A | 0 |
| Unresolved Activity IPO names | 0 | 0 |
| Ambiguous IPO names | 0 | 0 |
| Marketing Linkages without a resolvable IPO | 0 | 0 |
| Marketing Linkages with immutable `ipoId` | 0 of 1 | 1 of 1 |
| Missing UIDs | 0 | 0 |
| Duplicate UIDs | 0 | 0 |
| Legacy Activities without a specific title | 4 | 1 |

### Manual review list

One legacy non-training record intentionally remains untitled:

- Activity ID: `900002`
- UID: `ACT-TEST-2026-002`
- Type: `Activity`
- Legacy name/type snapshot: `Market Matching and Test Buy Activity`
- Display fallback: `Market Matching and Test Buy — Cordillera Coffee Producers Test IPO — Aug 15, 2026`

No identity relationship requires manual correction in the current test data.

## Updated consumers

ID-first relationship resolution and shared Activity title display are used in:

- Application scoped loading and local hydration
- IPO, Subproject, Activity, and Marketing Linkage entry/detail/list paths
- Activity create, edit, repeat, clone, import, delete history, and exports
- Subproject create, edit, clone, import, detail, and commodity synchronization
- IPO Detail linked Subprojects, Activities, monitoring reports, and marketing sales
- Homepage calendar, map, cards, and activity feed
- Physical and Financial Accomplishment paths and shared financial aggregation
- Physical, GAD, Awards, Farm Productivity, Commodity, and Agricultural Interventions dashboards
- IPO Management statistics and AI assistant calculations
- BAR1, PICS, Monthly Report Matrix, Detailed Accomplishment Data, BP Forms, WFP, Budget Utilization, and related report display paths

LOD, monitoring-report identity, Drive files, central financial actual records, and budget adjustment history retain their existing ID-based contracts.

## Verification evidence

### Shared helper checks

`npm run test:identity` passes ten deterministic checks:

- Ambiguous normalized names are not guessed.
- Immutable IDs override ambiguous/stale names.
- Subprojects display the current IPO name from `ipo_id`.
- Junction rows override legacy Activity IPO values.
- Activity names hydrate from current IPO records.
- Explicit Activity Titles are primary.
- Legacy Training names remain a safe title fallback.
- Legacy non-training fallback formatting is correct.
- Duplicate-title scope detection works.
- Marketing Linkages hydrate by `ipoId`.

### Reversible rename verification

`scripts/verify-identity-rename.mjs` temporarily renamed every linked seeded IPO and restored each name in `finally`.

- Four IPOs retained seven linked Subprojects.
- Four IPOs retained five Activity junction rows.
- The Marketing Linkage retained its immutable IPO relationship.
- Subproject `900001` retained two obligations and two disbursements after a Subproject rename.
- Activity `900001` retained one obligation and one disbursement after an Activity Title rename.
- All IPO, Subproject, and Activity names/titles were restored.

The evidence is stored in `docs/identity-rename-verification.json`.

### Reversible write-path verification

`scripts/verify-identity-write-paths.mjs` created temporary create, clone, repeat, and import-style Activities.

- Every record stored an explicit Activity Title.
- Every record stored legacy IPO IDs and a junction row.
- Editing changed both the legacy ID array and junction relationship.
- The stale junction row was removed only after the replacement was registered.
- Two duplicate titles in the same scope were accepted, proving the warning remains non-blocking.
- Cleanup deleted all temporary Activities and cascade-deleted their junction rows.

The evidence is stored in `docs/identity-write-path-verification.json`.

### Static and visual checks

- `npm run lint`: passed
- `npm run build`: passed
- `npm run audit:ui`: passed across 88 component files
- `npm run audit:legacy-ui`: zero legacy styling violations
- `git diff --check`: passed
- Desktop Activity list: explicit titles and legacy fallback displayed correctly with no page overflow
- 390×844 Activity list: no page overflow; the wide table scrolls inside its table container
- Activity create form: Activity Title is required and has an accessible label
- Legacy Activity detail: fallback title, current linked IPO, existing financial actuals, Gallery, and Activity Files remain visible

The DCF policy asks for an edit reason before opening accomplishment mode. The browser automation surface does not implement `window.prompt`, so the automated click stopped at that existing policy prompt; source and validation tests confirm accomplishment saves do not include `activity_title` in their required fields.

## Compatibility and future phase

Do not remove `name`, `participatingIpos`, `participating_ipo_ids`, `indigenousPeopleOrganization`, or Marketing Linkage `ipoName` yet. A later approved phase may remove fallbacks only after all environments and clients have been verified. UID auditing found no current issue, but collision-safe server-controlled UID generation remains a separate future improvement.
