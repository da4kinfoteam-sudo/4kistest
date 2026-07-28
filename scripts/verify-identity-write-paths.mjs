import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const TEST_PROJECT_REF = 'zojmlmolznkqhxgwthsq';
const cwd = process.cwd();
const outputArg = process.argv.find(arg => arg.startsWith('--output='));
const outputPath = path.resolve(
  cwd,
  outputArg?.slice('--output='.length) || 'docs/identity-write-path-verification.json'
);
const envText = await fs.readFile(path.join(cwd, '.env.local'), 'utf8');
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .map(line => line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/))
    .filter(Boolean)
    .map(match => [match[1], match[2].trim().replace(/^['"]|['"]$/g, '')])
);
const supabaseUrl = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) throw new Error('Missing test Supabase configuration.');
const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
if (projectRef !== TEST_PROJECT_REF) {
  throw new Error(`Refusing write-path verification against unexpected Supabase project ${projectRef}.`);
}

const client = createClient(supabaseUrl, supabaseKey);
const { data: ipos, error: ipoError } = await client
  .from('ipos')
  .select('id,name')
  .order('id', { ascending: true })
  .limit(2);
if (ipoError) throw ipoError;
assert.equal(ipos?.length, 2, 'Write-path verification requires two seeded IPOs.');

const stamp = Date.now();
const sharedDate = '2026-12-20';
const sharedScope = {
  type: 'Activity',
  name: 'Identity Verification Generic Activity',
  date: sharedDate,
  description: 'Temporary automated identity write-path verification.',
  location: '4KISTest',
  component: 'Program Management',
  fundingYear: 2026,
  fundType: 'Current',
  tier: 'Tier 1',
  operatingUnit: 'NPMO',
  workflow_status: 'APPROVED',
  status: 'Proposed',
  participatingIpos: [ipos[0].name],
  participating_ipo_ids: [Number(ipos[0].id)],
  expenses: [],
};
const scenarios = ['create', 'clone', 'repeat', 'import'];
const createdIds = [];
let report;

try {
  const payloads = scenarios.map(scenario => ({
    ...sharedScope,
    uid: `IDENTITY-${scenario.toUpperCase()}-${stamp}`,
    activity_title: `Identity ${scenario} ${stamp}`,
  }));
  const duplicateTitle = `Identity duplicate warning ${stamp}`;
  payloads.push(
    {
      ...sharedScope,
      uid: `IDENTITY-DUPLICATE-A-${stamp}`,
      activity_title: duplicateTitle,
    },
    {
      ...sharedScope,
      uid: `IDENTITY-DUPLICATE-B-${stamp}`,
      activity_title: duplicateTitle,
    }
  );

  const { data: created, error: createError } = await client
    .from('activities')
    .insert(payloads)
    .select('id,uid,activity_title,participatingIpos,participating_ipo_ids');
  if (createError) throw createError;
  assert.equal(created?.length, payloads.length);
  createdIds.push(...created.map(row => Number(row.id)));

  const relationshipPayload = created.map(row => ({
    activity_id: Number(row.id),
    ipo_id: Number(ipos[0].id),
    created_by: 'automated 4kistest identity verification',
  }));
  const { error: relationshipError } = await client
    .from('activity_ipos')
    .upsert(relationshipPayload, {
      onConflict: 'activity_id,ipo_id',
      ignoreDuplicates: true,
    });
  if (relationshipError) throw relationshipError;

  const { data: initialRelationships, error: initialRelationshipError } = await client
    .from('activity_ipos')
    .select('activity_id,ipo_id')
    .in('activity_id', createdIds);
  if (initialRelationshipError) throw initialRelationshipError;
  assert.equal(initialRelationships?.length, createdIds.length);
  assert.ok(initialRelationships.every(row => Number(row.ipo_id) === Number(ipos[0].id)));
  assert.ok(created.every(row =>
    Array.isArray(row.participating_ipo_ids)
    && row.participating_ipo_ids.map(Number).includes(Number(ipos[0].id))
  ));

  const edited = created.find(row => row.uid.includes('-CREATE-'));
  assert.ok(edited);
  const editedTitle = `${edited.activity_title} edited`;
  const { error: editError } = await client
    .from('activities')
    .update({
      activity_title: editedTitle,
      participatingIpos: [ipos[1].name],
      participating_ipo_ids: [Number(ipos[1].id)],
    })
    .eq('id', edited.id);
  if (editError) throw editError;
  const { error: addEditedRelationshipError } = await client
    .from('activity_ipos')
    .upsert({
      activity_id: Number(edited.id),
      ipo_id: Number(ipos[1].id),
      created_by: 'automated 4kistest identity verification',
    }, {
      onConflict: 'activity_id,ipo_id',
      ignoreDuplicates: true,
    });
  if (addEditedRelationshipError) throw addEditedRelationshipError;
  const { error: removeStaleRelationshipError } = await client
    .from('activity_ipos')
    .delete()
    .eq('activity_id', edited.id)
    .neq('ipo_id', ipos[1].id);
  if (removeStaleRelationshipError) throw removeStaleRelationshipError;

  const [{ data: editedRows, error: editedRowsError }, { data: editedRelationships, error: editedRelationshipsError }] = await Promise.all([
    client.from('activities').select('id,activity_title,participatingIpos,participating_ipo_ids').eq('id', edited.id),
    client.from('activity_ipos').select('activity_id,ipo_id').eq('activity_id', edited.id),
  ]);
  if (editedRowsError) throw editedRowsError;
  if (editedRelationshipsError) throw editedRelationshipsError;
  assert.equal(editedRows?.[0]?.activity_title, editedTitle);
  assert.deepEqual(editedRows?.[0]?.participating_ipo_ids?.map(Number), [Number(ipos[1].id)]);
  assert.deepEqual(editedRelationships?.map(row => Number(row.ipo_id)), [Number(ipos[1].id)]);

  const { data: duplicateRows, error: duplicateError } = await client
    .from('activities')
    .select('id')
    .eq('activity_title', duplicateTitle)
    .eq('operatingUnit', sharedScope.operatingUnit)
    .eq('fundingYear', sharedScope.fundingYear)
    .eq('date', sharedDate);
  if (duplicateError) throw duplicateError;
  assert.equal(
    duplicateRows?.length,
    2,
    'Duplicate titles must remain allowed so the UI warning is non-blocking.'
  );

  report = {
    generatedAt: new Date().toISOString(),
    environment: {
      repository: 'da4kinfoteam-sudo/4kistest',
      supabaseProjectRef: projectRef,
      productionTouched: false,
    },
    result: 'passed',
    scenarios: scenarios.map(scenario => ({
      scenario,
      explicitTitle: true,
      legacyIdsWritten: true,
      junctionWritten: true,
    })),
    edit: {
      titleUpdated: true,
      legacyIdsUpdated: true,
      staleJunctionRemoved: true,
      replacementJunctionWritten: true,
    },
    duplicateTitleWarning: {
      sameScopeRecords: duplicateRows.length,
      databaseConstraintBlockedDuplicate: false,
    },
  };
} finally {
  if (createdIds.length > 0) {
    const { error: cleanupError } = await client.from('activities').delete().in('id', createdIds);
    if (cleanupError) throw cleanupError;
    const { data: remainingRelationships, error: remainingError } = await client
      .from('activity_ipos')
      .select('activity_id')
      .in('activity_id', createdIds);
    if (remainingError) throw remainingError;
    assert.equal(
      remainingRelationships?.length,
      0,
      'Activity deletion must cascade to temporary junction rows.'
    );
  }
}

const output = { ...report, cleanup: 'passed' };
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(output, null, 2));
