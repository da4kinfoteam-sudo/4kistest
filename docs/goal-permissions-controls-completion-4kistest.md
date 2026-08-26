# Goal: Complete and Verify Centralized Permissions, DCF, Workflow, and Security Controls in 4kistest

## Objective

Complete every accepted requirement, intended change, confirmed hierarchy decision, and accepted recommendation in:

`C:\Users\joelm\Documents\Codex\4K Information System\Testing\Reference\4kistest_permissions_controls_audit.xlsx`

Implement and verify the result in the isolated `4kistest` repository and Supabase project. The goal is complete only when every applicable workbook row is either `Completed` or the explicitly deferred item is `Deferred — Interim Safeguard Complete`; no accepted row may remain `Partial` or `Blocked`.

Promotion is part of this goal, but is restricted to `4kistest.vercel.app`. Do not modify, migrate, or promote to `4kis.vercel.app` or its production Supabase project.

## Source of truth and traceability

Before editing code, read every workbook sheet:

- `00 Overview`
- `01 Page Controls`
- `02 Role Rules`
- `03 DCF Rules`
- `04 Workflow`
- `05 Status Controls`
- `06 Data Visibility`
- `07 User Security`
- `08 Findings & Decisions`
- `09 Control Hierarchy`

Treat the user’s confirmed decisions, intended changes, and hierarchy answers as authoritative. Create a traceability matrix mapping every applicable row to its implementation location, frontend check, backend/RPC/database enforcement, automated test, live 4kistest verification, and final workbook status. Do not infer completion from a hidden button, route guard, or client-only check.

Preserve all unrelated redesign work, Drive/media work, routes, data, and existing behavior unless a change is required to enforce a workbook decision.

## Required implementation

### 1. One centralized authorization model

Use one effective-permission resolver for page access, module actions, data scope, workflow, DCF, status, accomplishments, files, Drive, and User Settings.

The effective decision order is:

1. Valid Supabase Auth session and active application account
2. Protected system-role invariants
3. Role defaults and user-specific overrides
4. Page/module View prerequisite
5. Effective OU scope
6. Exact named action capability
7. Workflow authority/state
8. Item/physical status
9. Physical or financial accomplishment rule
10. Accomplishment-period policy
11. Backend enforcement and immutable audit

Enforce these invariants everywhere, including direct REST/RPC/database paths:

- Super Admin is immutable allow-all for ordinary product controls, but remains subject to authentication, account state, schema/integrity checks, last-Super protection, and immutable audit.
- Management and Guest remain read-only.
- A user-specific grant or deny overrides an ordinary role default; an equal-specificity deny wins.
- Missing, stale, invalid, or contradictory policy fails closed.
- View never implies mutation or All-OUs access; no action is inferred from another action.
- Remove remaining page-local role comparisons except protected-role invariants.

### 2. Backend DCF and accomplishment enforcement

For Subprojects, Activities/Trainings, Office Requirements, Staffing Requirements, and Other Program Expenses, every create, edit, delete, import, bulk, target, physical-actual, financial-actual, obligation, and disbursement mutation must re-evaluate the authenticated actor, exact action, OU scope, workflow, item/hiring status, physical-versus-financial type, period, override eligibility, reason, dependencies, and integrity on the server.

Use the following status behavior:

- `Proposed`: configured structural/detail/target/budget/delete actions only.
- `Ongoing`: configured structural actions; physical and financial actuals require independent capabilities.
- `Completed`: lock physical actuals, targets, structural details, budget structure, ordinary status changes, and deletion; continue allowing separately authorized financial obligations/disbursements.
- `Filled`: lock staffing, hiring, and physical fields; continue allowing separately authorized financial obligations/disbursements.
- `Cancelled` and `Unfilled`: block ordinary non-Super writes, including financial writes; permit only configured elevated override with required reason and immutable audit.
- Super Admin can bypass status/period restrictions without a prompt, with an automatic immutable audit event.

Direct table writes must not bypass these rules. Financial posting after physical completion must remain independent from the physical lock.

### 3. One authoritative accomplishment-period policy

