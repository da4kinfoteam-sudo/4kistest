import type { Activity, IPO, MarketingPartner, ReferenceActivity, Subproject } from '../constants';

export interface ActivityIpoRelationship {
  activity_id: number;
  ipo_id: number;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
}

export const normalizeEntityName = (value: unknown) =>
  String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();

const asFiniteId = (value: unknown): number | null => {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
};

export const buildIpoIdentityIndex = (ipos: IPO[]) => {
  const byId = new Map<number, IPO>();
  const byName = new Map<string, IPO[]>();

  ipos.forEach(ipo => {
    const id = asFiniteId(ipo.id);
    if (id !== null) byId.set(id, ipo);
    const key = normalizeEntityName(ipo.name);
    if (!key) return;
    byName.set(key, [...(byName.get(key) || []), ipo]);
  });

  return { byId, byName };
};

export const resolveIpoByIdOrName = (
  ipos: IPO[],
  idValue?: unknown,
  nameValue?: unknown
): IPO | null => {
  const index = buildIpoIdentityIndex(ipos);
  const id = asFiniteId(idValue);
  if (id !== null) {
    const byId = index.byId.get(id);
    if (byId) return byId;
  }

  const matches = index.byName.get(normalizeEntityName(nameValue)) || [];
  return matches.length === 1 ? matches[0] : null;
};

export const getSubprojectIpo = (subproject: Subproject, ipos: IPO[]) =>
  resolveIpoByIdOrName(ipos, subproject.ipo_id, subproject.indigenousPeopleOrganization);

export const getSubprojectIpoId = (subproject: Subproject, ipos: IPO[]) =>
  getSubprojectIpo(subproject, ipos)?.id ?? asFiniteId(subproject.ipo_id) ?? undefined;

export const getSubprojectIpoName = (subproject: Subproject, ipos: IPO[]) =>
  getSubprojectIpo(subproject, ipos)?.name || subproject.indigenousPeopleOrganization || '';

export const resolveActivityIpos = (activity: Activity, ipos: IPO[]): IPO[] => {
  const index = buildIpoIdentityIndex(ipos);
  const resolved: IPO[] = [];
  const seen = new Set<number>();

  (activity.participating_ipo_ids || []).forEach(rawId => {
    const id = asFiniteId(rawId);
    const ipo = id === null ? undefined : index.byId.get(id);
    if (!ipo || seen.has(ipo.id)) return;
    seen.add(ipo.id);
    resolved.push(ipo);
  });

  (activity.participatingIpos || []).forEach(name => {
    const matches = index.byName.get(normalizeEntityName(name)) || [];
    if (matches.length !== 1 || seen.has(matches[0].id)) return;
    seen.add(matches[0].id);
    resolved.push(matches[0]);
  });

  return resolved;
};

export const getActivityIpoIds = (activity: Activity, ipos: IPO[]) =>
  resolveActivityIpos(activity, ipos).map(ipo => ipo.id);

export const getActivityIpoNames = (activity: Activity, ipos: IPO[]) => {
  const resolved = resolveActivityIpos(activity, ipos);
  if (resolved.length > 0) return resolved.map(ipo => ipo.name);
  return (activity.participatingIpos || []).filter(Boolean);
};

export const activityIncludesIpo = (activity: Activity, ipo: IPO, ipos: IPO[]) =>
  getActivityIpoIds(activity, ipos).includes(Number(ipo.id));

export const getActivityTypeLabel = (
  activity: Activity,
  referenceActivities: ReferenceActivity[] = []
) => {
  const reference = referenceActivities.find(
    item => String(item.id) === String(activity.reference_activity_id)
  );
  return reference?.activity_name || activity.name || activity.type || 'Activity';
};

