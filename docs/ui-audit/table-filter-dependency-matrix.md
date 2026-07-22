# Table and Filter Dependency Audit

## Scope

This audit covers the Subprojects, Activities, Program Management, IPO, and Dashboard filter/table redesign. The application currently relies on in-app permissions and visibility rules; Supabase RLS is not enabled and is not part of this goal.

## Pre-change architecture finding

`useDcfScopeFilters` sends every selected scope change to `App.ensureDataScope`. `ensureDataScope` calls `loadScopedAppData`, then replaces the shared application collections for Subprojects, Activities, IPOs, Office Requirements, Staffing Requirements, Other Expenses, financial rows, monitoring rows, and references. The active page therefore changes the arrays later consumed by forms, detail routes, and linked-record workflows.

The current IPO enrichment recovers IPOs already referenced by the loaded Subprojects, Activities, or monitoring reports. It cannot supply candidates for a new relationship, so an activity loaded under an NPMO scope can be unable to select an otherwise permitted IPO.

## Dependency matrix

| Page or workflow | Required dataset | Follow page filters? | Follow in-app permission / visibility? | Pre-change failure mode | Implemented resolution |
| --- | --- | --- | --- | --- | --- |
| Subprojects table | Subprojects and computed budget/completion fields | Yes | Yes | A scope change replaces unrelated global collections and is applied immediately, before an explicit Apply action | Use staged applied scope for the table-result query; keep search/column filters local to the table |
| Subproject create/edit | IPO candidates, reference particulars, UACS, commodities, livestock | No for Fund Year, Fund Type, and Tier; IPO region selection remains a form rule | Yes | IPO choices come from the globally filtered IPO array | Use a separate permission-visible IPO lookup source; keep reference caches independent from page-result scope |
| Subproject detail | One Subproject by route ID and its linked IPO | No | Yes | Direct routes fail when the record is absent from the current list cache | Resolve by permission-aware ID lookup when absent from the page cache |
| Activities table | Activities and computed expense totals | Yes | Yes | A scope change replaces unrelated global collections and is applied immediately | Use staged applied scope for the table-result query; keep search/column filters local |
| Activity create/edit | IPO candidates, activity references, UACS | No for Fund Year, Fund Type, and Tier; activity OU/region rules still apply | Yes | IPO multi-select receives only IPOs left in the globally scoped array | Use a separate permission-visible IPO lookup and always merge currently linked IPOs by ID/name |
| Activity detail | One Activity by route ID, linked IPOs, monitoring rows | No | Yes | Direct routes and linked IPO buttons can fail when the global scope changes | Fetch missing activity and IPO records by ID; monitoring rows remain keyed to the activity/report IDs |
| NPMO monitoring report | Activity, participating IPOs, report, actions | No | Yes | New or existing permitted IPO relationships can be missing under NPMO table scope | Resolve participating IPOs from the workflow lookup source, not the page-result IPO array |
| IPO table | IPOs plus flags, commodities, and latest Level of Development | IPO-specific filters only | Yes | Region/flag filters are persistent but split across toolbar/checkbar and actions depend on scoped linked arrays | Move IPO filters into the shared column-filter dialog and resolve linked counts/details independently |
| IPO detail | One IPO plus linked Subprojects, Activities, monitoring reports/actions | No | Yes | Base IPO selection has no route ID and linked records can be reduced by the active DCF scope | Add route-addressable/fallback IPO resolution and preserve the existing linked-record ID queries |
| Office Requirements table | Office Requirements and computed budget | Yes | Yes | Program scope replaces all Program Management and unrelated collections | Use the shared staged Program Management scope for the active page dataset |
| Staffing Requirements table | Staffing Requirements, expenses, annual salary, computed budget | Yes | Yes | Same global replacement and immediate scope behavior | Use the shared staged Program Management scope for the active page dataset |
| Other Expenses table | Other Expenses and amount | Yes | Yes | Same global replacement and immediate scope behavior | Use the shared staged Program Management scope for the active page dataset |
| Program Management forms | UACS and particular references | No | Yes | References are replaced as part of every scoped application load even though they are not business-scope data | Keep reference data in an independent reusable cache |
| Dashboard | Approved business rows for aggregate calculations | Yes | Yes | Dashboard filter values are not persisted or staged and also replace global workflow collections | Use the shared staged/persistent major filter and a dashboard-result dataset independent of workflow lookups |
| Table search | Current table result fields | Within applied page scope | Yes | Search persistence is inconsistent across modules but generally local | Preserve all current searchable fields and persist by user/module |
| Column filters | Current table result columns | Within applied page scope | Yes | Filters live in headers, update immediately, and share values with the major scope | Move to a draft/apply modal; keep major scope and column-filter state separate |
| Bulk clone/delete | Selected table-result records | Yes | Yes, including DCF deletion policy | Inline Delete duplicates bulk mode; selection appears in the right Actions column on several tables | Use a left selection column only in bulk mode, a contextual toolbar, and confirmation summaries; remove the redundant Actions column and open details through row activation |
| Import/export | Active module dataset and existing format | Applied scope as currently defined by each export/import operation | Yes | Toolbar styling and selection-state interactions differ by table | Preserve handlers and file formats; place controls in the shared toolbar |

## Implementation invariants

- Applied major filters are persisted per user and module; unapplied drafts are not persisted.
- Page-result scopes never become the source of truth for form lookups.
- Existing in-app permissions, OU visibility, workflow decisions, delete policy, logging, and archive behavior remain intact.
- Supabase queries must include the applicable in-app OU/visibility constraints because no RLS policy will add them.
- No UI or documentation may claim database-level row security.
- Existing linked records must remain resolvable by ID even when absent from the active list result.

## Implemented dependency isolation

- `lib/workflowLookups.ts` now loads IPO relationship candidates independently from table Fund Year, Fund Type, and Tier filters while applying the signed-in user's in-app Operating Unit visibility to every query.
- Activity and Subproject create, edit, detail, and monitoring flows receive dedicated workflow IPO collections instead of the active IPO table result.
- App detail routing now resolves missing Subproject, Activity, and Program Management records directly by ID and applies the user's in-app Operating Unit visibility before returning the record.
- Major filters update the scoped page-result path only after Apply; draft values do not query Supabase or replace workflow lookup collections.
- Reference collections remain outside the table column-filter path, so UACS, particulars, commodities, equipment, and other form references are not reduced by unrelated table filters.
- No Supabase RLS policy was introduced or assumed; existing in-app access checks, visibility scope, workflow policy, and deletion guards remain authoritative.
