import { supabase } from '../supabaseClient';
import { operatingUnits, ouToRegionMap } from '../constants';
import {
  sampleActivities,
  sampleActivityMonitoringActions,
  sampleActivityMonitoringReports,
  sampleBudgetCeilings,
  sampleBudgetItemAdjustmentHistory,
  sampleElcacAreas,
  sampleFinancialDisbursements,
  sampleFinancialObligations,
  sampleGidaAreas,
  sampleMarketingPartners,
  sampleOfficeRequirements,
  sampleOtherProgramExpenses,
  sampleReferenceActivities,
  sampleReferenceParticularList,
  sampleReferenceUacsList,
  sampleRefCommodities,
  sampleRefEquipment,
  sampleRefInfrastructure,
  sampleRefInputs,
  sampleRefLivestock,
  sampleRefTrainings,
  sampleStaffingRequirements,
  sampleSubprojects,
} from '../samples';
import { sampleIPOs } from '../sampleIPOs';
import {
  ActivityIpoRelationship,
  hydrateActivityIpoRelationships,
  hydrateMarketingLinkageRelationships,
  hydrateSubprojectIpoRelationships,
} from './entityIdentity';

export interface DataScope {
  year: string | number;
  operatingUnit: string;
  operatingUnits?: string[];
  tier: string;
  fundType: string;
  canViewAllOus: boolean;
  requestedBy?: string | number | null;
}

export interface ScopedAppData {
  subprojects: any[];
  ipos: any[];
  activities: any[];
  marketingPartners: any[];
  officeReqs: any[];
  staffingReqs: any[];
  otherProgramExpenses: any[];
  financialObligations: any[];
  financialDisbursements: any[];
  referenceUacsList: any[];
  referenceParticularList: any[];
  refCommodities: any[];
  refLivestock: any[];
  refEquipment: any[];
  refInputs: any[];
  refInfrastructure: any[];
  refTrainings: any[];
  referenceActivities: any[];
  deadlines: any[];
  budgetCeilings: any[];
  gidaAreas: any[];
  elcacAreas: any[];
  activityMonitoringReports: any[];
  activityMonitoringActions: any[];
  budgetItemAdjustmentHistory: any[];
}

const PAGE_SIZE = 1000;
const CHUNK_SIZE = 200;
type IpoReferenceSources = {
  subprojects: any[];
  activities: any[];
  activityMonitoringReports: any[];
};

const normalizeOperatingUnitList = (values?: string[]) => {
  if (!Array.isArray(values)) return undefined;
  return Array.from(new Set(values.filter(value => operatingUnits.includes(value)))).sort();
};

const getScopedOperatingUnits = (scope: DataScope): string[] | null => {
  const selected = normalizeOperatingUnitList(scope.operatingUnits);
  if (selected) return selected;
  if (!isAll(scope.operatingUnit)) return [scope.operatingUnit];
  return null;
};

export const normalizeDataScope = (scope: DataScope, fallbackOu?: string): DataScope => {
  const lockedOu = !scope.canViewAllOus;
  const lockedOperatingUnit = fallbackOu || scope.operatingUnit;
  const selectedOperatingUnits = lockedOu
    ? (lockedOperatingUnit ? [lockedOperatingUnit] : undefined)
    : normalizeOperatingUnitList(scope.operatingUnits);
  return {
    ...scope,
    year: scope.year || new Date().getFullYear().toString(),
    operatingUnit: lockedOu ? (lockedOperatingUnit || 'All') : (scope.operatingUnit || 'All'),
    operatingUnits: selectedOperatingUnits,
    tier: scope.tier || 'Tier 1',
    fundType: scope.fundType || 'Current',
  };
};

export const getDataScopeKey = (scope: DataScope) => [
  scope.year || 'All',
  scope.operatingUnit || 'All',
  normalizeOperatingUnitList(scope.operatingUnits)?.join(',') ?? 'legacy-ou',
  scope.tier || 'All',
  scope.fundType || 'All',
  scope.canViewAllOus ? 'all-ou' : 'own-ou',
  scope.requestedBy || 'anonymous',
].join('|');

const isAll = (value: unknown) => value === undefined || value === null || value === '' || value === 'All';

