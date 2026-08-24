# Signed Actual Obligations

Actual obligation records are signed ledger entries. Positive values increase a line's obligated total and negative values reduce it. Negative values are supported only for actual obligations; targets, budgets, allotments, physical accomplishments, and disbursements remain non-negative.

## Rules

- Every actual obligation requires a month and a non-zero amount.
- Negative entries require a reason in `remarks`.
- Monthly, cumulative, fund-year, reporting-year, parent, dashboard, and report totals use the signed sum.
- Record existence is based on obligation rows, not the net total. Offsetting entries that total zero remain visible and editable.
- Existing data is not rewritten by the migration.
- The month lock and existing DCF permissions apply equally to positive and negative entries.

## Production Migration

Run `supabase/migrations/202608030002_signed_actual_obligations.sql`. It only removes check constraints that explicitly require actual-obligation amounts to be greater than or equal to zero. It does not change RLS, disbursement constraints, or existing rows.

## 4kistest Synchronization

When production fixes are synchronized into `4kistest`, include:

- the migration above;
- `lib/financialObligationUtils.ts`;
- signed-input changes in obligation editors and Financial ACF;
- signed record-presence, financial audit, dashboard, report, and export changes;
- the verification script and QA cases for positive, negative, zero-net, and negative-net totals.