const formatTargetDate = (value?: string | null) => {
  if (!value) return 'Date not set';
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

export const getActivityDisplayTitle = (
  activity: Activity,
  referenceActivities: ReferenceActivity[] = [],
  ipos: IPO[] = []
) => {
  const explicitTitle = String(activity.activity_title || '').trim();
  if (explicitTitle) return explicitTitle;
  if (activity.type === 'Training' && String(activity.name || '').trim()) return activity.name.trim();

  const activityType = getActivityTypeLabel(activity, referenceActivities);
  const primaryIpo = getActivityIpoNames(activity, ipos)[0];
  const primaryContext = primaryIpo || String(activity.location || '').trim() || 'Location not set';
  return `${activityType} — ${primaryContext} — ${formatTargetDate(activity.date)}`;
};

export const getActivitySecondaryContext = (
  activity: Activity,
  referenceActivities: ReferenceActivity[] = [],
  ipos: IPO[] = []
) => {
  const activityType = getActivityTypeLabel(activity, referenceActivities);
  const ipoNames = getActivityIpoNames(activity, ipos);
  const relationshipContext = ipoNames[0] || activity.location || 'No IPO or location';
  return `${activityType} · ${formatTargetDate(activity.date)} · ${relationshipContext}`;
};

export const findDuplicateActivityTitle = (
  candidate: Activity,
  activities: Activity[],
  excludedId?: number
) => {
  const title = normalizeEntityName(candidate.activity_title);
  if (!title || !candidate.date || !candidate.operatingUnit || !candidate.fundingYear) return null;
  return activities.find(item =>
    item.id !== excludedId
    && normalizeEntityName(item.activity_title) === title
    && normalizeEntityName(item.operatingUnit) === normalizeEntityName(candidate.operatingUnit)
    && Number(item.fundingYear) === Number(candidate.fundingYear)
    && String(item.date || '').slice(0, 10) === String(candidate.date || '').slice(0, 10)
  ) || null;
};

const arraysEqual = (left: unknown[], right: unknown[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

export const hydrateSubprojectIpoRelationships = (subprojects: Subproject[], ipos: IPO[]) => {
  let changed = false;
  const hydrated = subprojects.map(subproject => {
    const ipo = getSubprojectIpo(subproject, ipos);
    if (!ipo) return subproject;
    if (Number(subproject.ipo_id) === Number(ipo.id)
      && subproject.indigenousPeopleOrganization === ipo.name) return subproject;
    changed = true;
    return {
      ...subproject,
      ipo_id: ipo.id,
      indigenousPeopleOrganization: ipo.name,
    };
  });
  return changed ? hydrated : subprojects;
};

export const hydrateActivityIpoRelationships = (
  activities: Activity[],
  ipos: IPO[],
  junctionRows: ActivityIpoRelationship[] = []
) => {
  const idsByActivity = new Map<number, number[]>();
  junctionRows.forEach(row => {
    const activityId = asFiniteId(row.activity_id);
    const ipoId = asFiniteId(row.ipo_id);
    if (activityId === null || ipoId === null) return;
    idsByActivity.set(activityId, [...(idsByActivity.get(activityId) || []), ipoId]);
  });

  let changed = false;
  const hydrated = activities.map(activity => {
    const junctionIds = idsByActivity.get(Number(activity.id));
    const source = junctionIds?.length
      ? { ...activity, participating_ipo_ids: junctionIds }
      : activity;
    const resolved = resolveActivityIpos(source, ipos);
    if (resolved.length === 0) return activity;

    const ids = resolved.map(ipo => Number(ipo.id));
    const names = resolved.map(ipo => ipo.name);
    const previousIds = (activity.participating_ipo_ids || []).map(Number);
    const previousNames = activity.participatingIpos || [];
    if (arraysEqual(previousIds, ids) && arraysEqual(previousNames, names)) return activity;
    changed = true;
    return {
      ...activity,
      participating_ipo_ids: ids,
      participatingIpos: names,
    };
  });
  return changed ? hydrated : activities;
};

export const hydrateMarketingLinkageRelationships = (
  partners: MarketingPartner[],
  ipos: IPO[]
) => {
  let changed = false;
  const hydrated = partners.map(partner => {
    let partnerChanged = false;
    const linkages = (partner.marketingLinkages || []).map(linkage => {
      const ipo = resolveIpoByIdOrName(ipos, linkage.ipoId, linkage.ipoName);
      if (!ipo || (Number(linkage.ipoId) === Number(ipo.id) && linkage.ipoName === ipo.name)) {
        return linkage;
      }
      partnerChanged = true;
      return { ...linkage, ipoId: ipo.id, ipoName: ipo.name };
    });
    if (!partnerChanged) return partner;
    changed = true;
    return {
      ...partner,
      marketingLinkages: linkages,
      linkedIpoNames: Array.from(new Set(linkages.map(linkage => linkage.ipoName).filter(Boolean))),
    };
  });
  return changed ? hydrated : partners;
};