async function fetchQuery(query: any): Promise<any[]> {
  let allData: any[] = [];
  let from = 0;
  let more = true;

  while (more) {
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw error;

    if (data?.length) {
      allData = allData.concat(data);
      if (data.length < PAGE_SIZE) {
        more = false;
      } else {
        from += PAGE_SIZE;
      }
    } else {
      more = false;
    }
  }

  return allData;
}

function applyCommonScope(query: any, scope: DataScope, yearColumn: 'fundingYear' | 'fundYear') {
  let next = query;
  const scopedOus = getScopedOperatingUnits(scope);
  if (!isAll(scope.year)) next = next.eq(yearColumn, Number(scope.year));
  if (scopedOus) next = next.in('operatingUnit', scopedOus);
  if (!isAll(scope.tier)) next = next.eq('tier', scope.tier);
  if (!isAll(scope.fundType)) next = next.eq('fundType', scope.fundType);
  return next;
}

async function fetchScopedBusinessTable(tableName: string, scope: DataScope, yearColumn: 'fundingYear' | 'fundYear') {
  if (!supabase) return [];
  const scopedOus = getScopedOperatingUnits(scope);
  if (scopedOus && scopedOus.length === 0) return [];
  return fetchQuery(applyCommonScope(
    supabase.from(tableName).select('*').order('id', { ascending: true }),
    scope,
    yearColumn
  ));
}

async function fetchReferenceTable(tableName: string, orderBy = 'id') {
  if (!supabase) return [];
  return fetchQuery(supabase.from(tableName).select('*').order(orderBy, { ascending: true }));
}

async function fetchBudgetCeilings(scope: DataScope) {
  if (!supabase) return [];
  const scopedOus = getScopedOperatingUnits(scope);
  if (scopedOus && scopedOus.length === 0) return [];
  let query = supabase.from('budget_ceilings').select('*');
  if (!isAll(scope.year)) query = query.eq('year', Number(scope.year));
  if (scopedOus) query = query.in('operating_unit', scopedOus);
  return fetchQuery(query);
}

async function fetchScopedIpos(scope: DataScope) {
  if (!supabase) return [];
  const scopedOus = getScopedOperatingUnits(scope);
  if (scopedOus && scopedOus.length === 0) return [];
  let query = supabase.from('ipos').select('*').order('id', { ascending: true });
  if (scopedOus) {
    const targetRegions = Array.from(new Set(scopedOus.map(ou => ouToRegionMap[ou]).filter(Boolean)));
    if (targetRegions.length === 0) return [];
    query = query.in('region', targetRegions);
  }
  return fetchQuery(query);
}

function uniqueStrings(values: unknown[]) {
  return Array.from(new Set(
    values
      .flatMap(value => Array.isArray(value) ? value : [value])
      .map(value => String(value || '').trim())
      .filter(Boolean)
  ));
}

async function fetchRowsByValues(tableName: string, columnName: string, values: Array<number | string>) {
  if (!supabase || values.length === 0) return [];
  const chunks: Array<Array<number | string>> = [];
  for (let index = 0; index < values.length; index += CHUNK_SIZE) {
    chunks.push(values.slice(index, index + CHUNK_SIZE));
  }

  const results = await Promise.all(chunks.map(chunk => fetchQuery(
    supabase
      .from(tableName)
      .select('*')
      .in(columnName, chunk)
      .order('id', { ascending: true })
  )));

  return results.flat();
}

function collectIpoReferences({ subprojects, activities, activityMonitoringReports }: IpoReferenceSources) {
  const ids = uniqueNumbers([
    ...subprojects.map(item => item.ipo_id),
    ...activities.flatMap(item => item.participating_ipo_ids || []),
    ...activityMonitoringReports.map(report => report.ipo_id),
  ]);
  const names = uniqueStrings([
    ...subprojects.map(item => item.indigenousPeopleOrganization),
    ...activities.flatMap(item => item.participatingIpos || []),
  ]);
  return { ids, names };
}

