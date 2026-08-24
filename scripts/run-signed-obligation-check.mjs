import assert from 'node:assert/strict';
import {
  addGroupingSeparators,
  isFormattedAmountDraft,
  parseFormattedAmount,
} from '../lib/formattedAmount.ts';
import {
  bucketActualObligationRecords,
  getActualObligationValidationError,
  hasActualObligationRecords,
  sumActualObligationRecords,
} from '../lib/financialObligationUtils.ts';

assert.equal(isFormattedAmountDraft('-', true), true);
assert.equal(isFormattedAmountDraft('-1,234.56', true), true);
assert.equal(isFormattedAmountDraft('-1', false), false);
assert.equal(isFormattedAmountDraft('1,234.567', true), false);
assert.equal(parseFormattedAmount('-1,234.56'), -1234.56);
assert.equal(addGroupingSeparators('-1234.56'), '-1,234.56');

assert.equal(getActualObligationValidationError([{ date: '2026-06-01', amount: 100 }]), '');
assert.match(getActualObligationValidationError([{ date: '2026-06-01', amount: -20 }]), /reason is required/i);
assert.equal(getActualObligationValidationError([{ date: '2026-06-01', amount: -20, remarks: 'Correction' }]), '');
assert.match(getActualObligationValidationError([{ date: '2026-06-01', amount: 0 }]), /greater than or less than zero/i);

const signedLine = {
  obligations: [
    { date: '2026-06-01', amount: 100, remarks: '' },
    { date: '2026-06-01', amount: -20, remarks: 'Correction' },
    { date: '2026-07-01', amount: -10, remarks: 'Correction' },
  ],
};
assert.equal(sumActualObligationRecords(signedLine.obligations), 70);
assert.deepEqual(bucketActualObligationRecords(
  signedLine.obligations,
  record => Number(String(record.date).slice(5, 7)) - 1
).slice(5, 7), [80, -10]);
assert.equal(sumActualObligationRecords(signedLine.obligations, record => String(record.date).startsWith('2026-06')), 80);

const zeroNetLine = {
  obligations: [
    { date: '2026-06-01', amount: 100 },
    { date: '2026-06-01', amount: -100, remarks: 'Full reversal' },
  ],
};
assert.equal(sumActualObligationRecords(zeroNetLine.obligations), 0);
assert.equal(hasActualObligationRecords(zeroNetLine), true);
assert.equal(hasActualObligationRecords({ actualObligationAmount: -25 }), true);
assert.equal(hasActualObligationRecords({ actualObligationAmount: 0 }), false);

console.log('Signed actual obligation checks passed.');
