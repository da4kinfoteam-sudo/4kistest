import { Activity, ActivityMonitoringAction, ActivityMonitoringReport, IPO, normalizeRegionName, ouToRegionMap, Subproject, User } from '../constants';
import { supabase } from '../supabaseClient';

export interface IpoLinkedDcfRecords {
  subprojects: Subproject[];
  trainings: Activity[];
  monitoringActivities: Activity[];
  monitoringReports: ActivityMonitoringReport[];
  monitoringActions: ActivityMonitoringAction[];
}

const isAdminRole = (role?: string) => role === 'Super Admin' || role === 'Administrator';

const isMissingColumnError = (error: any) => {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === 'PGRST204'
    || error?.code === 'PGRST205'
    || error?.code === '42703'
    || error?.code === '42P01'
    || message.includes('column')
    || message.includes('does not exist')
    || message.includes('schema cache');
};

const isRecoverableOptionalFilterError = (error: any) => {
  const message = String(error?.message || '').toLowerCase();
  return isMissingColumnError(error) ||
    message.includes('invalid input syntax for type json') ||
    message.includes('malformed array literal') ||
    message.includes('operator does not exist');
};

const fetchQuery = async (query: any, optionalColumn = false) => {
  const { data, error } = await query;
  if (error) {
    if (optionalColumn && isMissingColumnError(error)) {
      console.warn('Skipping IPO linked-record query because an optional column is unavailable:', error.message);
      return [];
    }
    throw error;
  }
  return data || [];
};

const fetchOptionalQuery = async <T,>(query: any, label: string): Promise<T[] | null> => {
  const { data, error } = await query;
  if (error) {
    if (isRecoverableOptionalFilterError(error)) {
      console.warn(`Skipping IPO linked-record optional query (${label}):`, error.message);
      return null;
    }
    throw error;
  }
  return (data || []) as T[];
};

const mergePreferFirstById = <T extends { id: number }>(...groups: T[][]) => {
  const byId = new Map<number, T>();
  groups.flat().forEach(item => {
    const id = Number(item.id);
    if (!Number.isFinite(id) || byId.has(id)) return;
    byId.set(id, item);
  });
  return Array.from(byId.values()).sort((a, b) => Number(a.id) - Number(b.id));
};

const filterByUserVisibility = <T extends { operatingUnit?: string }>(rows: T[], currentUser: User | null | undefined) => {
  if (!currentUser || isAdminRole(currentUser.role)) return rows;
  const scope = currentUser.visibility_scope || 'All OUs';
  if (scope === 'All OUs') return rows;
  return rows.filter(row => row.operatingUnit === currentUser.operatingUnit);
};

const toNumericIds = (values: unknown[]) => Array.from(new Set(values.map(Number).filter(Number.isFinite)));

const normalizeComparableText = (value: unknown) => String(value || '').trim().toLowerCase();

const activityIncludesIpo = (activity: Activity, ipoId: number, ipoName: string) => {
  const idMatches = (activity.participating_ipo_ids || []).map(Number).includes(ipoId);
  if (idMatches) return true;

  const targetName = normalizeComparableText(ipoName);
  const rawNames = activity.participatingIpos;
  const names = Array.isArray(rawNames)
    ? rawNames
    : String(rawNames || '').split(/[;,]/);

  return names.some(name => normalizeComparableText(name) === targetName);
};

const getLikelyOperatingUnits = (ipo: IPO, currentUser?: User | null) => {
  const units = new Set<string>();
  if (currentUser && !isAdminRole(currentUser.role) && currentUser.visibility_scope !== 'All OUs' && currentUser.operatingUnit) {
    units.add(currentUser.operatingUnit);
  }

  const normalizedIpoRegion = normalizeRegionName(ipo.region || '');
  Object.entries(ouToRegionMap).forEach(([ou, region]) => {
    if (normalizeRegionName(region) === normalizedIpoRegion) units.add(ou);
  });

  return Array.from(units);
};

const fetchActivityFallbackCandidates = async (ipo: IPO, currentUser?: User | null) => {
  if (!supabase) return [];
  const likelyOperatingUnits = getLikelyOperatingUnits(ipo, currentUser);
  if (likelyOperatingUnits.length === 0) return [];

  const { data, error } = await supabase
    .from('activities')
    .select('*')
    .in('operatingUnit', likelyOperatingUnits)
    .order('id', { ascending: true });
  if (error) throw error;

  return ((data || []) as Activity[]).filter(activity =>
    activityIncludesIpo(activity, Number(ipo.id), String(ipo.name || '').trim())
  );
};