Implement one server-side period evaluator using the application Asia/Manila date. It must agree with User Settings preview/runtime behavior and honor enabled state, current month, previous-month grace, grace-day count, closed past months, future restrictions, separate Physical/Financial capabilities, `OverridePeriod`, Administrator/other reasoned overrides, Super Admin automatic bypass, policy version, and immutable audit metadata.

Every physical/financial form, modal, bulk operation, import, and direct backend write must use it.

### 4. Governed deletion and bulk operations

Use explicit entity-specific `Delete` and `DeleteFiles`; never infer delete from Edit. Confirm View, Delete, OU scope, workflow/status restrictions, dependencies, integrity, required reason, and immutable audit for individual and bulk deletion. Bulk operations must pre-classify allowed/blocked records, explain skips, use one governed reason where applicable, avoid repeated prompts, and audit the batch plus affected records. Preserve archive/trash behavior.

### 5. Explicit status transition matrices

In User Settings, create entity-specific transition matrices for Subprojects, Activities/Trainings, Office Requirements, Staffing Requirements, and Other Program Expenses. Each `from → to` rule must define valid transition, required capability, reason requirement, override behavior, and resulting locks.

UI controls, backend commands, manual/derived/automatic/batch/import changes, and Settings-driven changes must use the same matrix. Direct status-column updates must fail when the transition service would reject them. Cancelled/Unfilled require a reason for non-Super users; invalid transitions return a typed, user-readable reason; Super bypasses without prompting but is audited. Status changes must honor workflow revisions.

### 6. Workflow and approver governance

Workflow applies only to Subprojects, Activities/Trainings, Office Requirements, Staffing Requirements, and Other Program Expenses. IPO and Marketing Partners remain outside workflow and may auto-accept permitted changes.

Preserve the confirmed lifecycle: Draft editable by submitter; Pending read-only; Rejected editable/resubmittable; Approved material edits create a revision and require resubmission; financial posting remains separately governed; self-approval is prohibited except the protected Super Admin path; rejection requires a dedicated reason; workflow events/reasons are append-only.

Choose approvers by active `Approve` capability and compatible scope, not role name. Include eligible Focal users, prefer the submitter’s active assignment, use the one configured Administrator fallback only when no applicable assignment exists, reject inactive/out-of-scope/unauthorized/self-assigned approvers, and show orphaned assignments and pending submissions in User Settings.

### 7. Administrator self-escalation protection

Only Super Admin may edit role defaults, protected invariants, Super Admin accounts/scopes/overrides, recovery policy, or the Administrator baseline when the actor is an Administrator. Delegated Administrators may manage only explicitly granted non-Super user profiles, overrides, scopes, approver assignments, and operational settings.

Block delegated Administrators from editing themselves, changing their role/overrides/scope, changing a role default that changes their own authority, granting unowned authority, managing peer/higher Administrators without explicit policy, or altering Super Admin/Management/Guest invariants. Enforce in UI and backend.

### 8. Immutable authorization audit

`authorization_audit_events` is the security audit source of truth; `user_logs` may remain a readable feed only. Every privileged create/edit/delete/clone/import/bulk action, workflow event, manual/derived status change, physical/financial target or actual, obligation/disbursement, period/status override, file/Drive action, permission/role/scope/DCF/status/workflow/settings change, user administration action, and Super bypass must produce an append-only event. Capture actor/Auth ID, actor role, module/action, target, OU, before/after, revision, status, accomplishment month, reason, decision source/result, policy version, server timestamp, and batch metadata where applicable. Required audit failures must fail the transaction rather than be silently ignored.

### 9. Temporary legacy User auto-approval

Keep the exception centrally visible and disabled unless it has an explicit enabled state, role, module list, accountable owner, cutoff date, automatic expiry, immutable audit, and migration report. It must never let a legacy User approve another user. Provide a usable report of active legacy Users, OU, approver, outstanding workflow, target role, migration state, and export if consistent with existing reports.

### 10. Deferred lifecycle safeguards

