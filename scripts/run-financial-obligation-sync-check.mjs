import assert from 'node:assert/strict';
import {
  replaceAndVerifyFinancialObligationRecords,
} from '../lib/financialObligationPersistence.ts';

const identityKey = ({ entityType, parentId, itemId }) =>
  `${entityType}:${parentId}:${itemId === null ? '<null>' : itemId}`;

class MemoryFinancialObligationPersistence {
  #rows = new Map();
  #nextId = 1;

  async replaceExact(identity, records) {
    this.#rows.set(identityKey(identity), records.map(record => ({
      id: this.#nextId++,
      itemId: identity.itemId,
      ...record,
    })));
  }

  async fetchExact(identity) {
    return structuredClone(this.#rows.get(identityKey(identity)) || []);
  }
}

const persistence = new MemoryFinancialObligationPersistence();
const firstLine = { entityType: 'activity_expense', parentId: 120, itemId: '501' };
const siblingLine = { entityType: 'activity_expense', parentId: 120, itemId: '502' };

await replaceAndVerifyFinancialObligationRecords({
  persistence,
  identity: siblingLine,
  records: [{ date: '2026-04-01', amount: 900, remarks: 'Sibling line' }],
});

let saved = await replaceAndVerifyFinancialObligationRecords({
  persistence,
  identity: firstLine,
  records: [
    { date: '2026-05-01', amount: 100, remarks: 'First entry' },
    { date: '2026-06-01', amount: 250, remarks: 'Second entry' },
  ],
});
assert.deepEqual(saved.map(row => [row.date, row.amount]), [
  ['2026-05-01', 100],
  ['2026-06-01', 250],
]);

saved = await replaceAndVerifyFinancialObligationRecords({
  persistence,
  identity: firstLine,
  records: [
    { date: '2026-05-01', amount: 125, remarks: 'Edited first entry' },
    { date: '2026-06-01', amount: 250, remarks: 'Second entry' },
  ],
});
assert.equal(saved[0].amount, 125);
assert.equal(saved[0].remarks, 'Edited first entry');
assert.equal((await persistence.fetchExact(siblingLine))[0].amount, 900);

saved = await replaceAndVerifyFinancialObligationRecords({
  persistence,
  identity: firstLine,
  records: [{ date: '2026-06-01', amount: 250, remarks: 'Second entry' }],
});
assert.equal(saved.length, 1);
assert.equal(saved[0].date, '2026-06-01');

saved = await replaceAndVerifyFinancialObligationRecords({
  persistence,
  identity: firstLine,
  records: [],
});
assert.deepEqual(saved, []);
assert.equal((await persistence.fetchExact(siblingLine)).length, 1);

const signedLine = { entityType: 'subproject_detail', parentId: 220, itemId: '701' };
saved = await replaceAndVerifyFinancialObligationRecords({
  persistence,
  identity: signedLine,
  records: [
    { date: '2026-07-01', amount: 500, remarks: '' },
    { date: '2026-07-01', amount: -500, remarks: 'Full reversal' },
  ],
});
assert.equal(saved.reduce((sum, row) => sum + row.amount, 0), 0);
assert.equal(saved.length, 2);

const parentOnly = { entityType: 'office_requirement', parentId: 320, itemId: null };
saved = await replaceAndVerifyFinancialObligationRecords({
  persistence,
  identity: parentOnly,
  records: [{ date: '2026-08-01', amount: 300, remarks: '' }],
});
assert.equal(saved[0].itemId, null);

await assert.rejects(
  replaceAndVerifyFinancialObligationRecords({
    persistence,
    identity: { entityType: 'activity_expense', parentId: 120, itemId: null },
    records: [{ date: '2026-08-01', amount: 1, remarks: '' }],
  }),
  /child-line identity is missing/i
);

const noOpPersistence = {
  replaceExact: async () => {},
  fetchExact: async () => [{
    id: 1,
    itemId: '999',
    date: '2026-01-01',
    amount: 50,
    remarks: 'Stale row',
  }],
};
await assert.rejects(
  replaceAndVerifyFinancialObligationRecords({
    persistence: noOpPersistence,
    identity: { entityType: 'activity_expense', parentId: 400, itemId: '999' },
    records: [],
  }),
  /could not be verified after saving/i
);

console.log('Financial obligation synchronization checks passed.');
