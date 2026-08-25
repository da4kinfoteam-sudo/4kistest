# Centralized authorization in 4kistest

The test build resolves access in one order: authentication and active-account checks, protected Super Admin/read-only invariants, user overrides, role defaults, and operating-unit scope. Missing rules fail closed. Every non-view action also requires view access to the same module.

User Settings owns role defaults, user overrides, data scopes, workflow assignments, DCF/status rules, and policy audit. Dashboard pages, report tabs, Program Management pages, and Reference pages have individual permission modules while retaining their parent navigation gate.

Workflow submission and approval are enforced by database functions. The temporary User auto-approval exception is controlled by an explicit role, applicable-module list, owner, and cutoff date. Approved material edits create a revision; financial actuals remain independently editable when their Financial Accomplishment and source-module permissions allow it.

## Test-only backend enforcement

The 4kistest Supabase project enables row-level policies as defense in depth because client-only controls cannot protect direct database requests. This is test-environment architecture and has not been applied to the Main repository, production Supabase project, or `4kis.vercel.app`. Any production adoption requires a separate reviewed migration and explicit promotion approval.

Financial actual mutations require both the Financial Accomplishment permission and the matching source-module permission. LOD mutations use named capabilities (`edit_assessment`, `set_manual_level`, `manage_controller`, `inline_edit`, and `bulk_action`); mutable LOD RPCs are authenticated-only and bind audit identity to the active session.
