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
  outputArg?.slice('--output='.length) || 'docs/identity-rename-verification.json'
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
  throw new Error(`Refusing rename verification against unexpected Supabase project ${projectRef}.`);
}

const client = createClient(supabaseUrl, supabaseKey);
const fetchAll = async (table, columns = '*') => {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from(table).select(columns).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
};
const updateOne = async (table, id, values) => {
  const { error } = await client.from(table).update(values).eq('id', id);
  if (error) throw new Error(`${table} ${id}: ${error.message}`);
};
const asId = value => Number(value);
const stableFinancialRows = rows => rows
  .map(row => ({
    id: asId(row.id),
    entity_type: row.entity_type,
    parent_id: asId(row.parent_id),
    item_id: row.item_id == null ? null : asId(row.item_id),
    amount: Number(row.amount || 0),
  }))
  .sort((left, right) => left.id - right.id);

const [
  initialIpos,
  initialSubprojects,
  initialActivities,
  initialActivityIpos,
  initialPartners,
  initialObligations,
  initialDisbursements,
] = await Promise.all([
  fetchAll('ipos', 'id,name'),
  fetchAll('subprojects', 'id,uid,name,ipo_id,indigenousPeopleOrganization'),
  fetchAll('activities', 'id,uid,name,activity_title'),
  fetchAll('activity_ipos', 'activity_id,ipo_id'),
  fetchAll('marketing_partners', 'id,uid,marketingLinkages'),
  fetchAll('financial_obligations', 'id,entity_type,parent_id,item_id,amount'),
  fetchAll('financial_disbursements', 'id,entity_type,parent_id,item_id,amount'),
]);

const linkedIpoIds = new Set([
  ...initialSubprojects.map(row => asId(row.ipo_id)),
  ...initialActivityIpos.map(row => asId(row.ipo_id)),
  ...initialPartners.flatMap(partner =>
    (Array.isArray(partner.marketingLinkages) ? partner.marketingLinkages : [])
      .map(linkage => asId(linkage.ipoId))
  ),
].filter(Number.isFinite));
const ipoCandidates = initialIpos.filter(ipo => linkedIpoIds.has(asId(ipo.id)));
assert.ok(ipoCandidates.length > 0, 'Seeded test data must include at least one ID-linked IPO.');

const suffix = ` [ID rename check ${Date.now()}]`;
const renamedIpoIds = new Set();
let renamedSubproject = null;
let renamedActivity = null;
let verificationResult;

const subprojectFinancialTypes = new Set(['subproject', 'subproject_detail']);
const activityFinancialTypes = new Set(['activity', 'activity_expense', 'training', 'training_expense']);
const financialRowsFor = (rows, types, parentId) =>
  rows.filter(row => types.has(String(row.entity_type)) && asId(row.parent_id) === asId(parentId));

