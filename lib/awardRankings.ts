import {
    IPO,
    OfficeRequirement,
    operatingUnits,
    OtherActivity,
    OtherProgramExpense,
    StaffingRequirement,
    Subproject,
    Training,
} from '../constants';
import { collectFinancialLineItems } from './financialAggregation';
import { getActivityIpoIds, getSubprojectIpoId } from './entityIdentity';

export type AwardPeriod = 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'Year End';
export type AwardQuarter = Exclude<AwardPeriod, 'Year End'>;
export type AwardPhysicalComponentKey = 'socialPrep' | 'productionLivelihood' | 'marketingEnterprise' | 'programManagement';

export interface AwardManualScore {
    id?: number;
    fund_year: number;
    period: AwardPeriod;
    operating_unit: string;
    reportorial_required: number;
    reportorial_submitted: number;
    national_activities_required: number;
    national_activities_attended: number;
    remarks?: string | null;
}

export interface AwardRankingSettings {
    quarterlyRankPoints: Record<string, number>;
    quarterlyRestPoints: number;
    quarterlyZeroCompletionPoints: number;
    quarterlyPhysicalWeights: {
        socialPrep: {
            activitiesConducted: number;
            iposTrained: number;
            completionRate: number;
        };
        productionLivelihood: {
            trainingsConducted: number;
            subprojectsProvided: number;
            iposAssisted: number;
            completionRate: number;
        };
        marketingEnterprise: {
            activitiesConducted: number;
            iposAssisted: number;
            completionRate: number;
        };
        programManagement: {
            reportorialCompliance: number;
            nationalAttendance: number;
            completionRate: number;
        };
    };
    quarterlyFinancialWeights: {
        disbursementVsAllotment: number;
        obligationVsAllotment: number;
    };
    annualRankPoints: Record<string, number>;
    annualConsistencyPoints: Record<string, number>;
    annualFinancialCompletionBands: Array<{ min: number; points: number }>;
    annualPhysicalCompletionBands: Array<{ min: number; points: number }>;
    annualAttendanceMissedPoints: Record<string, number>;
}

export interface AwardOuScore {
    ou: string;
    rank: number;
    score: number;
    points: number;
}

export interface AwardComponentScore extends AwardOuScore {
    completionRate: number;
    metrics: Record<string, number>;
}

export interface AwardPhysicalOverallScore extends AwardOuScore {
    componentPoints: number;
    rankPoints: number;
}

export interface AwardSpecialScore extends AwardOuScore {
    target?: number;
}

export interface AwardQuarterResult {
    period: AwardQuarter;
    isActive: boolean;
    statusLabel: string;
    physicalComponents: Record<AwardPhysicalComponentKey, AwardComponentScore[]>;
    physicalOverall: AwardPhysicalOverallScore[];
    financial: Array<AwardOuScore & {
        allocation: number;
        obligation: number;
        disbursement: number;
        obligationRate: number;
        disbursementRate: number;
    }>;
}

export interface AwardAnnualOuRow {
    ou: string;
    rank: number;
    totalPoints: number;
    allocation: number;
    obligation: number;
    disbursement: number;
    disbursementVsAllotmentRate: number;
    disbursementVsObligationRate: number;
    physicalCompletionRate: number;
    financialTop4Quarters: number;
    physicalTop4Quarters: number;
    attendanceMissed: number;
    breakdown: Record<string, number>;
}

export interface AwardAnnualResult {
    overall: AwardAnnualOuRow[];
    financial: AwardAnnualOuRow[];
    physical: AwardAnnualOuRow[];
    mostIposAssisted: AwardSpecialScore[];
    mostAttendance: AwardSpecialScore[];
    mostTrainings: AwardSpecialScore[];
    mostSubprojects: AwardSpecialScore[];
}

export interface AwardsDashboardData {
    effectiveYear: number;
    quarters: AwardQuarterResult[];
    annual: AwardAnnualResult;
}

export interface AwardsInputData {
    subprojects: Subproject[];
    trainings: Training[];
    otherActivities: OtherActivity[];
    officeReqs: OfficeRequirement[];
    staffingReqs: StaffingRequirement[];
    otherProgramExpenses: OtherProgramExpense[];
    ipos: IPO[];
}

const QUARTERS: AwardQuarter[] = ['Q1', 'Q2', 'Q3', 'Q4'];

export const DEFAULT_AWARD_SETTINGS: AwardRankingSettings = {
    quarterlyRankPoints: { '1': 6, '2': 5, '3': 4, '4': 3, '5': 2 },
    quarterlyRestPoints: 1,
    quarterlyZeroCompletionPoints: 0,
    quarterlyPhysicalWeights: {
        socialPrep: { activitiesConducted: 20, iposTrained: 20, completionRate: 60 },
        productionLivelihood: { trainingsConducted: 10, subprojectsProvided: 10, iposAssisted: 20, completionRate: 60 },
        marketingEnterprise: { activitiesConducted: 20, iposAssisted: 20, completionRate: 60 },
        programManagement: { reportorialCompliance: 30, nationalAttendance: 10, completionRate: 60 },
    },
    quarterlyFinancialWeights: { disbursementVsAllotment: 50, obligationVsAllotment: 50 },
    annualRankPoints: { '1': 10, '2': 8, '3': 6, '4': 4 },
    annualConsistencyPoints: { '4': 10, '3': 8, '2': 6, '1': 4 },
    annualFinancialCompletionBands: [
        { min: 96, points: 10 },
        { min: 91, points: 8 },
        { min: 86, points: 6 },
        { min: 80, points: 4 },
    ],
    annualPhysicalCompletionBands: [
        { min: 99, points: 10 },
        { min: 96, points: 8 },
        { min: 93, points: 6 },
        { min: 90, points: 4 },
    ],
    annualAttendanceMissedPoints: { '0': 10, '1': 8, '2': 6, '3': 4 },
};

