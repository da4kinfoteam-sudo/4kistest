# Agri Vista UI migration and verification record

This document is the traceable completion record for the repository-wide Agri Vista migration in `4kistest`. It covers source inventory, replacements, responsive behavior, browser coverage, exceptions, and regression checks. It does not authorize or record any deployment or database change.

## Canonical visual contract

- Inter is the only application font family, including shell controls, native inputs, Leaflet, and Recharts.
- Page titles use 28px/800 with a tight line height and tracking.
- Section and card titles use 14px/700.
- Dense application body text and controls use 13px; standard controls are 36px high with a 6px radius and no decorative shadow.
- KPI cards use an 8px radius, a subtle one-pixel border and shadow, 11px/600 labels, and 28px/800 values.
- Supported font weights are 400, 500, 600, 700, and 800.
- Shared surfaces, controls, statuses, state views, tables, dialogs, and responsive layouts are defined once in `styles/main.css` and the shared UI primitives.

## Legacy inventory and replacement map

| Legacy pattern found | Consumers audited | Canonical replacement |
| --- | --- | --- |
| Palette-specific Tailwind utilities such as `bg-white`, `text-gray-*`, `text-slate-*`, and component-local blue/green/red variants | Physical and Financial Accomplishment, LOD, IPO, Marketing, User Profile, reports, dashboards, shell loaders | Semantic surface, text, accent, status, and state classes backed by Agri Vista variables |
| One-off font sizes, weights, tracking, uppercase labels, and legacy font inheritance | Shell, page headers, KPI cards, tables, forms, settings, reports, dashboards, Leaflet, Recharts | Canonical Inter type scale and shared title/label/body classes |
| Hard-coded radii and shadow utilities | Cards, buttons, dialogs, filters, table actions, profile/settings panels | Canonical 6px controls, 8px surfaces, shared border and elevation tokens |
| Fixed table widths and component-owned `overflow-x-*` combinations | Subprojects, Activities, IPO, References, Marketing, Program Management, Accomplishment, reports, settings data grids | `TableShell`/`.data-table-scroll`, canonical data-table cells and actions, sticky priority columns, controlled horizontal scrolling |
| Duplicate desktop/mobile table implementations and legacy mobile-card rules | Dense operational and report tables | One authoritative responsive table implementation with preserved columns and touch-accessible actions |
| Component-local sortable/filter header menus and pagination | Operational lists, references, program management, reports | `FilterableTableHeader`, `SortableTableHeader`, and `DataTablePagination` |
| Ad hoc loading, empty, error, status, and confirmation UI | Route loaders, dashboards, CRUD modules, settings, IPO detail | `LoadingState`, `LoadingSkeleton`, `EmptyState`, `ErrorState`, `StatusIndicator`, and `ConfirmDialog` |
| Repeated financial obligation/disbursement editor markup | Accomplishment and shared finance editors | `FinancialRecordListEditor` with canonical input and row states |
| Component-specific chart/card/filter shells | Dashboards and reports | `PageHeader`, `SectionHeading`, `ContentCard`, `ChartCard`, `MapCard`, `FilterToolbar`, and `KpiCard` |
| Broad CSS compatibility selectors and utility wildcards | Global stylesheet | Removed after all consumers were migrated; the audit now rejects reintroduction |
| Same-context duplicate selectors, competing declarations, and specificity workarounds | `styles/main.css` and the removed financial dashboard stylesheet | Consolidated authoritative selectors; zero duplicate selectors and zero `!important` declarations remain |
| Deprecated component-specific financial dashboard stylesheet | Financial dashboard | Rules consolidated into `styles/main.css`; `styles/financial-dashboard.css` and its import were removed |
| Mojibake quotation marks in the subproject confirmation dialog | Subprojects delete confirmation | Correct Unicode quotation marks; no behavior or data mutation changed |

## Shared primitives established or extended

- `components/ui/enterprise.tsx`: page and section headers, content/chart/map cards, filter and table toolbars, KPI cards, table shell, sortable/filterable headers, pagination, confirmation dialog, status indicators, empty/error/loading states, and loading skeletons.
- `components/ui/FinancialRecordListEditor.tsx`: shared obligation/disbursement list editor.
- `styles/main.css`: authoritative shell, typography, surfaces, controls, forms, tables, responsive layouts, themes, dashboards, reports, details, settings, dialogs, calendar, map, and chatbot styling.
- `lib/theme.ts`: canonical Light, Dark, and System behavior.

