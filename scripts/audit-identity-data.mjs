import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const cwd = process.cwd();
const outputArg = process.argv.find(arg => arg.startsWith('--output='));
const phaseArg = process.argv.find(arg => arg.startsWith('--phase='));
const phase = phaseArg?.slice('--phase='.length) || 'before';
const outputPath = path.resolve(cwd, outputArg?.slice('--output='.length) || 'docs/identity-data-quality-before.json');

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
if (!supabaseUrl || !supabaseKey) throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.');
const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
if (projectRef === 'iwswkepfkzdfytaukrsx') {
  throw new Error('Refusing to audit the production Supabase project.');
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

const normalize = value => String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
const asArray = value => Array.isArray(value) ? value : [];
const asId = value => {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
};

const [ipos, subprojects, activities, partners] = await Promise.all([
  fetchAll('ipos', 'id,name,region'),
  fetchAll('subprojects', 'id,uid,name,ipo_id,indigenousPeopleOrganization,operatingUnit'),
  fetchAll('activities', 'id,uid,type,name,activity_title,participatingIpos,participating_ipo_ids,operatingUnit,fundingYear,date,location,reference_activity_id')
    .catch(async error => {
      if (!/activity_title/i.test(error.message)) throw error;
      return fetchAll('activities', 'id,uid,type,name,participatingIpos,participating_ipo_ids,operatingUnit,fundingYear,date,location,reference_activity_id');
    }),
  fetchAll('marketing_partners', 'id,uid,companyName,marketingLinkages'),
]);

let activityIpoRelationships = [];
let activityIpoJunctionAvailable = true;
try {
  activityIpoRelationships = await fetchAll('activity_ipos', 'activity_id,ipo_id,created_at,created_by');
} catch (error) {
  if (!/activity_ipos|relation .* does not exist|schema cache/i.test(error.message)) throw error;
  activityIpoJunctionAvailable = false;
}

const iposById = new Map(ipos.map(ipo => [Number(ipo.id), ipo]));
const iposByName = new Map();
ipos.forEach(ipo => iposByName.set(normalize(ipo.name), [...(iposByName.get(normalize(ipo.name)) || []), ipo]));

const resolveName = value => {
  const matches = iposByName.get(normalize(value)) || [];
  return matches.length === 1 ? matches[0] : null;
};

const ambiguousIpoNames = Array.from(iposByName.entries())
  .filter(([, matches]) => matches.length > 1)
  .map(([normalizedName, matches]) => ({
    normalizedName,
    records: matches.map(({ id, name, region }) => ({ id, name, region })),
  }));

const subprojectsMissingIpoId = subprojects
  .filter(item => !asId(item.ipo_id))
  .map(item => ({
    id: item.id,
    uid: item.uid,
    name: item.name,
    storedIpoName: item.indigenousPeopleOrganization,
    resolvableIpoId: resolveName(item.indigenousPeopleOrganization)?.id || null,
  }));

const subprojectNameMismatches = subprojects.flatMap(item => {
  const ipo = iposById.get(asId(item.ipo_id));
  if (!ipo || normalize(ipo.name) === normalize(item.indigenousPeopleOrganization)) return [];
  return [{
    id: item.id,
    uid: item.uid,
    linkedIpoId: item.ipo_id,
    linkedIpoName: ipo.name,
    storedIpoName: item.indigenousPeopleOrganization,
  }];
});

const junctionIdsByActivity = new Map();
activityIpoRelationships.forEach(row => {
  const activityId = asId(row.activity_id);
  const ipoId = asId(row.ipo_id);
  if (!activityId || !ipoId) return;
  junctionIdsByActivity.set(activityId, [
    ...(junctionIdsByActivity.get(activityId) || []),
    ipoId,
  ]);
});

const activityRows = activities.map(activity => {
  const legacyIds = asArray(activity.participating_ipo_ids).map(asId).filter(Boolean);
  const legacyNames = asArray(activity.participatingIpos);
  const resolvedNameIds = legacyNames.map(resolveName).filter(Boolean).map(ipo => ipo.id);
  const junctionIds = junctionIdsByActivity.get(asId(activity.id)) || [];
  const fallbackIds = Array.from(new Set([...legacyIds, ...resolvedNameIds]));
  const effectiveIds = junctionIds.length > 0 ? junctionIds : fallbackIds;
  return { activity, legacyIds, legacyNames, junctionIds, fallbackIds, effectiveIds };
});

const activitiesMissingLinkedIpoIds = activityRows
  .filter(({ legacyIds, legacyNames }) => legacyNames.length > 0 && legacyIds.length === 0)
  .map(({ activity, legacyNames, fallbackIds }) => ({
    id: activity.id,
    uid: activity.uid,
    name: activity.name,
    names: legacyNames,
    resolvableIpoIds: fallbackIds,
  }));

const activitiesMissingJunctionLinks = activityRows
  .filter(({ legacyIds, legacyNames, junctionIds }) =>
    activityIpoJunctionAvailable
    && (legacyIds.length > 0 || legacyNames.length > 0)
    && junctionIds.length === 0
  )
  .map(({ activity, legacyIds, legacyNames, fallbackIds }) => ({
    id: activity.id,
    uid: activity.uid,
    title: activity.activity_title || null,
    legacyIds,
    legacyNames,
    resolvableFallbackIds: fallbackIds,
  }));

const unresolvedActivityIpoNames = activityRows.flatMap(({ activity, legacyNames }) =>
  legacyNames
    .filter(name => !resolveName(name))
    .map(name => ({ activityId: activity.id, uid: activity.uid, activityName: activity.name, ipoName: name }))
);

const marketingLinkagesWithoutResolvableIpos = partners.flatMap(partner =>
  asArray(partner.marketingLinkages).flatMap(linkage => {
    const id = asId(linkage.ipoId);
    if ((id && iposById.has(id)) || resolveName(linkage.ipoName)) return [];
    return [{
      partnerId: partner.id,
      partnerUid: partner.uid,
      companyName: partner.companyName,
      linkageId: linkage.id,
      ipoId: linkage.ipoId || null,
      ipoName: linkage.ipoName || '',
    }];
  })
);
const marketingLinkages = partners.flatMap(partner =>
  asArray(partner.marketingLinkages).map(linkage => ({
    partnerId: partner.id,
    ...linkage,
  }))
);

const uidAudit = {};
for (const [entity, rows] of Object.entries({ subprojects, activities, marketingPartners: partners })) {
  const byUid = new Map();
  rows.forEach(row => {
    const uid = String(row.uid || '').trim();
    if (!uid) return;
    byUid.set(uid, [...(byUid.get(uid) || []), row.id]);
  });
  uidAudit[entity] = {
    missing: rows.filter(row => !String(row.uid || '').trim()).map(row => row.id),
    duplicates: Array.from(byUid.entries())
      .filter(([, ids]) => ids.length > 1)
      .map(([uid, ids]) => ({ uid, ids })),
  };
}

const legacyActivitiesWithoutSpecificTitles = activities
  .filter(activity => !String(activity.activity_title || '').trim())
  .map(activity => ({
    id: activity.id,
    uid: activity.uid,
    type: activity.type,
    legacyName: activity.name,
    operatingUnit: activity.operatingUnit,
    targetDate: activity.date,
  }));

const report = {
  generatedAt: new Date().toISOString(),
  environment: {
    supabaseProjectRef: projectRef,
    repository: 'da4kinfoteam-sudo/4kistest',
    mode: `read-only ${phase} audit`,
    activityIpoJunctionAvailable,
  },
  counts: {
    ipos: ipos.length,
    subprojects: subprojects.length,
    activities: activities.length,
    marketingPartners: partners.length,
    marketingLinkages: marketingLinkages.length,
    marketingLinkagesWithImmutableIpoId: marketingLinkages.filter(linkage => {
      const id = asId(linkage.ipoId);
      return id && iposById.has(id);
    }).length,
    activityIpoRelationships: activityIpoRelationships.length,
    activitiesWithSpecificTitles: activities.filter(activity =>
      String(activity.activity_title || '').trim()
    ).length,
  },
  findings: {
    subprojectsMissingIpoId,
    subprojectNameMismatches,
    activitiesMissingLinkedIpoIds,
    activitiesMissingJunctionLinks,
    unresolvedActivityIpoNames,
    ambiguousIpoNames,
    marketingLinkagesWithoutResolvableIpos,
    uidAudit,
    legacyActivitiesWithoutSpecificTitles,
  },
  summary: {
    subprojectsMissingIpoId: subprojectsMissingIpoId.length,
    subprojectNameMismatches: subprojectNameMismatches.length,
    activitiesMissingLinkedIpoIds: activitiesMissingLinkedIpoIds.length,
    activitiesMissingJunctionLinks: activitiesMissingJunctionLinks.length,
    unresolvedActivityIpoNames: unresolvedActivityIpoNames.length,
    ambiguousIpoNames: ambiguousIpoNames.length,
    marketingLinkagesWithoutResolvableIpos: marketingLinkagesWithoutResolvableIpos.length,
    missingUids: Object.values(uidAudit).reduce((sum, item) => sum + item.missing.length, 0),
    duplicateUids: Object.values(uidAudit).reduce((sum, item) => sum + item.duplicates.length, 0),
    legacyActivitiesWithoutSpecificTitles: legacyActivitiesWithoutSpecificTitles.length,
  },
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ output: outputPath, projectRef, summary: report.summary }, null, 2));
