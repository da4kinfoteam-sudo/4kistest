import assert from 'node:assert/strict';
import {
    buildLodAdminStateRows,
    buildLodManualOverrideRows,
    buildLodOverrideAuditMetadata,
} from '../lib/lodOverrides.ts';

const rows = buildLodManualOverrideRows([
    { ipoId: 10, year: 2026, level: 4, reason: '  Verified by the national validation team.  ' },
    { ipoId: 11, year: 2026, level: 3, reason: 'Approved correction' },
]);

assert.deepEqual(rows, [
    { ipo_id: 10, year: 2026, manual_level: 4, manual_override_reason: 'Verified by the national validation team.' },
    { ipo_id: 11, year: 2026, manual_level: 3, manual_override_reason: 'Approved correction' },
]);

assert.throws(
    () => buildLodManualOverrideRows([{ ipoId: 10, year: 2026, level: 6, reason: 'Invalid level' }]),
    /level from 1 to 5/i
);
assert.throws(
    () => buildLodManualOverrideRows([{ ipoId: 10, year: 2026, level: 2, reason: ' ' }]),
    /reason/
);
assert.throws(
    () => buildLodManualOverrideRows([
        { ipoId: 10, year: 2026, level: 2, reason: 'One' },
        { ipoId: 10, year: 2026, level: 3, reason: 'Two' },
    ]),
    /duplicate/
);

const audit = buildLodOverrideAuditMetadata({
    ipoId: 10,
    ipoName: 'Sample IPO',
    year: 2026,
    previousAssessment: { manual_level: null, computed_level: 2, is_complete: true },
    newLevel: 4,
    reason: 'Validated correction',
    actorName: 'System Administrator',
    actorRole: 'Super Admin',
    source: 'lod_detail',
});

assert.equal(audit.previous_level, 2);
assert.equal(audit.new_manual_level, 4);
assert.equal(audit.source, 'lod_detail');

assert.deepEqual(buildLodAdminStateRows([
    { ipoId: 10, year: 2026, selection: 4, reason: 'Validated correction' },
    { ipoId: 11, year: 2026, selection: 'carry-over', reason: 'Approved carry over' },
    { ipoId: 12, year: 2026, selection: 'dropped', reason: 'Removed from reporting' },
]), [
    { ipo_id: 10, year: 2026, action: 'manual', manual_level: 4, manual_override_reason: 'Validated correction' },
    { ipo_id: 11, year: 2026, action: 'carry-over', manual_level: null, manual_override_reason: 'Approved carry over' },
    { ipo_id: 12, year: 2026, action: 'dropped', manual_level: null, manual_override_reason: 'Removed from reporting' },
]);

console.log('LOD override checks passed.');