try {
  for (const ipo of ipoCandidates) {
    await updateOne('ipos', ipo.id, { name: `${ipo.name}${suffix}` });
    renamedIpoIds.add(asId(ipo.id));
  }

  const [renamedIpos, linkedSubprojects, linkedActivityIpos, linkedPartners] = await Promise.all([
    fetchAll('ipos', 'id,name'),
    fetchAll('subprojects', 'id,ipo_id,indigenousPeopleOrganization'),
    fetchAll('activity_ipos', 'activity_id,ipo_id'),
    fetchAll('marketing_partners', 'id,marketingLinkages'),
  ]);
  const renamedIpoById = new Map(renamedIpos.map(ipo => [asId(ipo.id), ipo]));

  ipoCandidates.forEach(original => {
    assert.equal(
      renamedIpoById.get(asId(original.id))?.name,
      `${original.name}${suffix}`,
      `IPO ${original.id} was not renamed for the test.`
    );
  });
  assert.deepEqual(
    linkedSubprojects.map(row => [asId(row.id), asId(row.ipo_id)]).sort(),
    initialSubprojects.map(row => [asId(row.id), asId(row.ipo_id)]).sort(),
    'Subproject ipo_id relationships changed during IPO renames.'
  );
  assert.deepEqual(
    linkedActivityIpos.map(row => [asId(row.activity_id), asId(row.ipo_id)]).sort(),
    initialActivityIpos.map(row => [asId(row.activity_id), asId(row.ipo_id)]).sort(),
    'Activity junction relationships changed during IPO renames.'
  );
  const initialMarketingIds = initialPartners.flatMap(partner =>
    (Array.isArray(partner.marketingLinkages) ? partner.marketingLinkages : [])
      .map(linkage => [asId(partner.id), asId(linkage.ipoId)])
      .filter(([, ipoId]) => Number.isFinite(ipoId))
  ).sort();
  const renamedMarketingIds = linkedPartners.flatMap(partner =>
    (Array.isArray(partner.marketingLinkages) ? partner.marketingLinkages : [])
      .map(linkage => [asId(partner.id), asId(linkage.ipoId)])
      .filter(([, ipoId]) => Number.isFinite(ipoId))
  ).sort();
  assert.deepEqual(
    renamedMarketingIds,
    initialMarketingIds,
    'Marketing Linkage ipoId relationships changed during IPO renames.'
  );

  const subprojectCandidate = initialSubprojects
    .map(row => ({
      row,
      financialCount:
        financialRowsFor(initialObligations, subprojectFinancialTypes, row.id).length
        + financialRowsFor(initialDisbursements, subprojectFinancialTypes, row.id).length,
    }))
    .sort((left, right) => right.financialCount - left.financialCount)[0];
  if (subprojectCandidate?.row) {
    renamedSubproject = subprojectCandidate.row;
    await updateOne('subprojects', renamedSubproject.id, {
      name: `${renamedSubproject.name}${suffix}`,
    });
  }

  const activityCandidate = initialActivities
    .map(row => ({
      row,
      financialCount:
        financialRowsFor(initialObligations, activityFinancialTypes, row.id).length
        + financialRowsFor(initialDisbursements, activityFinancialTypes, row.id).length,
    }))
    .sort((left, right) => right.financialCount - left.financialCount)[0];
  if (activityCandidate?.row) {
    renamedActivity = activityCandidate.row;
    await updateOne('activities', renamedActivity.id, {
      activity_title: `${renamedActivity.activity_title || renamedActivity.name}${suffix}`,
    });
  }

  const [afterObligations, afterDisbursements] = await Promise.all([
    fetchAll('financial_obligations', 'id,entity_type,parent_id,item_id,amount'),
    fetchAll('financial_disbursements', 'id,entity_type,parent_id,item_id,amount'),
  ]);
  if (renamedSubproject) {
    assert.deepEqual(
      stableFinancialRows(financialRowsFor(afterObligations, subprojectFinancialTypes, renamedSubproject.id)),
      stableFinancialRows(financialRowsFor(initialObligations, subprojectFinancialTypes, renamedSubproject.id)),
      'Subproject obligation records changed after renaming the Subproject.'
    );
    assert.deepEqual(
      stableFinancialRows(financialRowsFor(afterDisbursements, subprojectFinancialTypes, renamedSubproject.id)),
      stableFinancialRows(financialRowsFor(initialDisbursements, subprojectFinancialTypes, renamedSubproject.id)),
      'Subproject disbursement records changed after renaming the Subproject.'
    );
  }
  if (renamedActivity) {
    assert.deepEqual(
      stableFinancialRows(financialRowsFor(afterObligations, activityFinancialTypes, renamedActivity.id)),
      stableFinancialRows(financialRowsFor(initialObligations, activityFinancialTypes, renamedActivity.id)),
      'Activity obligation records changed after renaming the Activity.'
    );
    assert.deepEqual(
      stableFinancialRows(financialRowsFor(afterDisbursements, activityFinancialTypes, renamedActivity.id)),
      stableFinancialRows(financialRowsFor(initialDisbursements, activityFinancialTypes, renamedActivity.id)),
      'Activity disbursement records changed after renaming the Activity.'
    );
  }

  verificationResult = {
    result: 'passed',
    renamedIpos: ipoCandidates.map(ipo => ({
      id: asId(ipo.id),
      originalName: ipo.name,
      linkedSubprojects: initialSubprojects.filter(row => asId(row.ipo_id) === asId(ipo.id)).length,
      linkedActivities: initialActivityIpos.filter(row => asId(row.ipo_id) === asId(ipo.id)).length,
      marketingLinkages: initialPartners.flatMap(partner =>
        Array.isArray(partner.marketingLinkages) ? partner.marketingLinkages : []
      ).filter(linkage => asId(linkage.ipoId) === asId(ipo.id)).length,
    })),
    subprojectFinancialIdentity: renamedSubproject ? {
      id: asId(renamedSubproject.id),
      uid: renamedSubproject.uid,
      obligations: financialRowsFor(initialObligations, subprojectFinancialTypes, renamedSubproject.id).length,
      disbursements: financialRowsFor(initialDisbursements, subprojectFinancialTypes, renamedSubproject.id).length,
    } : null,
    activityFinancialIdentity: renamedActivity ? {
      id: asId(renamedActivity.id),
      uid: renamedActivity.uid,
      obligations: financialRowsFor(initialObligations, activityFinancialTypes, renamedActivity.id).length,
      disbursements: financialRowsFor(initialDisbursements, activityFinancialTypes, renamedActivity.id).length,
    } : null,
  };
} finally {
  if (renamedActivity) {
    await updateOne('activities', renamedActivity.id, {
      activity_title: renamedActivity.activity_title,
    });
  }
  if (renamedSubproject) {
    await updateOne('subprojects', renamedSubproject.id, {
      name: renamedSubproject.name,
    });
  }
  for (const ipo of ipoCandidates) {
    if (renamedIpoIds.has(asId(ipo.id))) {
      await updateOne('ipos', ipo.id, { name: ipo.name });
    }
  }
}

const [restoredIpos, restoredSubprojects, restoredActivities] = await Promise.all([
  fetchAll('ipos', 'id,name'),
  fetchAll('subprojects', 'id,name'),
  fetchAll('activities', 'id,activity_title'),
]);
ipoCandidates.forEach(original => {
  assert.equal(
    restoredIpos.find(ipo => asId(ipo.id) === asId(original.id))?.name,
    original.name,
    `IPO ${original.id} was not restored after verification.`
  );
});
if (renamedSubproject) {
  assert.equal(
    restoredSubprojects.find(row => asId(row.id) === asId(renamedSubproject.id))?.name,
    renamedSubproject.name,
    'The Subproject name was not restored after verification.'
  );
}
if (renamedActivity) {
  assert.equal(
    restoredActivities.find(row => asId(row.id) === asId(renamedActivity.id))?.activity_title,
    renamedActivity.activity_title,
    'The Activity Title was not restored after verification.'
  );
}

const report = {
  generatedAt: new Date().toISOString(),
  environment: {
    repository: 'da4kinfoteam-sudo/4kistest',
    supabaseProjectRef: projectRef,
    productionTouched: false,
  },
  ...verificationResult,
  restoration: 'passed',
};
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
