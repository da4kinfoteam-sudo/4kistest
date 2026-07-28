import type { Activity, OtherProgramExpense, OfficeRequirement, StaffingRequirement, Subproject } from '../constants';
import { getBudgetLineTag, isRecordOrLineExcludedFromTargets } from './budgetLineAdjustments';
import { normalizeStaffingExpenses } from './staffingExpenseIdentity';
import { getActivityDisplayTitle } from './entityIdentity';

type YearFilter = string | 'All';

export interface FinancialAggregationFilters {
    year: YearFilter;
    actualYear?: YearFilter;
    operatingUnit?: string | 'All';
    tier?: string | 'All';
    fundType?: string | 'All';
    includeUnapproved?: boolean;
    includeTaggedExclusions?: boolean;
}

export interface FinancialBucket {
    alloc: number;
    obli: number;
    disb: number;
}

export interface FinancialAggregationInput {
    subprojects: Subproject[];
    activities: Activity[];
    officeReqs: OfficeRequirement[];
    staffingReqs: StaffingRequirement[];
    otherProgramExpenses: OtherProgramExpense[];
}

export interface HomepageFinancialStats {
    total: FinancialBucket;
    subprojects: FinancialBucket;
    trainings: FinancialBucket;
}

export type FinancialLine = {
    id?: number | string;
    amount?: number;
    pricePerUnit?: number;
    numberOfUnits?: number;
    annualSalary?: number;
    objectType?: string;
    uacsCode?: string;
    obligationMonth?: string;
    obligationDate?: string;
    disbursementMonth?: string;
    disbursementDate?: string;
    actualObligationAmount?: number;
    actualObligationDate?: string;
    actualDisbursementAmount?: number;
    actualDisbursementDate?: string;
    obligations?: Array<{ amount?: number; date?: string }>;
    disbursements?: Array<{ amount?: number; date?: string }>;
    actualDisbursementJan?: number;
    actualDisbursementFeb?: number;
    actualDisbursementMar?: number;
    actualDisbursementApr?: number;
    actualDisbursementMay?: number;
    actualDisbursementJun?: number;
    actualDisbursementJul?: number;
    actualDisbursementAug?: number;
    actualDisbursementSep?: number;
    actualDisbursementOct?: number;
    actualDisbursementNov?: number;
    actualDisbursementDec?: number;
    expenseParticular?: string;
    particulars?: string;
    equipment?: string;
    personnelPosition?: string;
    isCancelled?: boolean;
    isRealignment?: boolean;
    isSavings?: boolean;
    originalPlannedAmount?: number;
    originalPricePerUnit?: number;
    originalNumberOfUnits?: number;
    originalCapturedAt?: string;
    sourceItemId?: number | string | null;
    adjustmentReason?: string | null;
    disbursementJan?: number;
    disbursementFeb?: number;
    disbursementMar?: number;
    disbursementApr?: number;
    disbursementMay?: number;
    disbursementJun?: number;
    disbursementJul?: number;
    disbursementAug?: number;
    disbursementSep?: number;
    disbursementOct?: number;
    disbursementNov?: number;
    disbursementDec?: number;
};