export const normalizeAwardSettings = (settings: unknown): AwardRankingSettings => {
    const raw = settings && typeof settings === 'object' ? settings as Partial<AwardRankingSettings> : {};
    return {
        ...DEFAULT_AWARD_SETTINGS,
        ...raw,
        quarterlyRankPoints: { ...DEFAULT_AWARD_SETTINGS.quarterlyRankPoints, ...(raw.quarterlyRankPoints || {}) },
        quarterlyPhysicalWeights: {
            socialPrep: { ...DEFAULT_AWARD_SETTINGS.quarterlyPhysicalWeights.socialPrep, ...(raw.quarterlyPhysicalWeights?.socialPrep || {}) },
            productionLivelihood: { ...DEFAULT_AWARD_SETTINGS.quarterlyPhysicalWeights.productionLivelihood, ...(raw.quarterlyPhysicalWeights?.productionLivelihood || {}) },
            marketingEnterprise: { ...DEFAULT_AWARD_SETTINGS.quarterlyPhysicalWeights.marketingEnterprise, ...(raw.quarterlyPhysicalWeights?.marketingEnterprise || {}) },
            programManagement: { ...DEFAULT_AWARD_SETTINGS.quarterlyPhysicalWeights.programManagement, ...(raw.quarterlyPhysicalWeights?.programManagement || {}) },
        },
        quarterlyFinancialWeights: { ...DEFAULT_AWARD_SETTINGS.quarterlyFinancialWeights, ...(raw.quarterlyFinancialWeights || {}) },
        annualRankPoints: { ...DEFAULT_AWARD_SETTINGS.annualRankPoints, ...(raw.annualRankPoints || {}) },
        annualConsistencyPoints: { ...DEFAULT_AWARD_SETTINGS.annualConsistencyPoints, ...(raw.annualConsistencyPoints || {}) },
        annualAttendanceMissedPoints: { ...DEFAULT_AWARD_SETTINGS.annualAttendanceMissedPoints, ...(raw.annualAttendanceMissedPoints || {}) },
        annualFinancialCompletionBands: raw.annualFinancialCompletionBands || DEFAULT_AWARD_SETTINGS.annualFinancialCompletionBands,
        annualPhysicalCompletionBands: raw.annualPhysicalCompletionBands || DEFAULT_AWARD_SETTINGS.annualPhysicalCompletionBands,
    };
};

const toNumber = (value: unknown) => Number(value) || 0;

const safeRate = (actual: number, target: number) => target > 0 ? (actual / target) * 100 : 0;

const getFiscalYear = (selectedYear: string) => {
    const parsed = Number(selectedYear);
    return Number.isFinite(parsed) ? parsed : new Date().getFullYear();
};