const fetchActionsForReports = async (reports: ActivityMonitoringReport[]) => {
  const reportIds = toNumericIds(reports.map(report => report.id));
  if (!supabase || reportIds.length === 0) return [];
  return fetchQuery(
    supabase
      .from('activity_monitoring_actions')
      .select('*')
      .in('monitoring_report_id', reportIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
  ) as Promise<ActivityMonitoringAction[]>;
};

export const emptyIpoLinkedDcfRecords = (): IpoLinkedDcfRecords => ({
  subprojects: [],
  trainings: [],
  monitoringActivities: [],
  monitoringReports: [],
  monitoringActions: [],
});

export async function fetchIpoLinkedDcfRecords(ipo: IPO, currentUser?: User | null): Promise<IpoLinkedDcfRecords> {
  if (!supabase || !ipo?.id) return emptyIpoLinkedDcfRecords();

  const ipoId = Number(ipo.id);
  const ipoName = String(ipo.name || '').trim();

  const [
    idMatchedSubprojects,
    nameMatchedSubprojects,
    junctionRowsResult,
    idMatchedActivitiesResult,
    nameMatchedActivitiesResult,
  ] = await Promise.all([
    fetchQuery(
      supabase
        .from('subprojects')
        .select('*')
        .eq('ipo_id', ipoId)
        .order('id', { ascending: true }),
      true
    ) as Promise<Subproject[]>,
    ipoName
      ? fetchQuery(
        supabase
          .from('subprojects')
          .select('*')
          .eq('indigenousPeopleOrganization', ipoName)
          .order('id', { ascending: true })
      ) as Promise<Subproject[]>
      : Promise.resolve([]),
    fetchOptionalQuery<{ activity_id: number }>(
      supabase
        .from('activity_ipos')
        .select('activity_id')
        .eq('ipo_id', ipoId),
      'activity_ipos.ipo_id'
    ),
    fetchOptionalQuery<Activity>(
      supabase
        .from('activities')
        .select('*')
        .contains('participating_ipo_ids', [ipoId])
        .order('id', { ascending: true }),
      'activities.participating_ipo_ids'
    ),
    ipoName
      ? fetchOptionalQuery<Activity>(
        supabase
          .from('activities')
          .select('*')
          .contains('participatingIpos', [ipoName])
          .order('id', { ascending: true }),
        'activities.participatingIpos'
      )
      : Promise.resolve([]),
  ]);

  const junctionActivityIds = toNumericIds((junctionRowsResult || []).map(row => row.activity_id));
  const junctionMatchedActivities = junctionActivityIds.length > 0
    ? await fetchQuery(
      supabase
        .from('activities')
        .select('*')
        .in('id', junctionActivityIds)
        .order('id', { ascending: true })
    ) as Activity[]
    : [];

  const fallbackActivities = idMatchedActivitiesResult === null || nameMatchedActivitiesResult === null
    ? await fetchActivityFallbackCandidates(ipo, currentUser)
    : [];
  const idMatchedActivities = idMatchedActivitiesResult || [];
  const nameMatchedActivities = nameMatchedActivitiesResult || [];

  const linkedSubprojects = filterByUserVisibility(
    mergePreferFirstById(idMatchedSubprojects, nameMatchedSubprojects),
    currentUser
  );
  const linkedActivities = filterByUserVisibility(
    mergePreferFirstById(junctionMatchedActivities, idMatchedActivities, nameMatchedActivities, fallbackActivities),
    currentUser
  );
  const linkedTrainings = linkedActivities.filter(activity => activity.type === 'Training');

  const linkedActivityIds = new Set(linkedActivities.map(activity => Number(activity.id)));
  const reports = (await fetchQuery(
    supabase
      .from('activity_monitoring_reports')
      .select('*')
      .eq('ipo_id', ipoId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
  ) as ActivityMonitoringReport[]).filter(report => linkedActivityIds.has(Number(report.activity_id)));

  return {
    subprojects: linkedSubprojects,
    trainings: linkedTrainings,
    monitoringActivities: linkedActivities,
    monitoringReports: reports,
    monitoringActions: await fetchActionsForReports(reports),
  };
}