## Migrated surfaces

- Shell: login, sidebar, top bar, breadcrumbs/page headers, route loaders, mobile navigation, user menu, and theme controls.
- Primary routes: Homepage, Dashboards, Subprojects, Trainings, Other Activities, Activities, Program Management, Financial Accomplishment, Physical Accomplishment, IPO, References, Reports, Settings, Marketing Database, Level of Development, and Commodity Mapping.
- Dashboard modules: Physical, Financial, SCAD, Agricultural Interventions, Farm Productivity and Income, Commodities, IPO Level of Development, GAD, Nutrition, and Awards and Rankings.
- Report modules: WFP, BP Forms, BEDS, PICS, BAR1, Budget Utilization, Monthly Matrix, Detailed Accomplishment Data, and Financial Audit.
- Settings modules: User Profile, Users Management, User Control Center, Google Drive Storage, DCF, LOD, System Management, User Logs, and Archive Management, including Physical Status, Budget Ceiling, questionnaire, and range editors.
- References: UACS Codes, Subproject Items, Crop, Livestock, Agricultural Input, Equipment, Infrastructure, Training, GIDA Areas, and ELCAC Areas.
- Program Management: Office, Staffing, and Other Expenses list, create form, and detail surfaces.
- Detail/edit flows: Subproject, Activity, IPO, Marketing Profile, Market Linkage, LOD, Office Requirement, Staffing Requirement, and Other Expense.
- Shared interaction surfaces: filters, sorting, pagination, row expansion, dialogs, validation, badges, calendars, charts, maps, editors, loading/state views, and the AI chatbot.

## Responsive browser coverage

All checks below passed rendering, font-family, legacy-class, document-overflow, table-containment, and visible-runtime-failure assertions. Dense tables retain their full data and use controlled horizontal scrolling at narrow widths.

| Route group | 1440x900 | 1024x768 | 768x1024 | 390x844 | 360x800 |
| --- | --- | --- | --- | --- | --- |
| 16 primary routes listed above | Pass | Pass | Pass | Pass | Pass |
| Homepage/calendar | Pass | Pass | Pass | Pass | Pass |
| Dense operational tables | Pass | Pass | Pass | Pass | Pass |
| Reports entry surface | Pass | Pass | Pass | Pass | Pass |
| Dashboards entry surface | Pass | Pass | Pass | Pass | Pass |
| Settings entry surface | Pass | Pass | Pass | Pass | Pass |

Primary-route total: 80 route/viewport states.

Nested modules were exercised at the two bounding viewports because the primary route matrix already covered both tablet breakpoints:

| Nested group | Modules/states | 1440x900 | 390x844 |
| --- | ---: | --- | --- |
| Dashboard tabs | 10 / 20 states | Pass | Pass |
| Report tabs | 9 / 18 states | Pass | Pass |
| Settings top-level tabs | 9 / 18 states | Pass | Pass |
| Reference tabs | 10 / 20 states | Pass | Pass |
| Program Management list/create forms | 6 / 12 states | Pass | Pass |
| DCF/LOD nested editors | Physical Status, Budget Ceiling, questionnaire, ranges | Pass | Pass |
| Detail/edit flows | Subproject, Activity, IPO, Marketing Profile, Market Linkage, LOD, program details | Pass | Pass |

Interaction checks passed for column filtering and descending sort, page-size selection, mobile filters, expandable rows, controlled table scrolling, mobile navigation, calendar event navigation, AI chat open/close, confirmation cancel, and visible keyboard focus. Light, Dark, and System theme selection passed; the user preference is restored to System after verification.

## Computed-style comparison

