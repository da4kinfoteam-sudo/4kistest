import assert from 'node:assert/strict';
import {
    buildFinancialGeographicHierarchy,
    FinancialHierarchyNode,
    getFinancialHierarchyTotals,
} from '../lib/financialBreakdownHierarchy';

const ipos = [
    { id: 1, name: 'IPO A', ancestralDomainNo: 'AD-1' },
    { id: 2, name: 'IPO B', ancestralDomainNo: 'AD-2' },
] as any[];

const line = { id: 1 };
const items = [
    { operatingUnit: 'RPMO 1', location: 'Town 1, Province 1', ipoIds: [1], ipoNames: ['IPO B'], alloc: 100, obli: 70, disb: 50, line },
    { operatingUnit: 'RPMO 1', location: 'Town 1, Province 1', ipoIds: [1, 2], ipoNames: ['IPO A', 'IPO B'], alloc: 200, obli: 120, disb: 90, line },
    { operatingUnit: 'RPMO 1', location: 'Town 2, Province 1', ipoIds: [], ipoNames: [], alloc: 50, obli: 20, disb: 10, line },
    { operatingUnit: 'RPMO 2', location: 'Town 3, Province 2', ipoIds: [], ipoNames: ['IPO B'], alloc: 75, obli: 60, disb: 40, line },
].map((item, index) => ({
    ...item,
    recordId: index + 1,
    sourceType: 'subproject',
    component: 'Production and Livelihood',
    activityName: `Item ${index + 1}`,
    obligationByMonth: Array(12).fill(0),
    disbursementByMonth: Array(12).fill(0),
})) as any[];

const assertNodeReconciliation = (node: FinancialHierarchyNode) => {
    if (node.children.length === 0) return;
    const childTotals = getFinancialHierarchyTotals(node.children);
    assert.equal(childTotals.allocation, node.allocation);
    assert.equal(childTotals.obligation, node.obligation);
    assert.equal(childTotals.disbursement, node.disbursement);
    node.children.forEach(assertNodeReconciliation);
};

const provinceRoots = buildFinancialGeographicHierarchy(items, ipos as any, 'province');
assert.deepEqual(getFinancialHierarchyTotals(provinceRoots), {
    allocation: 425,
    obligation: 270,
    disbursement: 190,
});
provinceRoots.forEach(assertNodeReconciliation);

const provinceOne = provinceRoots.find(node => node.operatingUnit === 'RPMO 1' && node.label === 'Province 1');
assert.ok(provinceOne);
const ipoLabels = provinceOne.children.flatMap(municipality =>
    municipality.children.flatMap(domain => domain.children.map(ipo => ipo.label))
);
assert.ok(ipoLabels.includes('IPO A'), 'ID match must win over a stale legacy name');
assert.ok(ipoLabels.includes('Multiple IPOs'), 'multi-IPO records must use one non-duplicated group');
assert.ok(ipoLabels.includes('Not IPO-Specific'), 'unlinked records need an explicit fallback');

(['municipality', 'ancestralDomain', 'ipo'] as const).forEach(level => {
    const roots = buildFinancialGeographicHierarchy(items, ipos as any, level);
    assert.deepEqual(getFinancialHierarchyTotals(roots), {
        allocation: 425,
        obligation: 270,
        disbursement: 190,
    });
    roots.forEach(assertNodeReconciliation);
});

console.log('Financial breakdown hierarchy checks passed.');