type ScopedRecord = {
    id?: string | number;
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

const MONTH_KEYS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
export const FINANCIAL_COMPONENTS = [
    'Social Preparation',
    'Production and Livelihood',
    'Marketing and Enterprise',
    'Program Management',
] as const;

export type FinancialComponent = typeof FINANCIAL_COMPONENTS[number];
export type FinancialSourceType = 'subproject' | 'training' | 'activity' | 'programManagement';

export interface FinancialLineItem {
    recordId?: string | number;
    sourceType: FinancialSourceType;
    component: FinancialComponent;
    packageType?: string;
    activityName: string;
    objectType?: string;
    uacsCode?: string;
    recordYear?: number;
    fundType?: string;
    tier?: string;
    status?: string;
    workflowStatus?: string;
    isRealignment?: boolean;
    isSavings?: boolean;
    isCancelledLine?: boolean;
    lineTag?: string | null;
    excludedTargetAllocation?: number;
    operatingUnit?: string;
    location?: string;
    ipoIds?: number[];
    ipoNames?: string[];
    line: FinancialLine;
    alloc: number;
    obli: number;
    disb: number;
    targetMonth?: number;
    obligationByMonth: number[];
    disbursementByMonth: number[];
}

const toNumber = (value: unknown) => Number(value) || 0;

const compact = <T,>(items?: Array<T | null | undefined>) => (items || []).filter(Boolean) as T[];

export const getRecordYear = (record: ScopedRecord) => record.fundingYear ?? record.fundYear;

const matchesSelectedYear = (value: string | number | undefined, selectedYear: YearFilter) => {
    if (selectedYear === 'All') return true;
    return value?.toString() === selectedYear;
};

const getDateYear = (date?: string) => {
    if (!date) return undefined;
    const parsed = new Date(date);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.getFullYear().toString();
};

export const getFinancialMonthIndex = (dateStr?: string) => {
    if (!dateStr) return undefined;
    const parts = dateStr.split('-');
    if (parts.length >= 2) {
        const month = parseInt(parts[1], 10);
        if (!Number.isNaN(month) && month >= 1 && month <= 12) return month - 1;
    }
    const date = new Date(dateStr);
    return Number.isNaN(date.getTime()) ? undefined : date.getUTCMonth();
};

const matchesActualYear = (date: string | undefined, fallbackYear: string | number | undefined, selectedYear: YearFilter) => {
    if (selectedYear === 'All') return true;
    const dateYear = getDateYear(date);
    if (dateYear) return dateYear === selectedYear;
    return matchesSelectedYear(fallbackYear, selectedYear);
};

const isApproved = (record: ScopedRecord, includeUnapproved?: boolean) => {
    if (includeUnapproved) return true;
    return !record.workflow_status || record.workflow_status === 'APPROVED';
};

const matchesBaseFilters = (record: ScopedRecord, filters: FinancialAggregationFilters) => {
    if (!isApproved(record, filters.includeUnapproved)) return false;
    if (filters.operatingUnit && filters.operatingUnit !== 'All' && record.operatingUnit !== filters.operatingUnit) return false;
    if (filters.tier && filters.tier !== 'All' && record.tier !== filters.tier) return false;
    if (filters.fundType && filters.fundType !== 'All' && record.fundType !== filters.fundType) return false;
    return true;
};

const isTargetRecord = (record: ScopedRecord, filters: FinancialAggregationFilters) => {
    if (!matchesBaseFilters(record, filters)) return false;
    if (record.status === 'Cancelled') return false;
    return matchesSelectedYear(getRecordYear(record), filters.year);
};

const isTargetScopeRecord = (record: ScopedRecord, filters: FinancialAggregationFilters) => {
    if (!matchesBaseFilters(record, filters)) return false;
    return matchesSelectedYear(getRecordYear(record), filters.year);
};

const isActualRecord = (record: ScopedRecord, filters: FinancialAggregationFilters) => {
    if (!matchesBaseFilters(record, filters)) return false;
    return matchesSelectedYear(getRecordYear(record), filters.year);
};

export const getFinancialAllocation = (line: FinancialLine) => {
    if (line.amount !== undefined) return toNumber(line.amount);
    if (line.pricePerUnit !== undefined || line.numberOfUnits !== undefined) {
        return toNumber(line.pricePerUnit) * toNumber(line.numberOfUnits);
    }
    return toNumber(line.annualSalary);
};

const createMonthlyArray = () => Array.from({ length: 12 }, () => 0);

type MonthlyActualOptions = {
    year: YearFilter;
    fallbackYear?: string | number;
    fallbackDate?: string;
};

const getActualMonthIndex = (actualDate?: string, fallbackDate?: string) =>
    getFinancialMonthIndex(actualDate) ?? getFinancialMonthIndex(fallbackDate) ?? 11;

export const getActualObligationsByMonth = (
    line: FinancialLine,
    options: MonthlyActualOptions
) => {
    const monthly = createMonthlyArray();

    if (line.obligations && line.obligations.length > 0) {
        line.obligations.forEach(obligation => {
            if (!matchesActualYear(obligation.date, options.fallbackYear, options.year)) return;
            const month = getActualMonthIndex(obligation.date, options.fallbackDate);
            monthly[month] += toNumber(obligation.amount);
        });
        return monthly;
    }

    if (!matchesActualYear(line.actualObligationDate, options.fallbackYear, options.year)) return monthly;
    const month = getActualMonthIndex(line.actualObligationDate, options.fallbackDate);
    monthly[month] += toNumber(line.actualObligationAmount);
    return monthly;
};

export const getActualDisbursementsByMonth = (
    line: FinancialLine,
    options: MonthlyActualOptions
) => {
    const monthly = createMonthlyArray();

    if (line.disbursements && line.disbursements.length > 0) {
        line.disbursements.forEach(disbursement => {
            if (!matchesActualYear(disbursement.date, options.fallbackYear, options.year)) return;
            const month = getActualMonthIndex(disbursement.date, options.fallbackDate);
            monthly[month] += toNumber(disbursement.amount);
        });
        return monthly;
    }

    const monthlyTotal = MONTH_KEYS.reduce((sum, month) => sum + toNumber(line[`actualDisbursement${month}`]), 0);
    if (monthlyTotal > 0) {
        if (!matchesSelectedYear(options.fallbackYear, options.year)) return monthly;
        MONTH_KEYS.forEach((monthKey, index) => {
            monthly[index] += toNumber(line[`actualDisbursement${monthKey}`]);
        });
        return monthly;
    }

    if (!matchesActualYear(line.actualDisbursementDate, options.fallbackYear, options.year)) return monthly;
    const month = getActualMonthIndex(line.actualDisbursementDate, options.fallbackDate);
    monthly[month] += toNumber(line.actualDisbursementAmount);
    return monthly;
};

const normalizeComponent = (component?: string): FinancialComponent => {
    return FINANCIAL_COMPONENTS.includes(component as FinancialComponent)
        ? component as FinancialComponent
        : 'Program Management';
};

export const getActualObligationTotalInWindow = (
    line: FinancialLine,
    isDateIncluded: (date?: string) => boolean
) => {
    if (line.obligations && line.obligations.length > 0) {
        return line.obligations.reduce((sum, obligation) => {
            if (!isDateIncluded(obligation.date)) return sum;
            return sum + toNumber(obligation.amount);
        }, 0);
    }

    return isDateIncluded(line.actualObligationDate) ? toNumber(line.actualObligationAmount) : 0;
};

export const getActualDisbursementTotalAsOf = (
    line: FinancialLine,
    options: {
        targetYear: number;
        selectedMonth: number;
        fallbackYear?: string | number;
        isDateIncluded: (date?: string) => boolean;
    }
) => {
    if (line.disbursements && line.disbursements.length > 0) {
        return line.disbursements.reduce((sum, disbursement) => {
            if (!options.isDateIncluded(disbursement.date)) return sum;
            return sum + toNumber(disbursement.amount);
        }, 0);
    }

    const monthlyTotal = MONTH_KEYS.reduce((sum, month) => sum + toNumber(line[`actualDisbursement${month}`]), 0);
    if (monthlyTotal > 0) {
        const fallbackYear = Number(options.fallbackYear);
        if (!Number.isFinite(fallbackYear) || fallbackYear > options.targetYear) return 0;
        const monthLimit = fallbackYear < options.targetYear ? 11 : options.selectedMonth;
        return MONTH_KEYS.reduce((sum, month, index) => {
            if (index > monthLimit) return sum;
            return sum + toNumber(line[`actualDisbursement${month}`]);
        }, 0);
    }

    return options.isDateIncluded(line.actualDisbursementDate) ? toNumber(line.actualDisbursementAmount) : 0;
};

const addLineItem = (
    items: FinancialLineItem[],
    record: ScopedRecord,
    line: FinancialLine,
    filters: FinancialAggregationFilters,
    metadata: {
        sourceType: FinancialSourceType;
        component: FinancialComponent | string;
        packageType?: string;
        activityName: string;
        operatingUnit?: string;
        location?: string;
        ipoIds?: number[];
        ipoNames?: string[];
        targetDate?: string;
    }
) => {
    const fallbackYear = getRecordYear(record);
    const isTaggedExclusion = isRecordOrLineExcludedFromTargets(record, line);
    const isTargetScope = isTargetScopeRecord(record, filters);
    const isTarget = isTargetRecord(record, filters);
    const includeTarget = isTarget && !isTaggedExclusion;
    const includeActual = isActualRecord(record, filters);
    const rawTargetAllocation = isTargetScope ? getFinancialAllocation(line) : 0;
    const excludedTargetAllocation = isTargetScope && isTaggedExclusion ? rawTargetAllocation : 0;
    const alloc = includeTarget ? rawTargetAllocation : 0;
    const actualYear = filters.actualYear ?? 'All';
    const obli = includeActual ? getActualObligationTotal(line, { year: actualYear, fallbackYear }) : 0;
    const disb = includeActual ? getActualDisbursementTotal(line, { year: actualYear, fallbackYear }) : 0;
    const targetDate = metadata.targetDate || line.obligationMonth || line.obligationDate;
    const disbursementTargetDate = line.disbursementMonth || line.disbursementDate || targetDate;
    const obligationByMonth = includeActual ? getActualObligationsByMonth(line, { year: actualYear, fallbackYear, fallbackDate: targetDate }) : createMonthlyArray();
    const disbursementByMonth = includeActual ? getActualDisbursementsByMonth(line, { year: actualYear, fallbackYear, fallbackDate: disbursementTargetDate }) : createMonthlyArray();

    if (alloc === 0 && obli === 0 && disb === 0 && (!filters.includeTaggedExclusions || excludedTargetAllocation === 0)) return;

    items.push({
        recordId: record.id,
        sourceType: metadata.sourceType,
        component: normalizeComponent(metadata.component),
        packageType: metadata.packageType,
        activityName: metadata.activityName,
        objectType: line.objectType,
        uacsCode: line.uacsCode,
        recordYear: fallbackYear,
        fundType: record.fundType,
        tier: record.tier,
        status: record.status,
        workflowStatus: record.workflow_status,
        isRealignment: record.isRealignment,
        isSavings: record.isSavings,
        isCancelledLine: !!line.isCancelled,
        lineTag: getBudgetLineTag(line),
        excludedTargetAllocation,
        operatingUnit: metadata.operatingUnit,
        location: metadata.location,
        ipoIds: metadata.ipoIds,
        ipoNames: metadata.ipoNames,
        line,
        alloc,
        obli,
        disb,
        targetMonth: includeTarget ? getFinancialMonthIndex(targetDate) : undefined,
        obligationByMonth,
        disbursementByMonth,
    });
};

export const collectFinancialLineItems = (
    data: FinancialAggregationInput,
    filters: FinancialAggregationFilters
): FinancialLineItem[] => {
    const items: FinancialLineItem[] = [];

    (data.subprojects || []).forEach(subproject => {
        compact(subproject.details).forEach(detail => {
            addLineItem(items, subproject, detail, filters, {
                sourceType: 'subproject',
                component: 'Production and Livelihood',
                packageType: subproject.packageType || 'Other',
                activityName: subproject.name,
                operatingUnit: subproject.operatingUnit,
                location: subproject.location,
                ipoIds: subproject.ipo_id ? [Number(subproject.ipo_id)] : [],
                ipoNames: Array.isArray(subproject.indigenousPeopleOrganization)
                    ? subproject.indigenousPeopleOrganization
                    : [subproject.indigenousPeopleOrganization],
                targetDate: detail.obligationMonth,
            });
        });
    });

    (data.activities || []).forEach(activity => {
        compact(activity.expenses).forEach(expense => {
            addLineItem(items, activity, expense, filters, {
                sourceType: activity.type === 'Training' ? 'training' : 'activity',
                component: activity.component,
                packageType: activity.component === 'Program Management' ? 'Activities' : undefined,
                activityName: getActivityDisplayTitle(activity),
                operatingUnit: activity.operatingUnit,
                location: activity.location,
                ipoIds: (activity.participating_ipo_ids || []).map(Number).filter(Number.isFinite),
                ipoNames: activity.participatingIpos,
                targetDate: expense.obligationMonth,
            });
        });
    });

    (data.officeReqs || []).forEach(item => {
        addLineItem(items, item, item, filters, {
            sourceType: 'programManagement',
            component: 'Program Management',
            packageType: 'Office Requirements',
            activityName: item.equipment,
            operatingUnit: item.operatingUnit,
            targetDate: item.obligationDate,
        });
    });

    (data.staffingReqs || []).forEach(item => {
        const expenses = normalizeStaffingExpenses(compact(item.expenses));
        if (expenses.length > 0) {
            expenses.forEach(expense => {
                addLineItem(items, item, { ...expense, disbursementDate: (expense as FinancialLine).disbursementDate || item.disbursementDate }, filters, {
                    sourceType: 'programManagement',
                    component: 'Program Management',
                    packageType: 'Staff Requirements',
                    activityName: item.personnelPosition,
                    operatingUnit: item.operatingUnit,
                    targetDate: expense.obligationDate,
                });
            });
            return;
        }

        addLineItem(items, item, { ...item, annualSalary: item.annualSalary, obligationDate: item.obligationDate }, filters, {
            sourceType: 'programManagement',
            component: 'Program Management',
            packageType: 'Staff Requirements',
            activityName: item.personnelPosition,
            operatingUnit: item.operatingUnit,
            targetDate: item.obligationDate,
        });
    });

    (data.otherProgramExpenses || []).forEach(item => {
        addLineItem(items, item, item, filters, {
            sourceType: 'programManagement',
            component: 'Program Management',
            packageType: 'Other Expenses',
            activityName: item.particulars,
            operatingUnit: item.operatingUnit,
            targetDate: item.obligationDate,
        });
    });

    return items;
};

export const getActualObligationTotal = (
    line: FinancialLine,
    options: { year: YearFilter; fallbackYear?: string | number }
) => {
    if (line.obligations && line.obligations.length > 0) {
        return line.obligations.reduce((sum, obligation) => {
            if (!matchesActualYear(obligation.date, options.fallbackYear, options.year)) return sum;
            return sum + toNumber(obligation.amount);
        }, 0);
    }

    if (!matchesActualYear(line.actualObligationDate, options.fallbackYear, options.year)) return 0;
    return toNumber(line.actualObligationAmount);
};

export const getActualDisbursementTotal = (
    line: FinancialLine,
    options: { year: YearFilter; fallbackYear?: string | number }
) => {
    if (line.disbursements && line.disbursements.length > 0) {
        return line.disbursements.reduce((sum, disbursement) => {
            if (!matchesActualYear(disbursement.date, options.fallbackYear, options.year)) return sum;
            return sum + toNumber(disbursement.amount);
        }, 0);
    }

    const monthlyTotal = MONTH_KEYS.reduce((sum, month) => sum + toNumber(line[`actualDisbursement${month}`]), 0);
    if (monthlyTotal > 0) {
        return matchesSelectedYear(options.fallbackYear, options.year) ? monthlyTotal : 0;
    }

    if (!matchesActualYear(line.actualDisbursementDate, options.fallbackYear, options.year)) return 0;
    return toNumber(line.actualDisbursementAmount);
};

const addBucket = (target: FinancialBucket, values: Partial<FinancialBucket>) => {
    target.alloc += values.alloc || 0;
    target.obli += values.obli || 0;
    target.disb += values.disb || 0;
};

const roundedBucket = (bucket: FinancialBucket): FinancialBucket => ({
    alloc: Math.ceil(bucket.alloc),
    obli: Math.ceil(bucket.obli),
    disb: Math.ceil(bucket.disb),
});

export const aggregateHomepageFinancials = (
    data: FinancialAggregationInput,
    filters: FinancialAggregationFilters
): HomepageFinancialStats => {
    const subprojectsBucket: FinancialBucket = { alloc: 0, obli: 0, disb: 0 };
    const trainingsBucket: FinancialBucket = { alloc: 0, obli: 0, disb: 0 };
    const otherActivitiesBucket: FinancialBucket = { alloc: 0, obli: 0, disb: 0 };
    const programManagementBucket: FinancialBucket = { alloc: 0, obli: 0, disb: 0 };

    collectFinancialLineItems(data, filters).forEach(item => {
        const targetBucket =
            item.sourceType === 'subproject'
                ? subprojectsBucket
                : item.sourceType === 'training'
                    ? trainingsBucket
                    : item.sourceType === 'activity'
                        ? otherActivitiesBucket
                        : programManagementBucket;

        addBucket(targetBucket, item);
    });

    const totalBucket: FinancialBucket = { alloc: 0, obli: 0, disb: 0 };
    addBucket(totalBucket, subprojectsBucket);
    addBucket(totalBucket, trainingsBucket);
    addBucket(totalBucket, otherActivitiesBucket);
    addBucket(totalBucket, programManagementBucket);

    return {
        total: roundedBucket(totalBucket),
        subprojects: roundedBucket(subprojectsBucket),
        trainings: roundedBucket(trainingsBucket),
    };
};