| Element | Lovable reference | Final local light theme | Result |
| --- | --- | --- | --- |
| Font family | Inter with system fallbacks | Inter with system fallbacks | Match |
| Page title | 28px, weight 800, 35px line height | 28px, weight 800, 33.6px line height | Match within canonical local scale |
| Page background | near-white `oklch(0.985 0.003 240)` | `rgb(247, 248, 248)` | Visual match |
| Surface/card | white, 8px radius, subtle border and `0 1px 2px` shadow | white, 8px radius, subtle border and `0 1px 2px` shadow | Match |
| Top bar | translucent white at 95%, lower border | translucent white at 94%, lower border | Match |

The Lovable document root defaults to 16px, while the local information system intentionally applies its established 13px dense application body token. Page titles, labels, controls, tables, and hierarchy use the corresponding Agri Vista component scale, and no legacy font family remains.

## Screenshot evidence

Baseline files:

- `docs/ui-audit/before-local-home-1440x900.png`
- `docs/ui-audit/before-local-subprojects-1440x900.png`
- `docs/ui-audit/before-local-reports-1440x900.png`
- `docs/ui-audit/reference-lovable-home-1440x900.png`
- `docs/ui-audit/reference-lovable-subprojects-1440x900.png`
- `docs/ui-audit/reference-lovable-reports-1440x900.png`

Final files:

- `docs/ui-audit/final-reference-lovable-home-1440x900.png`
- `docs/ui-audit/final-local-home-light-1440x900.png`
- `docs/ui-audit/final-local-subprojects-light-1440x900.png`
- `docs/ui-audit/final-local-report-light-1440x900.png`
- `docs/ui-audit/final-local-dashboard-light-1440x900.png`
- `docs/ui-audit/final-local-settings-light-1440x900.png`
- `docs/ui-audit/final-local-form-light-1440x900.png`
- `docs/ui-audit/final-local-detail-light-1440x900.png`
- `docs/ui-audit/final-local-modal-light-1440x900.png`
- `docs/ui-audit/final-local-subprojects-light-390x844.png`

## Final source inventory and retained exceptions

The final legacy inventory reports zero forbidden surface, type-size, type-weight, palette, tracking, radius, shadow, `!important`, and same-context duplicate-selector findings. The UI audit also reports zero obsolete stylesheet imports, deprecated variables, broad utility compatibility selectors, fixed-width/overflow utility patterns, and missing canonical primitive consumers.

There are 42 retained JSX inline-style expressions across 14 files. They are data-driven geometry rather than legacy design values:

- Gantt positions and widths.
- Progress, completion, gender, allocation, and score percentages.
- Dashboard bar heights, segment widths, grid column counts, and hierarchy indentation.
- Runtime chart legend colors and a data-driven conic gradient.
- SVG/skeleton dimensions forwarded by a shared primitive.
- User-selected report column widths.

The exact consumers are `AIChatbot.tsx`, `GanttChart.tsx`, `Subprojects.tsx`, `SubprojectDetail.tsx`, `ui/enterprise.tsx`, `DetailedAccomplishmentDataReport.tsx`, and the Agricultural Interventions, Commodity, shared Dashboard Components, Farm Productivity, Financial, GAD, IPO Level, and Physical dashboard files. None duplicates static Agri Vista palette, typography, radius, or shadow values.

## Regression protection and verification commands

- `npm run audit:ui` rejects legacy markers, palette/type/radius/shadow/tracking utilities, fixed table width/overflow utilities, undocumented `!important`, duplicate selectors in the same at-rule context, broad compatibility selectors, deprecated variables, obsolete stylesheets, and missing shared primitives.
- `npm run audit:legacy-ui` produces the source inventory and inline-style exception count.
- `npm run lint` performs the repository TypeScript check.
- `npm run build` performs the production Vite build.
- `git diff --check` checks patch whitespace.

The development console recorded transient Recharts zero-size warnings while hidden chart tabs mounted. It also recorded `prompt() is not supported` only when the in-app automation harness attempted DCF policy edit workflows; that browser harness limitation does not occur in a normal browser, where the application intentionally uses the native prompt. No uncaught application runtime failure appeared during ordinary route, navigation, table, form, dialog, or detail checks.

## Environment isolation

- No Supabase project, credentials, environment variable, schema, migration, RLS policy, seed data, or test record was changed.
- No production project or database was touched.
- No commit, push, pull request, Vercel deployment, or domain change was performed.
- Remaining blockers: none.
