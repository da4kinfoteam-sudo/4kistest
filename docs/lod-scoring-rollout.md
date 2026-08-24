# LOD Scoring Rollout

## Purpose

The `202607310001_lod_scoring_atomic_sync.sql` migration establishes canonical
LOD scoring, answer coverage, effective-state metadata, and transactional saves.
It does not automatically replace historical scores.

## Deployment Order

1. Apply the migration.
2. Review the score audit before changing historical assessments:

   ```sql
   select *
   from public.audit_lod_assessment_scores()
   where needs_repair
   order by assessment_year desc, ipo_id;
   ```

3. Export or otherwise retain the audit result for comparison.
4. Confirm questionnaire weights, choices, and level ranges in LOD Management.
5. Apply recalculation only after the audit has been reviewed:

   ```sql
   select *
   from public.repair_lod_assessment_scores(true)
   where needs_repair;
   ```

6. Run the audit again. A repaired data set should no longer report score,
   computed-level, or answer-coverage differences.

## Production Data Guarantees

- Existing answers are not changed by the migration.
- Existing score and computed-level values are not changed until repair is
  explicitly called with `true`.
- Manual levels, manual-override reasons, dropped flags, remarks, assessor
  metadata, IPO relationships, and assessment years are preserved by repair.
- Deleted or invalid choice references are not guessed. They remain unanswered
  under the current questionnaire and can make an assessment incomplete.
- Legacy manual overrides without a recorded reason receive a clearly labeled
  legacy reason so they remain recoverable.

## Transaction Failure Check

In a non-production database, call `save_lod_assessment` with a choice that does
not belong to the submitted question. The RPC must fail. Verify that the
assessment row and its prior answers remain unchanged. PostgreSQL executes the
function call as one transaction, so the validation exception rolls back its
assessment upsert, answer deletions, answer upserts, and score update together.

## Application Verification

Run:

```text
npm run test:lod-scoring
npm run lint
npm run build
```

Then verify clear-one, clear-all, manual-to-computed transition, retained manual
override, Dropped, Incomplete, and For Assessment states against the migrated
database.
