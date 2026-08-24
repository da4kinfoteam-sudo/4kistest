# Main Build to 4KISTest Synchronization

## Result

On August 24, 2026, the 4KISTest source was synchronized with the latest committed production source:

- Production repository: `da4kinfoteam-sudo/4K-Information-System`
- Source commit: `364ea3f`
- Source subject: `Expand IPO commodity profiles`
- Test repository: `da4kinfoteam-sudo/4kistest`

The production repository was inspected read-only. Its unrelated uncommitted `sampleIPOs.tsx`, `samples.tsx`, `.agents/`, `.codex-logs/`, and `AGENTS.md` changes were not copied.

## Preserved test-only boundaries

- Vercel project: `4kistest` (`prj_eMoPNzdqAuH5ELkLbzIARwc4qfEj`)
- Supabase project ref: `zojmlmolznkqhxgwthsq`
- Consolidated test schema baseline and synthetic seed data
- Activity Title and immutable entity-ID feature, including ID-first IPO/activity relationships with legacy name fallback
- Test-only data-quality and reversible verification scripts

The production Vercel project, production Supabase project, live rows, production authentication users, and Drive credentials were not modified or copied.

## Main-build parity

The test source now includes all production changes through `364ea3f`, including the latest LOD scoring and override fixes, signed actual obligations, Drive entity-folder identity, financial obligation synchronization, GAD PIMME pages and dashboard integration, refresh-safe navigation, IPO detail table refinements, and expanded IPO commodity profiles.

The intentional application-code divergence remains limited to the test-only Activity Title and immutable entity-ID work. Activity labels use the explicit title when available, while relationship resolution prefers stored entity IDs and retains legacy name matching only as fallback. These integrations were reconciled with the latest production Activity, IPO, dashboard, accomplishment, import/export, marketing, and financial aggregation flows.

## Test backend boundary

The repository contains the production migrations introduced after the prior sync, while preserving the test baseline, synthetic seed migration, and identity migrations. This source synchronization did not execute migrations or redeploy Edge Functions. Applying database or Edge Function changes to the isolated test backend remains a separate reviewed operation.

## Verification

Passed:

- `npm run test:identity`
- `npm run test:financial-breakdown`
- `npm run test:lod-scoring`
- `npm run test:lod-overrides`
- `npm run test:gad-pimme`
- `npm run test:financial-obligation-sync`
- `npm run test:drive-folder-identity`
- `npm run test:signed-obligations`
- `npm run lint`
- `npm run build`

The build completed successfully with the existing large-chunk advisory only. No production repository files, production data, or production deployment configuration were modified.
