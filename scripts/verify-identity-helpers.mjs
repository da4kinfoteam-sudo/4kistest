import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const sourcePath = path.resolve(process.cwd(), 'lib/entityIdentity.ts');
const source = await fs.readFile(sourcePath, 'utf8');
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: sourcePath,
});
const identity = await import(
  `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`
);

const duplicateNameIpos = [
  { id: 1, name: 'Shared IPO', region: 'Region I' },
  { id: 2, name: '  shared   ipo ', region: 'Region II' },
  { id: 3, name: 'Renamed IPO', region: 'Region III' },
];

assert.equal(
  identity.resolveIpoByIdOrName(duplicateNameIpos, undefined, 'shared ipo'),
  null,
  'Ambiguous normalized IPO names must not be guessed.'
);
assert.equal(
  identity.resolveIpoByIdOrName(duplicateNameIpos, 2, 'Shared IPO')?.id,
  2,
  'An immutable ID must win even when the stored name is ambiguous.'
);

const renamedSubproject = {
  id: 11,
  ipo_id: 3,
  indigenousPeopleOrganization: 'Previous IPO Name',
};
assert.equal(
  identity.getSubprojectIpoName(renamedSubproject, duplicateNameIpos),
  'Renamed IPO',
  'Subproject display must resolve the current IPO name from ipo_id.'
);

const legacyActivity = {
  id: 21,
  type: 'Activity',
  name: 'Generic Type',
  activity_title: null,
  participating_ipo_ids: [1],
  participatingIpos: ['Shared IPO'],
  location: 'Fallback Location',
  date: '2026-07-28',
};
const hydrated = identity.hydrateActivityIpoRelationships(
  [legacyActivity],
  duplicateNameIpos,
  [{ activity_id: 21, ipo_id: 3 }]
)[0];
assert.deepEqual(
  hydrated.participating_ipo_ids,
  [3],
  'Junction rows must take precedence over legacy Activity IPO IDs.'
);
assert.deepEqual(
  hydrated.participatingIpos,
  ['Renamed IPO'],
  'Activity display names must hydrate from current IPO records.'
);

assert.equal(
  identity.getActivityDisplayTitle({
    ...legacyActivity,
    activity_title: 'Specific Activity Occurrence',
  }),
  'Specific Activity Occurrence',
  'An explicit Activity Title must be the primary display label.'
);
assert.equal(
  identity.getActivityDisplayTitle({
    ...legacyActivity,
    type: 'Training',
    name: 'Specific Legacy Training',
  }),
  'Specific Legacy Training',
  'Legacy Training names must remain a safe title fallback.'
);
const generatedFallback = identity.getActivityDisplayTitle(
  { ...legacyActivity, participating_ipo_ids: [3], participatingIpos: ['Previous IPO Name'] },
  [],
  duplicateNameIpos
);
assert.match(
  generatedFallback,
  /^Generic Type — Renamed IPO — /,
  'Untitled legacy non-training Activities must use the documented display-only fallback.'
);

const duplicate = identity.findDuplicateActivityTitle(
  {
    id: 32,
    activity_title: 'Same Title',
    operatingUnit: 'RPMO 1',
    fundingYear: 2026,
    date: '2026-08-01',
  },
  [{
    id: 31,
    activity_title: ' same  title ',
    operatingUnit: 'RPMO 1',
    fundingYear: 2026,
    date: '2026-08-01',
  }]
);
assert.equal(duplicate?.id, 31, 'Duplicate Activity Titles must be detected within the configured scope.');

const hydratedPartner = identity.hydrateMarketingLinkageRelationships(
  [{
    id: 41,
    marketingLinkages: [{ id: 'link-1', ipoId: 3, ipoName: 'Previous IPO Name' }],
    linkedIpoNames: ['Previous IPO Name'],
  }],
  duplicateNameIpos
)[0];
assert.equal(hydratedPartner.marketingLinkages[0].ipoName, 'Renamed IPO');
assert.deepEqual(hydratedPartner.linkedIpoNames, ['Renamed IPO']);

console.log(JSON.stringify({
  source: sourcePath,
  checks: 10,
  result: 'passed',
}, null, 2));