const parseDate = (date?: string) => {
    if (!date) return null;
    const parsed = new Date(`${date.slice(0, 10)}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getQuarterFromDate = (date?: string): AwardQuarter | null => {
    const parsed = parseDate(date);
    if (!parsed) return null;
    return QUARTERS[Math.floor(parsed.getMonth() / 3)] || null;
};

const getQuarterEnd = (year: number, quarter: AwardQuarter) => {
    const quarterIndex = QUARTERS.indexOf(quarter);
    return new Date(year, (quarterIndex + 1) * 3, 0, 23, 59, 59, 999);
};

const getActiveQuarterSet = (year: number, today = new Date()) => {
    const currentYear = today.getFullYear();
    if (year < currentYear) return new Set<AwardQuarter>(QUARTERS);
    if (year > currentYear) return new Set<AwardQuarter>();
    const currentQuarterIndex = Math.floor(today.getMonth() / 3);
    return new Set<AwardQuarter>(QUARTERS.filter((_quarter, index) => index <= currentQuarterIndex));
};

const isDateInYear = (date: string | undefined, year: number) => parseDate(date)?.getFullYear() === year;

const isDateInQuarter = (date: string | undefined, year: number, quarter: AwardQuarter) =>
    isDateInYear(date, year) && getQuarterFromDate(date) === quarter;

const isDateOnOrBefore = (date: string | undefined, cutoff: Date) => {
    const parsed = parseDate(date);
    return !!parsed && parsed.getTime() <= cutoff.getTime();
};

const getActivityTargetDate = (activity: Training | OtherActivity) => activity.endDate || activity.date;

const getPmTargetDate = (item: OfficeRequirement | StaffingRequirement) => item.physicalDeliveryDate || item.obligationDate;

const getPmActualDate = (item: OfficeRequirement | StaffingRequirement) => item.actualDate || item.actualObligationDate;

const isTargetRecord = (record: { status?: string; isRealignment?: boolean; isSavings?: boolean }) =>
    record.status !== 'Cancelled' && !record.isRealignment && !record.isSavings;

const isCompletedActivity = (activity: Training | OtherActivity) => activity.status !== 'Cancelled' && !!activity.actualDate;

const isCompletedSubproject = (subproject: Subproject) =>
    subproject.status === 'Completed' && !!subproject.actualCompletionDate;

const recordYearMatches = (recordYear: number | undefined, year: number) => recordYear === year;

const uniqueCount = (values: Array<string | number | undefined | null>) =>
    new Set(values.filter(value => value !== undefined && value !== null && String(value).trim().length > 0)).size;

const rankRows = <T extends { ou: string }>(
    rows: T[],
    getScore: (row: T) => number,
    getPoints: (rank: number, score: number) => number
): Array<T & AwardOuScore> => {
    const sorted = [...rows].sort((a, b) => {
        const diff = getScore(b) - getScore(a);
        return diff !== 0 ? diff : a.ou.localeCompare(b.ou);
    });

    let previousScore: number | null = null;
    let currentRank = 0;
    return sorted.map((row, index) => {
        const score = getScore(row);
        if (previousScore === null || score !== previousScore) {
            currentRank = index + 1;
            previousScore = score;
        }
        return {
            ...row,
            rank: currentRank,
            score,
            points: getPoints(currentRank, score),
        };
    });
};

const getQuarterRankPoints = (settings: AwardRankingSettings, rank: number, score: number) => {
    if (score <= 0) return 0;
    return settings.quarterlyRankPoints[String(rank)] ?? settings.quarterlyRestPoints;
};

const getAnnualRankPoints = (settings: AwardRankingSettings, rank: number, score: number) => {
    if (score <= 0) return 0;
    return settings.annualRankPoints[String(rank)] ?? 0;
};

const getBandPoints = (bands: Array<{ min: number; points: number }>, rate: number) => {
    const normalized = Math.min(rate, 100);
    return bands.find(band => normalized >= band.min)?.points || 0;
};

const manualKey = (year: number, period: AwardPeriod, ou: string) => `${year}::${period}::${ou}`;

const makeManualMap = (manualScores: AwardManualScore[]) => {
    const map = new Map<string, AwardManualScore>();
    manualScores.forEach(score => {
        map.set(manualKey(score.fund_year, score.period, score.operating_unit), score);
    });
    return map;
};

const getManual = (manualMap: Map<string, AwardManualScore>, year: number, period: AwardPeriod, ou: string): AwardManualScore => (
    manualMap.get(manualKey(year, period, ou)) || {
        fund_year: year,
        period,
        operating_unit: ou,
        reportorial_required: 0,
        reportorial_submitted: 0,
        national_activities_required: 0,
        national_activities_attended: 0,
        remarks: '',
    }
);

type CompletionRecord = {
    ou: string;
    targetDate?: string;
    actualDate?: string;
};

const getQuarterCompletionRate = (records: CompletionRecord[], year: number, quarter: AwardQuarter) => {
    const cutoff = getQuarterEnd(year, quarter);
    const dueTargets = records.filter(record => isDateInQuarter(record.targetDate, year, quarter));
    const completed = dueTargets.filter(record => isDateOnOrBefore(record.actualDate, cutoff));
    return {
        target: dueTargets.length,
        actual: completed.length,
        rate: safeRate(completed.length, dueTargets.length),
    };
};

const getAnnualCompletionRate = (records: CompletionRecord[], year: number) => {
    const cutoff = new Date(year, 11, 31, 23, 59, 59, 999);
    const dueTargets = records.filter(record => !!record.targetDate);
    const completed = dueTargets.filter(record => isDateOnOrBefore(record.actualDate, cutoff));
    return {
        target: dueTargets.length,
        actual: completed.length,
        rate: safeRate(completed.length, dueTargets.length),
    };
};

const normalizeCountScore = (value: number, bestValue: number, weight: number) =>
    bestValue > 0 ? (value / bestValue) * weight : 0;

const getOuPhysicalRecords = (data: AwardsInputData, year: number) => {
    const annualByOu = new Map<string, CompletionRecord[]>();
    const add = (ou: string, targetDate?: string, actualDate?: string) => {
        if (!annualByOu.has(ou)) annualByOu.set(ou, []);
        annualByOu.get(ou)!.push({ ou, targetDate, actualDate });
    };

    operatingUnits.forEach(ou => annualByOu.set(ou, []));

    data.subprojects
        .filter(record => recordYearMatches(record.fundingYear, year) && isTargetRecord(record))
        .forEach(sp => add(sp.operatingUnit, sp.estimatedCompletionDate, isCompletedSubproject(sp) ? sp.actualCompletionDate : undefined));

    [...data.trainings, ...data.otherActivities]
        .filter(record => recordYearMatches(record.fundingYear, year) && isTargetRecord(record))
        .forEach(activity => add(activity.operatingUnit, getActivityTargetDate(activity), isCompletedActivity(activity) ? activity.actualDate : undefined));

    data.officeReqs
        .filter(record => recordYearMatches(record.fundYear, year) && isTargetRecord(record))
        .forEach(item => add(item.operatingUnit, getPmTargetDate(item), getPmActualDate(item)));

    data.staffingReqs
        .filter(record => recordYearMatches(record.fundYear, year) && isTargetRecord(record))
        .forEach(item => add(item.operatingUnit, getPmTargetDate(item), getPmActualDate(item)));

    return annualByOu;
};

const buildQuarterPhysical = (
    data: AwardsInputData,
    year: number,
    quarter: AwardQuarter,
    settings: AwardRankingSettings,
    manualMap: Map<string, AwardManualScore>
): AwardQuarterResult['physicalComponents'] => {
    const socialPrepActivities = [...data.trainings, ...data.otherActivities]
        .filter(activity => recordYearMatches(activity.fundingYear, year) && activity.component === 'Social Preparation');
    const plTrainings = data.trainings
        .filter(activity => recordYearMatches(activity.fundingYear, year) && activity.component === 'Production and Livelihood');
    const marketingActivities = [...data.trainings, ...data.otherActivities]
        .filter(activity => recordYearMatches(activity.fundingYear, year) && activity.component === 'Marketing and Enterprise');
    const pmActivities = [...data.trainings, ...data.otherActivities]
        .filter(activity => recordYearMatches(activity.fundingYear, year) && activity.component === 'Program Management');
    const subprojects = data.subprojects.filter(sp => recordYearMatches(sp.fundingYear, year));
    const officeReqs = data.officeReqs.filter(item => recordYearMatches(item.fundYear, year));
    const staffingReqs = data.staffingReqs.filter(item => recordYearMatches(item.fundYear, year));

    const recordsByOu = {
        socialPrep: new Map<string, CompletionRecord[]>(),
        productionLivelihood: new Map<string, CompletionRecord[]>(),
        marketingEnterprise: new Map<string, CompletionRecord[]>(),
        programManagement: new Map<string, CompletionRecord[]>(),
    };
    operatingUnits.forEach(ou => {
        recordsByOu.socialPrep.set(ou, []);
        recordsByOu.productionLivelihood.set(ou, []);
        recordsByOu.marketingEnterprise.set(ou, []);
        recordsByOu.programManagement.set(ou, []);
    });

    const addRecord = (target: Map<string, CompletionRecord[]>, ou: string, targetDate?: string, actualDate?: string) => {
        target.get(ou)?.push({ ou, targetDate, actualDate });
    };

    socialPrepActivities.filter(isTargetRecord).forEach(activity => addRecord(recordsByOu.socialPrep, activity.operatingUnit, getActivityTargetDate(activity), isCompletedActivity(activity) ? activity.actualDate : undefined));
    plTrainings.filter(isTargetRecord).forEach(activity => addRecord(recordsByOu.productionLivelihood, activity.operatingUnit, getActivityTargetDate(activity), isCompletedActivity(activity) ? activity.actualDate : undefined));
    subprojects.filter(isTargetRecord).forEach(sp => addRecord(recordsByOu.productionLivelihood, sp.operatingUnit, sp.estimatedCompletionDate, isCompletedSubproject(sp) ? sp.actualCompletionDate : undefined));
    marketingActivities.filter(isTargetRecord).forEach(activity => addRecord(recordsByOu.marketingEnterprise, activity.operatingUnit, getActivityTargetDate(activity), isCompletedActivity(activity) ? activity.actualDate : undefined));
    pmActivities.filter(isTargetRecord).forEach(activity => addRecord(recordsByOu.programManagement, activity.operatingUnit, getActivityTargetDate(activity), isCompletedActivity(activity) ? activity.actualDate : undefined));
    officeReqs.filter(isTargetRecord).forEach(item => addRecord(recordsByOu.programManagement, item.operatingUnit, getPmTargetDate(item), getPmActualDate(item)));
    staffingReqs.filter(isTargetRecord).forEach(item => addRecord(recordsByOu.programManagement, item.operatingUnit, getPmTargetDate(item), getPmActualDate(item)));

    const socialPrepMetrics = operatingUnits.map(ou => {
        const activitiesInQuarter = socialPrepActivities.filter(activity => isCompletedActivity(activity) && activity.operatingUnit === ou && isDateInQuarter(activity.actualDate, year, quarter));
        const completion = getQuarterCompletionRate(recordsByOu.socialPrep.get(ou) || [], year, quarter);
        return {
            ou,
            activitiesConducted: activitiesInQuarter.length,
            iposTrained: uniqueCount(activitiesInQuarter.flatMap(activity => getActivityIpoIds(activity, data.ipos))),
            targetsDue: completion.target,
            targetsCompleted: completion.actual,
            completionRate: completion.rate,
        };
    });

    const plMetrics = operatingUnits.map(ou => {
        const trainingsInQuarter = plTrainings.filter(activity => isCompletedActivity(activity) && activity.operatingUnit === ou && isDateInQuarter(activity.actualDate, year, quarter));
        const subprojectsInQuarter = subprojects.filter(sp => isCompletedSubproject(sp) && sp.operatingUnit === ou && isDateInQuarter(sp.actualCompletionDate, year, quarter));
        const completion = getQuarterCompletionRate(recordsByOu.productionLivelihood.get(ou) || [], year, quarter);
        return {
            ou,
            trainingsConducted: trainingsInQuarter.length,
            subprojectsProvided: subprojectsInQuarter.length,
            iposAssisted: uniqueCount([
                ...trainingsInQuarter.flatMap(activity => getActivityIpoIds(activity, data.ipos)),
                ...subprojectsInQuarter.map(sp => getSubprojectIpoId(sp, data.ipos)).filter(Boolean),
            ]),
            targetsDue: completion.target,
            targetsCompleted: completion.actual,
            completionRate: completion.rate,
        };
    });

    const marketingMetrics = operatingUnits.map(ou => {
        const activitiesInQuarter = marketingActivities.filter(activity => isCompletedActivity(activity) && activity.operatingUnit === ou && isDateInQuarter(activity.actualDate, year, quarter));
        const completion = getQuarterCompletionRate(recordsByOu.marketingEnterprise.get(ou) || [], year, quarter);
        return {
            ou,
            activitiesConducted: activitiesInQuarter.length,
            iposAssisted: uniqueCount(activitiesInQuarter.flatMap(activity => getActivityIpoIds(activity, data.ipos))),
            targetsDue: completion.target,
            targetsCompleted: completion.actual,
            completionRate: completion.rate,
        };
    });

    const programMetrics = operatingUnits.map(ou => {
        const manual = getManual(manualMap, year, quarter, ou);
        const completion = getQuarterCompletionRate(recordsByOu.programManagement.get(ou) || [], year, quarter);
        const reportorialRequired = toNumber(manual.reportorial_required);
        const reportorialSubmitted = toNumber(manual.reportorial_submitted);
        const nationalRequired = toNumber(manual.national_activities_required);
        const nationalAttended = toNumber(manual.national_activities_attended);
        return {
            ou,
            reportorialRequired,
            reportorialSubmitted,
            reportorialCompliance: safeRate(reportorialSubmitted, reportorialRequired),
            nationalRequired,
            nationalAttended,
            nationalAttendance: safeRate(nationalAttended, nationalRequired),
            targetsDue: completion.target,
            targetsCompleted: completion.actual,
            completionRate: completion.rate,
        };
    });

    const scoreSocialPrep = (row: typeof socialPrepMetrics[number]) =>
        normalizeCountScore(row.activitiesConducted, Math.max(...socialPrepMetrics.map(item => item.activitiesConducted), 0), settings.quarterlyPhysicalWeights.socialPrep.activitiesConducted)
        + normalizeCountScore(row.iposTrained, Math.max(...socialPrepMetrics.map(item => item.iposTrained), 0), settings.quarterlyPhysicalWeights.socialPrep.iposTrained)
        + (row.completionRate / 100) * settings.quarterlyPhysicalWeights.socialPrep.completionRate;

    const scoreProductionLivelihood = (row: typeof plMetrics[number]) =>
        normalizeCountScore(row.trainingsConducted, Math.max(...plMetrics.map(item => item.trainingsConducted), 0), settings.quarterlyPhysicalWeights.productionLivelihood.trainingsConducted)
        + normalizeCountScore(row.subprojectsProvided, Math.max(...plMetrics.map(item => item.subprojectsProvided), 0), settings.quarterlyPhysicalWeights.productionLivelihood.subprojectsProvided)
        + normalizeCountScore(row.iposAssisted, Math.max(...plMetrics.map(item => item.iposAssisted), 0), settings.quarterlyPhysicalWeights.productionLivelihood.iposAssisted)
        + (row.completionRate / 100) * settings.quarterlyPhysicalWeights.productionLivelihood.completionRate;

    const scoreMarketing = (row: typeof marketingMetrics[number]) =>
        normalizeCountScore(row.activitiesConducted, Math.max(...marketingMetrics.map(item => item.activitiesConducted), 0), settings.quarterlyPhysicalWeights.marketingEnterprise.activitiesConducted)
        + normalizeCountScore(row.iposAssisted, Math.max(...marketingMetrics.map(item => item.iposAssisted), 0), settings.quarterlyPhysicalWeights.marketingEnterprise.iposAssisted)
        + (row.completionRate / 100) * settings.quarterlyPhysicalWeights.marketingEnterprise.completionRate;

    const scoreProgram = (row: typeof programMetrics[number]) =>
        (row.reportorialCompliance / 100) * settings.quarterlyPhysicalWeights.programManagement.reportorialCompliance
        + (row.nationalAttendance / 100) * settings.quarterlyPhysicalWeights.programManagement.nationalAttendance
        + (row.completionRate / 100) * settings.quarterlyPhysicalWeights.programManagement.completionRate;

    const rankComponent = <T extends { ou: string; completionRate: number }>(
        rows: T[],
        getScore: (row: T) => number
    ): AwardComponentScore[] => rankRows(rows, getScore, (rank, score) => getQuarterRankPoints(settings, rank, score)).map(row => ({
        ou: row.ou,
        rank: row.rank,
        score: row.score,
        points: row.completionRate <= 0 ? settings.quarterlyZeroCompletionPoints : row.points,
        completionRate: row.completionRate,
        metrics: Object.fromEntries(Object.entries(row).filter(([key]) => !['ou', 'rank', 'score', 'points'].includes(key)).map(([key, value]) => [key, toNumber(value)])),
    }));

    return {
        socialPrep: rankComponent(socialPrepMetrics, scoreSocialPrep),
        productionLivelihood: rankComponent(plMetrics, scoreProductionLivelihood),
        marketingEnterprise: rankComponent(marketingMetrics, scoreMarketing),
        programManagement: rankComponent(programMetrics, scoreProgram),
    };
};

const buildQuarterFinancial = (
    data: AwardsInputData,
    year: number,
    quarter: AwardQuarter,
    settings: AwardRankingSettings
): AwardQuarterResult['financial'] => {
    const lineItems = collectFinancialLineItems({
        subprojects: data.subprojects,
        activities: [...data.trainings, ...data.otherActivities],
        officeReqs: data.officeReqs,
        staffingReqs: data.staffingReqs,
        otherProgramExpenses: data.otherProgramExpenses,
    }, {
        year: String(year),
        actualYear: 'All',
        operatingUnit: 'All',
        tier: 'All',
        fundType: 'All',
    });
    const quarterIndex = QUARTERS.indexOf(quarter);
    const months = [quarterIndex * 3, quarterIndex * 3 + 1, quarterIndex * 3 + 2];
    const rows = operatingUnits.map(ou => {
        const ouItems = lineItems.filter(item => item.operatingUnit === ou);
        const allocation = ouItems.reduce((sum, item) => months.includes(item.targetMonth ?? -1) ? sum + item.alloc : sum, 0);
        const obligation = ouItems.reduce((sum, item) => sum + months.reduce((inner, month) => inner + (item.obligationByMonth[month] || 0), 0), 0);
        const disbursement = ouItems.reduce((sum, item) => sum + months.reduce((inner, month) => inner + (item.disbursementByMonth[month] || 0), 0), 0);
        const obligationRate = safeRate(obligation, allocation);
        const disbursementRate = safeRate(disbursement, allocation);
        const weightedScore = (disbursementRate / 100) * settings.quarterlyFinancialWeights.disbursementVsAllotment
            + (obligationRate / 100) * settings.quarterlyFinancialWeights.obligationVsAllotment;
        return { ou, allocation, obligation, disbursement, obligationRate, disbursementRate, weightedScore };
    });

    return rankRows(rows, row => row.weightedScore, (rank, score) => getQuarterRankPoints(settings, rank, score))
        .map(row => ({
            ou: row.ou,
            rank: row.rank,
            score: row.score,
            points: row.points,
            allocation: row.allocation,
            obligation: row.obligation,
            disbursement: row.disbursement,
            obligationRate: row.obligationRate,
            disbursementRate: row.disbursementRate,
        }));
};

const buildQuarterResult = (
    data: AwardsInputData,
    year: number,
    quarter: AwardQuarter,
    isActive: boolean,
    settings: AwardRankingSettings,
    manualMap: Map<string, AwardManualScore>
): AwardQuarterResult => {
    if (!isActive) {
        return {
            period: quarter,
            isActive: false,
            statusLabel: 'Not Yet Due',
            physicalComponents: {
                socialPrep: [],
                productionLivelihood: [],
                marketingEnterprise: [],
                programManagement: [],
            },
            physicalOverall: [],
            financial: [],
        };
    }
    const physicalComponents = buildQuarterPhysical(data, year, quarter, settings, manualMap);
    const physicalOverallBase = operatingUnits.map(ou => ({
        ou,
        componentPoints: Object.values(physicalComponents).reduce((sum, rows) => sum + (rows.find(row => row.ou === ou)?.points || 0), 0),
    }));
    const physicalOverall = rankRows(physicalOverallBase, row => row.componentPoints, (rank, score) => getQuarterRankPoints(settings, rank, score))
        .map(row => ({
            ...row,
            rankPoints: row.points,
            points: row.componentPoints,
        }));
    const financial = buildQuarterFinancial(data, year, quarter, settings);
    return { period: quarter, isActive: true, statusLabel: 'Calculated', physicalComponents, physicalOverall, financial };
};

const buildAnnualFinancialBuckets = (data: AwardsInputData, year: number) => {
    const lineItems = collectFinancialLineItems({
        subprojects: data.subprojects,
        activities: [...data.trainings, ...data.otherActivities],
        officeReqs: data.officeReqs,
        staffingReqs: data.staffingReqs,
        otherProgramExpenses: data.otherProgramExpenses,
    }, {
        year: String(year),
        actualYear: 'All',
        operatingUnit: 'All',
        tier: 'All',
        fundType: 'All',
    });

    return operatingUnits.map(ou => {
        const ouItems = lineItems.filter(item => item.operatingUnit === ou);
        const allocation = ouItems.reduce((sum, item) => sum + item.alloc, 0);
        const obligation = ouItems.reduce((sum, item) => sum + item.obli, 0);
        const disbursement = ouItems.reduce((sum, item) => sum + item.disb, 0);
        return {
            ou,
            allocation,
            obligation,
            disbursement,
            disbursementVsAllotmentRate: safeRate(disbursement, allocation),
            disbursementVsObligationRate: safeRate(disbursement, obligation),
        };
    });
};

const buildAnnualCounts = (data: AwardsInputData, year: number, manualMap: Map<string, AwardManualScore>) => {
    const iposByOu = new Map<string, Set<number>>();
    const targetIposByOu = new Map<string, Set<number>>();
    const attendanceByOu = new Map<string, number>();
    const trainingsByOu = new Map<string, number>();
    const subprojectsByOu = new Map<string, number>();
    operatingUnits.forEach(ou => {
        iposByOu.set(ou, new Set());
        targetIposByOu.set(ou, new Set());
        attendanceByOu.set(ou, 0);
        trainingsByOu.set(ou, 0);
        subprojectsByOu.set(ou, 0);
    });

    data.subprojects
        .filter(sp => recordYearMatches(sp.fundingYear, year) && isTargetRecord(sp))
        .forEach(sp => {
            const ipoId = getSubprojectIpoId(sp, data.ipos);
            if (ipoId) targetIposByOu.get(sp.operatingUnit)?.add(Number(ipoId));
        });

    data.subprojects
        .filter(sp => recordYearMatches(sp.fundingYear, year) && isCompletedSubproject(sp) && isDateOnOrBefore(sp.actualCompletionDate, new Date(year, 11, 31, 23, 59, 59, 999)))
        .forEach(sp => {
            const ipoId = getSubprojectIpoId(sp, data.ipos);
            if (ipoId) iposByOu.get(sp.operatingUnit)?.add(Number(ipoId));
            subprojectsByOu.set(sp.operatingUnit, (subprojectsByOu.get(sp.operatingUnit) || 0) + 1);
        });

    [...data.trainings, ...data.otherActivities]
        .filter(activity => recordYearMatches(activity.fundingYear, year) && isTargetRecord(activity))
        .forEach(activity => {
            getActivityIpoIds(activity, data.ipos).forEach(ipoId => targetIposByOu.get(activity.operatingUnit)?.add(ipoId));
        });

    [...data.trainings, ...data.otherActivities]
        .filter(activity => recordYearMatches(activity.fundingYear, year) && isCompletedActivity(activity) && isDateOnOrBefore(activity.actualDate, new Date(year, 11, 31, 23, 59, 59, 999)))
        .forEach(activity => {
            getActivityIpoIds(activity, data.ipos).forEach(ipoId => iposByOu.get(activity.operatingUnit)?.add(ipoId));
            if (activity.type === 'Training') {
                trainingsByOu.set(activity.operatingUnit, (trainingsByOu.get(activity.operatingUnit) || 0) + 1);
            }
        });

    operatingUnits.forEach(ou => {
        const yearEnd = getManual(manualMap, year, 'Year End', ou);
        if (toNumber(yearEnd.national_activities_required) > 0 || toNumber(yearEnd.national_activities_attended) > 0) {
            attendanceByOu.set(ou, toNumber(yearEnd.national_activities_attended));
            return;
        }
        const total = QUARTERS.reduce((sum, quarter) => {
            const manual = getManual(manualMap, year, quarter, ou);
            return sum + toNumber(manual.national_activities_attended);
        }, 0);
        attendanceByOu.set(ou, total);
    });

    return {
        iposAssisted: operatingUnits.map(ou => ({ ou, value: iposByOu.get(ou)?.size || 0, target: targetIposByOu.get(ou)?.size || 0 })),
        attendance: operatingUnits.map(ou => ({ ou, value: attendanceByOu.get(ou) || 0 })),
        trainings: operatingUnits.map(ou => ({ ou, value: trainingsByOu.get(ou) || 0 })),
        subprojects: operatingUnits.map(ou => ({ ou, value: subprojectsByOu.get(ou) || 0 })),
    };
};

const getAnnualAttendanceMissed = (manualMap: Map<string, AwardManualScore>, year: number, ou: string) => {
    const yearEnd = getManual(manualMap, year, 'Year End', ou);
    if (toNumber(yearEnd.national_activities_required) > 0 || toNumber(yearEnd.national_activities_attended) > 0) {
        return Math.max(0, toNumber(yearEnd.national_activities_required) - toNumber(yearEnd.national_activities_attended));
    }

    const totals = QUARTERS.reduce((acc, quarter) => {
        const manual = getManual(manualMap, year, quarter, ou);
        acc.required += toNumber(manual.national_activities_required);
        acc.attended += toNumber(manual.national_activities_attended);
        return acc;
    }, { required: 0, attended: 0 });
    return Math.max(0, totals.required - totals.attended);
};

const buildAnnualResults = (
    data: AwardsInputData,
    year: number,
    settings: AwardRankingSettings,
    quarters: AwardQuarterResult[],
    manualMap: Map<string, AwardManualScore>
): AwardAnnualResult => {
    const financialBuckets = buildAnnualFinancialBuckets(data, year);
    const physicalRecords = getOuPhysicalRecords(data, year);
    const physicalRows = operatingUnits.map(ou => ({
        ou,
        physicalCompletionRate: getAnnualCompletionRate(physicalRecords.get(ou) || [], year).rate,
    }));

    const disbVsAllotmentRanks = rankRows(financialBuckets, row => row.disbursementVsAllotmentRate, (rank, score) => getAnnualRankPoints(settings, rank, score));
    const disbVsObligationRanks = rankRows(financialBuckets, row => row.disbursementVsObligationRate, (rank, score) => getAnnualRankPoints(settings, rank, score));
    const physicalCompletionRanks = rankRows(physicalRows, row => row.physicalCompletionRate, (rank, score) => getAnnualRankPoints(settings, rank, score));

    const getRankPoints = (rows: AwardOuScore[], ou: string) => rows.find(row => row.ou === ou)?.points || 0;
    const getRate = <T extends { ou: string }>(rows: T[], ou: string, key: keyof T) => Number(rows.find(row => row.ou === ou)?.[key]) || 0;

    const financialTop4Counts = new Map<string, number>();
    const physicalTop4Counts = new Map<string, number>();
    operatingUnits.forEach(ou => {
        financialTop4Counts.set(ou, quarters.filter(quarter => (quarter.financial.find(row => row.ou === ou)?.rank || 999) <= 4).length);
        physicalTop4Counts.set(ou, quarters.filter(quarter => (quarter.physicalOverall.find(row => row.ou === ou)?.rank || 999) <= 4).length);
    });

    const baseRows = operatingUnits.map(ou => {
        const financialBucket = financialBuckets.find(row => row.ou === ou);
        const disbursementVsAllotmentRate = getRate(financialBuckets, ou, 'disbursementVsAllotmentRate');
        const disbursementVsObligationRate = getRate(financialBuckets, ou, 'disbursementVsObligationRate');
        const physicalCompletionRate = getRate(physicalRows, ou, 'physicalCompletionRate');
        const financialTop4Quarters = financialTop4Counts.get(ou) || 0;
        const physicalTop4Quarters = physicalTop4Counts.get(ou) || 0;
        const attendanceMissed = getAnnualAttendanceMissed(manualMap, year, ou);
        const breakdown = {
            disbursementVsAllotmentRank: getRankPoints(disbVsAllotmentRanks, ou),
            disbursementVsObligationRank: getRankPoints(disbVsObligationRanks, ou),
            physicalCompletionRank: getRankPoints(physicalCompletionRanks, ou),
            financialConsistency: settings.annualConsistencyPoints[String(financialTop4Quarters)] || 0,
            physicalConsistency: settings.annualConsistencyPoints[String(physicalTop4Quarters)] || 0,
            disbursementVsAllotmentCompletion: getBandPoints(settings.annualFinancialCompletionBands, disbursementVsAllotmentRate),
            disbursementVsObligationCompletion: getBandPoints(settings.annualFinancialCompletionBands, disbursementVsObligationRate),
            physicalCompletionBand: getBandPoints(settings.annualPhysicalCompletionBands, physicalCompletionRate),
            nationalAttendance: settings.annualAttendanceMissedPoints[String(attendanceMissed)] || 0,
        };
        return {
            ou,
            totalPoints: Object.values(breakdown).reduce((sum, value) => sum + value, 0),
            allocation: financialBucket?.allocation || 0,
            obligation: financialBucket?.obligation || 0,
            disbursement: financialBucket?.disbursement || 0,
            disbursementVsAllotmentRate,
            disbursementVsObligationRate,
            physicalCompletionRate,
            financialTop4Quarters,
            physicalTop4Quarters,
            attendanceMissed,
            breakdown,
        };
    });

    const rankAnnualRows = (rows: Omit<AwardAnnualOuRow, 'rank'>[]) => rankRows(rows, row => row.totalPoints, (_rank, score) => score)
        .map(row => ({ ...row, totalPoints: row.score }));

    const overall = rankAnnualRows(baseRows);
    const financial = rankAnnualRows(baseRows.map(row => ({
        ...row,
        totalPoints: row.breakdown.disbursementVsAllotmentRank
            + row.breakdown.disbursementVsObligationRank
            + row.breakdown.financialConsistency
            + row.breakdown.disbursementVsAllotmentCompletion
            + row.breakdown.disbursementVsObligationCompletion,
    })));
    const physical = rankAnnualRows(baseRows.map(row => ({
        ...row,
        totalPoints: row.breakdown.physicalCompletionRank
            + row.breakdown.physicalConsistency
            + row.breakdown.physicalCompletionBand,
    })));

    const counts = buildAnnualCounts(data, year, manualMap);
    const rankCount = (items: Array<{ ou: string; value: number; target?: number }>) =>
        rankRows(items, item => item.value, (_rank, score) => score)
            .map(item => ({ ou: item.ou, rank: item.rank, score: item.score, points: item.points, target: item.target }));

    return {
        overall,
        financial,
        physical,
        mostIposAssisted: rankCount(counts.iposAssisted),
        mostAttendance: rankCount(counts.attendance),
        mostTrainings: rankCount(counts.trainings),
        mostSubprojects: rankCount(counts.subprojects),
    };
};

export const calculateAwardsDashboardData = (
    data: AwardsInputData,
    selectedYear: string,
    settingsInput: unknown,
    manualScores: AwardManualScore[]
): AwardsDashboardData => {
    const effectiveYear = getFiscalYear(selectedYear);
    const settings = normalizeAwardSettings(settingsInput);
    const manualMap = makeManualMap(manualScores);
    const activeQuarters = getActiveQuarterSet(effectiveYear);
    const quarters = QUARTERS.map(quarter => buildQuarterResult(data, effectiveYear, quarter, activeQuarters.has(quarter), settings, manualMap));
    const annual = buildAnnualResults(data, effectiveYear, settings, quarters, manualMap);
    return { effectiveYear, quarters, annual };
};

export const awardQuarters = QUARTERS;