function mergeIpos(baseIpos: any[], extraIpos: any[]) {
  const byId = new Map<number, any>();
  const byName = new Map<string, any>();
  const merged: any[] = [];

  [...baseIpos, ...extraIpos].forEach(ipo => {
    const id = Number(ipo?.id);
    const name = String(ipo?.name || '').trim();
    if (Number.isFinite(id) && byId.has(id)) return;
    if (!Number.isFinite(id) && name && byName.has(name)) return;

    merged.push(ipo);
    if (Number.isFinite(id)) byId.set(id, ipo);
    if (name) byName.set(name, ipo);
  });

  return merged.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

async function enrichScopedIpos(baseIpos: any[], sources: IpoReferenceSources) {
  const { ids, names } = collectIpoReferences(sources);
  const existingIds = new Set(baseIpos.map(ipo => Number(ipo.id)).filter(Number.isFinite));
  const existingNames = new Set(baseIpos.map(ipo => String(ipo.name || '').trim()).filter(Boolean));
  const missingIds = ids.filter(id => !existingIds.has(id));
  const missingNames = names.filter(name => !existingNames.has(name));

  const [iposById, iposByName] = await Promise.all([
    fetchRowsByValues('ipos', 'id', missingIds),
    fetchRowsByValues('ipos', 'name', missingNames),
  ]);

  return mergeIpos(baseIpos, [...iposById, ...iposByName]);
}

async function fetchActivityIpoRelationships(activities: any[]): Promise<ActivityIpoRelationship[]> {
  const activityIds = uniqueNumbers(activities.map(activity => activity.id));
  if (activityIds.length === 0) return [];
  try {
    return await fetchRowsByValues('activity_ipos', 'activity_id', activityIds) as ActivityIpoRelationship[];
  } catch (error: any) {
    // Compatibility with a frontend deployed before the additive migration is applied.
    if (/activity_ipos|does not exist|schema cache/i.test(String(error?.message || error))) return [];
    throw error;
  }
}

function attachJunctionIpoIds(
  activities: any[],
  relationships: ActivityIpoRelationship[]
) {
  const idsByActivity = new Map<number, number[]>();
  relationships.forEach(relationship => {
    const activityId = Number(relationship.activity_id);
    const ipoId = Number(relationship.ipo_id);
    if (!Number.isFinite(activityId) || !Number.isFinite(ipoId)) return;
    idsByActivity.set(activityId, [...(idsByActivity.get(activityId) || []), ipoId]);
  });
  return activities.map(activity => {
    const ids = idsByActivity.get(Number(activity.id));
    return ids?.length ? { ...activity, participating_ipo_ids: ids } : activity;
  });
}

async function fetchScopedMarketingPartners(scope: DataScope) {
  if (!supabase) return [];
  const scopedOus = getScopedOperatingUnits(scope);
  if (scopedOus && scopedOus.length === 0) return [];
  let query = supabase.from('marketing_partners').select('*').order('id', { ascending: true });
  if (scopedOus) {
    const targetRegions = Array.from(new Set(scopedOus.map(ou => ouToRegionMap[ou]).filter(Boolean)));
    if (targetRegions.length === 0) return [];
    query = query.in('region', targetRegions);
  }
  return fetchQuery(query);
}

function uniqueNumbers(values: unknown[]) {
  return Array.from(new Set(values.map(Number).filter(Number.isFinite)));
}

async function fetchFinancialRows(tableName: 'financial_obligations' | 'financial_disbursements', entityType: string, parentIds: number[]) {
  if (!supabase || parentIds.length === 0) return [];
  const chunks: number[][] = [];
  for (let index = 0; index < parentIds.length; index += CHUNK_SIZE) {
    chunks.push(parentIds.slice(index, index + CHUNK_SIZE));
  }

  const results = await Promise.all(chunks.map(chunk => fetchQuery(
    supabase
      .from(tableName)
      .select('*')
      .eq('entity_type', entityType)
      .in('parent_id', chunk)
      .order('id', { ascending: true })
  )));

  return results.flat();
}

async function fetchRowsByIds(tableName: string, columnName: string, ids: number[], extraQuery?: (query: any) => any) {
  if (!supabase || ids.length === 0) return [];
  const chunks: number[][] = [];
  for (let index = 0; index < ids.length; index += CHUNK_SIZE) {
    chunks.push(ids.slice(index, index + CHUNK_SIZE));
  }

  const results = await Promise.all(chunks.map(chunk => {
    let query = supabase
      .from(tableName)
      .select('*')
      .in(columnName, chunk)
      .order('id', { ascending: true });
    if (extraQuery) query = extraQuery(query);
    return fetchQuery(query);
  }));

  return results.flat();
}

async function fetchScopedFinancialRows(
  subprojects: any[],
  activities: any[],
  officeReqs: any[],
  staffingReqs: any[],
  otherProgramExpenses: any[]
) {
  const groups = [
    { entityType: 'subproject_detail', ids: uniqueNumbers(subprojects.map(item => item.id)) },
    { entityType: 'activity_expense', ids: uniqueNumbers(activities.map(item => item.id)) },
    { entityType: 'office_requirement', ids: uniqueNumbers(officeReqs.map(item => item.id)) },
    { entityType: 'staffing_expense', ids: uniqueNumbers(staffingReqs.map(item => item.id)) },
    { entityType: 'other_program_expense', ids: uniqueNumbers(otherProgramExpenses.map(item => item.id)) },
  ];

  const [obligationGroups, disbursementGroups] = await Promise.all([
    Promise.all(groups.map(group => fetchFinancialRows('financial_obligations', group.entityType, group.ids))),
    Promise.all(groups.map(group => fetchFinancialRows('financial_disbursements', group.entityType, group.ids))),
  ]);

  return {
    financialObligations: obligationGroups.flat(),
    financialDisbursements: disbursementGroups.flat(),
  };
}

async function fetchScopedMonitoringRows(activities: any[]) {
  const activityIds = uniqueNumbers(activities.map(item => item.id));
  const activityMonitoringReports = await fetchRowsByIds(
    'activity_monitoring_reports',
    'activity_id',
    activityIds,
    query => query.is('deleted_at', null)
  );
  const reportIds = uniqueNumbers(activityMonitoringReports.map(item => item.id));
  const activityMonitoringActions = await fetchRowsByIds(
    'activity_monitoring_actions',
    'monitoring_report_id',
    reportIds,
    query => query.is('deleted_at', null)
  );

  return {
    activityMonitoringReports,
    activityMonitoringActions,
  };
}

async function fetchBudgetItemAdjustmentHistory(subprojects: any[], activities: any[], staffingReqs: any[]) {
  if (!supabase) return [];
  const groups = [
    { sourceType: 'subproject_detail', ids: uniqueNumbers(subprojects.map(item => item.id)) },
    { sourceType: 'activity_expense', ids: uniqueNumbers(activities.map(item => item.id)) },
    { sourceType: 'staffing_expense', ids: uniqueNumbers(staffingReqs.map(item => item.id)) },
  ];

  try {
    const results = await Promise.all(groups.map(group =>
      fetchRowsByIds(
        'budget_item_adjustment_history',
        'parent_id',
        group.ids,
        query => query.eq('source_type', group.sourceType)
      )
    ));
    return results.flat();
  } catch (error) {
    console.warn('Unable to fetch budget item adjustment history', error);
    return [];
  }
}

function applyLocalCommonScope<T extends Record<string, any>>(
  rows: T[],
  scope: DataScope,
  yearColumn: 'fundingYear' | 'fundYear'
) {
  return rows.filter(row => {
    const scopedOus = getScopedOperatingUnits(scope);
    if (!isAll(scope.year) && Number(row[yearColumn]) !== Number(scope.year)) return false;
    if (scopedOus && !scopedOus.includes(row.operatingUnit)) return false;
    if (!isAll(scope.tier) && row.tier !== scope.tier) return false;
    if (!isAll(scope.fundType) && row.fundType !== scope.fundType) return false;
    return true;
  });
}

function applyLocalIpoScope(scope: DataScope) {
  const scopedOus = getScopedOperatingUnits(scope);
  if (!scopedOus) return sampleIPOs;
  if (scopedOus.length === 0) return [];
  const targetRegions = new Set(scopedOus.map(ou => ouToRegionMap[ou]).filter(Boolean));
  if (targetRegions.size === 0) return [];
  return sampleIPOs.filter(ipo => targetRegions.has(ipo.region));
}

function enrichLocalIpos(baseIpos: any[], sources: IpoReferenceSources) {
  const { ids, names } = collectIpoReferences(sources);
  const referencedIds = new Set(ids);
  const referencedNames = new Set(names);
  const extraIpos = sampleIPOs.filter(ipo =>
    referencedIds.has(Number(ipo.id)) ||
    referencedNames.has(String(ipo.name || '').trim())
  );
  return mergeIpos(baseIpos, extraIpos);
}

function filterLocalBudgetCeilings(scope: DataScope) {
  return sampleBudgetCeilings.filter(row => {
    const scopedOus = getScopedOperatingUnits(scope);
    if (!isAll(scope.year) && Number(row.year) !== Number(scope.year)) return false;
    if (scopedOus && !scopedOus.includes(row.operating_unit)) return false;
    return true;
  });
}

function filterLocalFinancialRows(rows: any[], sourceRows: {
  subprojects: any[];
  activities: any[];
  officeReqs: any[];
  staffingReqs: any[];
  otherProgramExpenses: any[];
}) {
  const scopedParents = new Map<string, Set<number>>();
  [
    ['subproject_detail', sourceRows.subprojects],
    ['activity_expense', sourceRows.activities],
    ['office_requirement', sourceRows.officeReqs],
    ['staffing_expense', sourceRows.staffingReqs],
    ['other_program_expense', sourceRows.otherProgramExpenses],
  ].forEach(([entityType, parents]) => {
    scopedParents.set(String(entityType), new Set((parents as any[]).map(parent => Number(parent.id))));
  });

  return rows.filter(row => scopedParents.get(row.entity_type)?.has(Number(row.parent_id)));
}

function filterLocalMonitoringRows(activities: any[]) {
  const activityIds = new Set(activities.map(item => Number(item.id)));
  const activityMonitoringReports = sampleActivityMonitoringReports.filter(report => activityIds.has(Number(report.activity_id)));
  const reportIds = new Set(activityMonitoringReports.map(report => Number(report.id)));
  const activityMonitoringActions = sampleActivityMonitoringActions.filter(action => reportIds.has(Number(action.monitoring_report_id)));

  return {
    activityMonitoringReports,
    activityMonitoringActions,
  };
}

function filterLocalAdjustmentHistory(subprojects: any[], activities: any[], staffingReqs: any[]) {
  const scopedParents = new Map<string, Set<number>>([
    ['subproject_detail', new Set(subprojects.map(item => Number(item.id)))],
    ['activity_expense', new Set(activities.map(item => Number(item.id)))],
    ['staffing_expense', new Set(staffingReqs.map(item => Number(item.id)))],
  ]);

  return sampleBudgetItemAdjustmentHistory.filter(row => scopedParents.get(row.source_type)?.has(Number(row.parent_id)));
}

function loadLocalSeedScopedData(scope: DataScope): ScopedAppData {
  const normalizedScope = normalizeDataScope(scope);
  const subprojects = applyLocalCommonScope(sampleSubprojects, normalizedScope, 'fundingYear');
  const baseIpos = applyLocalIpoScope(normalizedScope);
  const activities = applyLocalCommonScope(sampleActivities, normalizedScope, 'fundingYear');
  const marketingPartners = sampleMarketingPartners;
  const officeReqs = applyLocalCommonScope(sampleOfficeRequirements, normalizedScope, 'fundYear');
  const staffingReqs = applyLocalCommonScope(sampleStaffingRequirements, normalizedScope, 'fundYear');
  const otherProgramExpenses = applyLocalCommonScope(sampleOtherProgramExpenses, normalizedScope, 'fundYear');
  const financialSourceRows = {
    subprojects,
    activities,
    officeReqs,
    staffingReqs,
    otherProgramExpenses,
  };
  const { activityMonitoringReports, activityMonitoringActions } = filterLocalMonitoringRows(activities);
  const ipos = enrichLocalIpos(baseIpos, { subprojects, activities, activityMonitoringReports });
  const hydratedSubprojects = hydrateSubprojectIpoRelationships(subprojects, ipos);
  const hydratedActivities = hydrateActivityIpoRelationships(activities, ipos);
  const hydratedMarketingPartners = hydrateMarketingLinkageRelationships(marketingPartners, ipos);

  return {
    subprojects: hydratedSubprojects,
    ipos,
    activities: hydratedActivities,
    marketingPartners: hydratedMarketingPartners,
    officeReqs,
    staffingReqs,
    otherProgramExpenses,
    financialObligations: filterLocalFinancialRows(sampleFinancialObligations, financialSourceRows),
    financialDisbursements: filterLocalFinancialRows(sampleFinancialDisbursements, financialSourceRows),
    referenceUacsList: sampleReferenceUacsList,
    referenceParticularList: sampleReferenceParticularList,
    refCommodities: sampleRefCommodities,
    refLivestock: sampleRefLivestock,
    refEquipment: sampleRefEquipment,
    refInputs: sampleRefInputs,
    refInfrastructure: sampleRefInfrastructure,
    refTrainings: sampleRefTrainings,
    referenceActivities: sampleReferenceActivities,
    deadlines: [],
    budgetCeilings: filterLocalBudgetCeilings(normalizedScope),
    gidaAreas: sampleGidaAreas,
    elcacAreas: sampleElcacAreas,
    activityMonitoringReports,
    activityMonitoringActions,
    budgetItemAdjustmentHistory: filterLocalAdjustmentHistory(subprojects, activities, staffingReqs),
  };
}

export async function loadScopedAppData(scope: DataScope): Promise<ScopedAppData> {
  const normalizedScope = normalizeDataScope(scope);
  if (!supabase) {
    return loadLocalSeedScopedData(normalizedScope);
  }

  const [
    subprojects,
    baseIpos,
    activities,
    marketingPartners,
    officeReqs,
    staffingReqs,
    otherProgramExpenses,
    referenceUacsList,
    referenceParticularList,
    refCommodities,
    refLivestock,
    refEquipment,
    refInputs,
    refInfrastructure,
    refTrainings,
    referenceActivities,
    deadlines,
    budgetCeilings,
    gidaAreas,
    elcacAreas,
  ] = await Promise.all([
    fetchScopedBusinessTable('subprojects', normalizedScope, 'fundingYear'),
    fetchScopedIpos(normalizedScope),
    fetchScopedBusinessTable('activities', normalizedScope, 'fundingYear'),
    fetchScopedMarketingPartners(normalizedScope),
    fetchScopedBusinessTable('office_requirements', normalizedScope, 'fundYear'),
    fetchScopedBusinessTable('staffing_requirements', normalizedScope, 'fundYear'),
    fetchScopedBusinessTable('other_program_expenses', normalizedScope, 'fundYear'),
    fetchReferenceTable('reference_uacs'),
    fetchReferenceTable('reference_particulars'),
    fetchReferenceTable('ref_commodities'),
    fetchReferenceTable('ref_livestock'),
    fetchReferenceTable('ref_equipment'),
    fetchReferenceTable('ref_inputs'),
    fetchReferenceTable('ref_infrastructure'),
    fetchReferenceTable('ref_trainings'),
    fetchReferenceTable('reference_activities'),
    fetchReferenceTable('deadlines', 'date'),
    fetchBudgetCeilings(normalizedScope),
    fetchReferenceTable('gida_areas'),
    fetchReferenceTable('elcac_areas'),
  ]);

  const [
    { financialObligations, financialDisbursements },
    { activityMonitoringReports, activityMonitoringActions },
    budgetItemAdjustmentHistory,
    activityIpoRelationships,
  ] = await Promise.all([
    fetchScopedFinancialRows(
      subprojects,
      activities,
      officeReqs,
      staffingReqs,
      otherProgramExpenses
    ),
    fetchScopedMonitoringRows(activities),
    fetchBudgetItemAdjustmentHistory(subprojects, activities, staffingReqs),
    fetchActivityIpoRelationships(activities),
  ]);
  const activitiesWithRelationshipIds = attachJunctionIpoIds(activities, activityIpoRelationships);
  const ipos = await enrichScopedIpos(baseIpos, {
    subprojects,
    activities: activitiesWithRelationshipIds,
    activityMonitoringReports,
  });
  const hydratedSubprojects = hydrateSubprojectIpoRelationships(subprojects, ipos);
  const hydratedActivities = hydrateActivityIpoRelationships(
    activitiesWithRelationshipIds,
    ipos,
    activityIpoRelationships
  );
  const hydratedMarketingPartners = hydrateMarketingLinkageRelationships(marketingPartners, ipos);

  return {
    subprojects: hydratedSubprojects,
    ipos,
    activities: hydratedActivities,
    marketingPartners: hydratedMarketingPartners,
    officeReqs,
    staffingReqs,
    otherProgramExpenses,
    financialObligations,
    financialDisbursements,
    referenceUacsList,
    referenceParticularList,
    refCommodities,
    refLivestock,
    refEquipment,
    refInputs,
    refInfrastructure,
    refTrainings,
    referenceActivities,
    deadlines,
    budgetCeilings,
    gidaAreas,
    elcacAreas,
    activityMonitoringReports,
    activityMonitoringActions,
    budgetItemAdjustmentHistory,
  };
}
