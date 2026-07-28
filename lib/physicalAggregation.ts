import { ouToRegionMap } from '../constants';
import type { Activity, IPO, OfficeRequirement, StaffingRequirement, Subproject } from '../constants';
import { getActivityIpoIds, getSubprojectIpoId } from './entityIdentity';

type YearFilter = string | 'All';

export interface PhysicalAggregationFilters {
    year: YearFilter;
    operatingUnit?: string | 'All';
    tier?: string | 'All';
    fundType?: string | 'All';
    includeUnapproved?: boolean;
}

export interface HomepagePhysicalStats {
    subprojects: { target: number; actual: number };
    trainings: { target: number; actual: number };
    iposAssisted: { target: number; actual: number };
    iposWithSp: { target: number; actual: number };
    adsAssisted: { target: number; actual: number };
}

export interface PhysicalAggregationInput {
    subprojects: Subproject[];
    ipos: IPO[];
    activities: Activity[];
    officeReqs?: OfficeRequirement[];
    staffingReqs?: StaffingRequirement[];
}

type ScopedRecord = {
    workflow_status?: string;
    fundingYear?: number;
    fundYear?: number;
    operatingUnit?: string;
    tier?: string;
    fundType?: string;
    isRealignment?: boolean;
    isSavings?: boolean;
    status?: string;
};

const getRecordYear = (record: ScopedRecord) => record.fundingYear ?? record.fundYear;

const matchesSelectedYear = (value: string | number | undefined, selectedYear: YearFilter) => {
    if (selectedYear === 'All') return true;
    return value?.toString() === selectedYear;
};

const getDateYear = (date?: string) => {
    if (!date) return undefined;
    const parsed = new Date(date);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.getFullYear().toString();
};

const isApproved = (record: ScopedRecord, includeUnapproved?: boolean) => {
    if (includeUnapproved) return true;
    return !record.workflow_status || record.workflow_status === 'APPROVED';
};

const matchesBaseFilters = (record: ScopedRecord, filters: PhysicalAggregationFilters) => {
    if (!isApproved(record, filters.includeUnapproved)) return false;
    if (filters.operatingUnit && filters.operatingUnit !== 'All' && record.operatingUnit !== filters.operatingUnit) return false;
    if (filters.tier && filters.tier !== 'All' && record.tier !== filters.tier) return false;
    if (filters.fundType && filters.fundType !== 'All' && record.fundType !== filters.fundType) return false;
    return true;
};

const isTargetRecord = (record: ScopedRecord, filters: PhysicalAggregationFilters) => {
    if (!matchesBaseFilters(record, filters)) return false;
    if (record.status === 'Cancelled') return false;
    if (record.isRealignment || record.isSavings) return false;
    return matchesSelectedYear(getRecordYear(record), filters.year);
};

const isActualRecord = (record: ScopedRecord, actualDate: string | undefined, filters: PhysicalAggregationFilters) => {
    if (!matchesBaseFilters(record, filters)) return false;
    if (record.status === 'Cancelled') return false;
    if (filters.year === 'All') return true;
    return matchesSelectedYear(getRecordYear(record), filters.year) && getDateYear(actualDate) === filters.year;
};

const hasCompletedSubproject = (subproject: Subproject) => subproject.status === 'Completed' && !!subproject.actualCompletionDate;

const hasCompletedActivity = (activity: Activity) => activity.status === 'Completed' && !!activity.actualDate;

const getVisibleIpoRegistry = (ipos: IPO[], filters: PhysicalAggregationFilters) => {
    return (ipos || []).filter(ipo => {
        if (!isApproved(ipo, filters.includeUnapproved)) return false;
        if (filters.operatingUnit && filters.operatingUnit !== 'All') {
            const targetRegion = ouToRegionMap[filters.operatingUnit];
            return !targetRegion || ipo.region === targetRegion;
        }
        return true;
    });
};

const getAds = (ipoIds: Set<number>, ipoRegistry: Map<number, IPO>) => {
    const ads = new Set<string>();
    ipoIds.forEach(id => {
        const ipo = ipoRegistry.get(id);
        if (ipo?.ancestralDomainNo) ads.add(ipo.ancestralDomainNo);
    });
    return ads;
};

export const aggregateHomepagePhysicalStats = (
    data: PhysicalAggregationInput,
    filters: PhysicalAggregationFilters
): HomepagePhysicalStats => {
    const targetSubprojects = (data.subprojects || []).filter(subproject => isTargetRecord(subproject, filters));
    const actualSubprojects = (data.subprojects || []).filter(subproject =>
        hasCompletedSubproject(subproject) && isActualRecord(subproject, subproject.actualCompletionDate, filters)
    );

    const trainings = (data.activities || []).filter(activity => activity.type === 'Training');
    const targetTrainings = trainings.filter(training => isTargetRecord(training, filters));
    const actualTrainings = trainings.filter(training =>
        hasCompletedActivity(training) && isActualRecord(training, training.actualDate, filters)
    );

    const targetIposWithSp = new Set<number>();
    targetSubprojects.forEach(subproject => {
        const ipoId = getSubprojectIpoId(subproject, data.ipos);
        if (ipoId) targetIposWithSp.add(Number(ipoId));
    });

    const actualIposWithSp = new Set<number>();
    actualSubprojects.forEach(subproject => {
        const ipoId = getSubprojectIpoId(subproject, data.ipos);
        if (ipoId) actualIposWithSp.add(Number(ipoId));
    });

    const targetIposWithTr = new Set<number>();
    targetTrainings.forEach(training => getActivityIpoIds(training, data.ipos).forEach(id => targetIposWithTr.add(id)));

    const actualIposWithTr = new Set<number>();
    actualTrainings.forEach(training => getActivityIpoIds(training, data.ipos).forEach(id => actualIposWithTr.add(id)));

    const targetIposAssisted = new Set<number>([
        ...Array.from(targetIposWithSp),
        ...Array.from(targetIposWithTr),
    ]);
    const actualIposAssisted = new Set<number>([
        ...Array.from(actualIposWithSp),
        ...Array.from(actualIposWithTr),
    ]);

    const ipoRegistry = new Map(getVisibleIpoRegistry(data.ipos || [], filters).map(ipo => [Number(ipo.id), ipo]));

    return {
        subprojects: { target: targetSubprojects.length, actual: actualSubprojects.length },
        trainings: { target: targetTrainings.length, actual: actualTrainings.length },
        iposAssisted: { target: targetIposAssisted.size, actual: actualIposAssisted.size },
        iposWithSp: { target: targetIposWithSp.size, actual: actualIposWithSp.size },
        adsAssisted: {
            target: getAds(targetIposAssisted, ipoRegistry).size,
            actual: getAds(actualIposAssisted, ipoRegistry).size,
        },
    };
};