Keep the full destructive lifecycle redesign deferred, but verify and retain interim safeguards: deactivate instead of delete, preserve ownership/audit identity, revoke access, disable assignments, prevent self-deactivation/self-role changes, protect the last active Super Admin, and restrict protected-account changes to Super Admin. Mark the workbook row `Deferred — Interim Safeguard Complete`.

### 11. Page, data, detail, selector, and export consistency

Reaudit every workbook page. Sidebar, route/direct URL, render, query, detail page, selectors, exports, workflow queues, and mutations must use the same effective permission and OU scope. Dashboard, Program Management, References, Reports, and child pages require their own centrally configured View capabilities. Composite pages (including GAD) follow their confirmed multi-module rule. Homepage remains available to authenticated users but exposes only permitted data. Detail pages, search, relationship selectors, exports, and caches must not broaden visibility; cache keys must include user, policy version, module, and effective scope.

### 12. Preserve Google Drive and file controls

Do not regress the Google Drive Gallery and File Upload Improvements documented in `docs/drive-media-sections.md`. For IPOs, Subprojects, Activities, and applicable GAD evidence, separately enforce ViewFiles, UploadFiles, and DeleteFiles with parent-module and OU scope, authenticated Edge Function identity, client-identity mismatch protection, immutable audit, folder/media metadata, and disconnected test-drive behavior.

## Required verification

Run and pass TypeScript validation, production build, existing authorization/identity/Drive/DCF/financial tests, UI consistency and legacy-style audits, plus direct REST/RPC/database bypass tests.

Test at minimum: Super Admin, Administrator, Focal-User, RFO-User, User, Management, Guest, inactive account, stale/missing policy, user grants/denies, Own OU, All OUs, and out-of-scope records. Exercise independent View/Edit/Delete/DeleteFiles/Approve actions.

For all five DCF entity groups, test every item/workflow status; structural, target, physical, financial, obligation, disbursement, delete; current, grace, closed, and future months; ordinary denial; Administrator/Focal/RFO reasoned overrides; and Super Admin no-prompt automatic bypass. Include direct API attempts.

Test Draft/Pending/Withdraw/Reject-with-reason/Edit-resubmit/Approve/material revision/late financial posting/Focal approval/fallback/missing or inactive/out-of-scope approver/self-approval/Super path and temporary User policy states.

Verify anonymous blocking, inactive-session blocking, read-only ceilings, self-escalation protection, last-Super protection, append-only audits, and no direct bypass of DCF/status/workflow/scope/period/delete/audit controls.

## Workbook completion

Only after implementation and verification, update:

`C:\Users\joelm\Documents\Codex\4K Information System\Testing\Reference\4kistest_permissions_controls_audit.xlsx`

For every row, preserve the original intended-change and decision cells, set status to `Completed`, `Partial`, `Deferred — Interim Safeguard Complete`, or `Blocked`, and add implementation references, automated-test references, live 4kistest results, and any deliberate deviation. Recalculate the Overview metrics and visually verify every sheet. The goal cannot be closed while an accepted or accepted-with-changes row is `Partial` or `Blocked`.

## Promotion gate — 4kistest only

After all accepted rows are complete and all checks pass:

1. Confirm the repository, Vercel project, environment variables, and Supabase project are the isolated 4kistest environment.
2. Confirm no production credentials or data were used.
3. Use the established `promote` workflow.
4. Promote only to `4kistest.vercel.app` and its isolated Supabase project.
5. Verify the deployment is Ready and the canonical alias points to the reviewed commit.
6. Run live authorization, workflow, DCF, period, user-administration, and Drive smoke tests against `4kistest.vercel.app`.
7. Record deployment and verification references in the workbook.

Never promote to `4kis.vercel.app`, modify production Supabase, copy test migrations into production, weaken controls to pass tests, or mark workbook rows complete without evidence.

## Definition of done

This goal is complete only when every accepted workbook requirement and confirmed hierarchy decision is enforced in frontend and backend, all deferred safeguards are verified, direct bypass tests fail safely, required automated and live tests pass, the workbook is accurate, and the reviewed build is Ready at `4kistest.vercel.app` for manual acceptance testing. Production remains untouched.
