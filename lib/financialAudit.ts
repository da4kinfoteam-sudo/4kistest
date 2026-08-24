import type { FinancialAggregationFilters, FinancialAggregationInput, FinancialLineItem } from './financialAggregation';
import { collectFinancialLineItems } from './financialAggregation';
import { hasActualObligationRecords } from './financialObligationUtils';

export type FinancialAuditSeverity = 'High' | 'Warning' | 'Info';

export type FinancialAuditIssueType =
    | 'Missing due target obligation date'
    | 'Missing due target disbursement date'
    | 'Target obligation outside selected year'
    | 'Target disbursement outside selected year'
    | 'Target obligation due mismatch'
    | 'Target disbursement schedule mismatch'
    | 'Target disbursement due mismatch'
    | 'Missing due actual obligation'
    | 'Missing due actual disbursement'
    | 'Disbursement greater than obligation'
    | 'Actual greater than allocation'
    | 'Budget ceiling exceeded'
    | 'Missing budget ceiling'
    | 'Excluded line with target amount'
    | 'Cancelled line with actuals'
    | 'Negative actual obligation adjustment'
    | 'Realignment/savings line missing reason'
    | 'Line missing original budget snapshot';

export interface FinancialAuditBudgetCeiling {
    operating_unit: string;
    year: number;
    amount: number;
}

export type FinancialAuditNavigationTarget =
    | { type: 'subproject'; recordId: string | number }
    | { type: 'activity'; recordId: string | number }
    | { type: 'officeRequirement'; recordId: string | number }
    | { type: 'staffingRequirement'; recordId: string | number }
    | { type: 'otherProgramExpense'; recordId: string | number };

export interface FinancialAuditIssue {
    id: string;
    severity: FinancialAuditSeverity;
    issueType: FinancialAuditIssueType;
    source: string;
    recordName: string;
    lineItem: string;
    operatingUnit: string;
    year: string;
    fundType: string;
    tier: string;
    targetAllocation: number;
    targetObligationDue: number;
    targetDisbursementDue: number;
    actualObligation: number;
    actualDisbursement: number;
    budgetCeiling: number;
    ceilingVariance: number;
    excludedTaggedAmount: number;
    affectedAmount: number;
    affectedReports: string[];
    suggestedAction: string;
    navigationTarget?: FinancialAuditNavigationTarget;
}

export interface FinancialAuditSummary {
    totalBudgetCeiling: number;
    totalTargetAllocation: number;
    totalExcludedTaggedAmount: number;
    totalTargetObligationDue: number;
    totalTargetDisbursementDue: number;
    totalDiscrepancyDue: number;
    totalIssues: number;
    severityCounts: Record<FinancialAuditSeverity, number>;
    affectedAmountByIssue: Record<string, number>;
}

export interface FinancialAuditResult {
    lineItemCount: number;
    issues: FinancialAuditIssue[];
    summary: FinancialAuditSummary;
}

const MONTH_KEYS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const EPSILON = 0.01;

const toNumber = (value: unknown) => Number(value) || 0;

const formatYear = (value: unknown) => value === undefined || value === null || value === '' ? 'Unspecified' : String(value);

const getDateParts = (dateString?: string) => {
    if (!dateString) return null;
    const parts = dateString.split('-');
    if (parts.length >= 2) {
        const year = Number(parts[0]);
        const month = Number(parts[1]);
        if (Number.isFinite(year) && Number.isFinite(month) && month >= 1 && month <= 12) {
            return { year, monthIndex: month - 1 };
        }
    }
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return null;
    return { year: date.getUTCFullYear(), monthIndex: date.getUTCMonth() };
};

const isDateDue = (dateString: string | undefined, selectedYear: string, asOfMonth: number) => {
    if (!dateString || selectedYear === 'All') return false;
    const parts = getDateParts(dateString);
    return !!parts && parts.year.toString() === selectedYear && parts.monthIndex <= asOfMonth;
};

const isOutsideSelectedYear = (dateString: string | undefined, selectedYear: string) => {
    if (!dateString || selectedYear === 'All') return false;
    const parts = getDateParts(dateString);
    return !!parts && parts.year.toString() !== selectedYear;
};

const monthlyTargetDisbursementDue = (line: FinancialLineItem['line'], asOfMonth: number) =>
    MONTH_KEYS.reduce((sum, month, index) => {
        if (index > asOfMonth) return sum;
        return sum + toNumber(line[`disbursement${month}`]);
    }, 0);

const monthlyTargetDisbursementTotal = (line: FinancialLineItem['line']) =>
    MONTH_KEYS.reduce((sum, month) => sum + toNumber(line[`disbursement${month}`]), 0);

const actualMonthlyDisbursementTotal = (line: FinancialLineItem['line']) =>
    MONTH_KEYS.reduce((sum, month) => sum + toNumber(line[`actualDisbursement${month}`]), 0);

const getActualObligationTotal = (item: FinancialLineItem) => {
    const line = item.line;
    if (line.obligations && line.obligations.length > 0) {
        return line.obligations.reduce((sum, entry) => sum + toNumber(entry.amount), 0);
    }
    return toNumber(line.actualObligationAmount);
};

const getActualDisbursementTotal = (item: FinancialLineItem) => {
    const line = item.line;
    if (line.disbursements && line.disbursements.length > 0) {
        return line.disbursements.reduce((sum, entry) => sum + toNumber(entry.amount), 0);
    }

    const monthlyTotal = actualMonthlyDisbursementTotal(line);
    if (monthlyTotal > 0) return monthlyTotal;

    return toNumber(line.actualDisbursementAmount);
};

const sourceLabel = (item: FinancialLineItem) => {
    if (item.packageType === 'Budget Ceiling') return 'Budget Ceiling';
    switch (item.sourceType) {
        case 'subproject': return 'Subprojects';
        case 'training': return 'Trainings';
        case 'activity': return 'Activities';
        case 'programManagement': return 'Program Management';
        default: return 'Financial Records';
    }
};

const lineItemLabel = (item: FinancialLineItem) =>
    item.line.expenseParticular ||
    item.line.particulars ||
    item.line.equipment ||
    item.line.personnelPosition ||
    item.objectType ||
    item.uacsCode ||
    'Budget item';

const unique = (items: string[]) => Array.from(new Set(items.filter(Boolean)));

const navigationTarget = (item: FinancialLineItem): FinancialAuditNavigationTarget | undefined => {
    if (item.recordId === undefined || item.recordId === null) return undefined;
    if (item.sourceType === 'subproject') return { type: 'subproject', recordId: item.recordId };
    if (item.sourceType === 'training' || item.sourceType === 'activity') return { type: 'activity', recordId: item.recordId };
    if (item.packageType === 'Office Requirements') return { type: 'officeRequirement', recordId: item.recordId };
    if (item.packageType === 'Staff Requirements') return { type: 'staffingRequirement', recordId: item.recordId };
    if (item.packageType === 'Other Expenses') return { type: 'otherProgramExpense', recordId: item.recordId };
    return undefined;
};

const getTargetSchedule = (item: FinancialLineItem, selectedYear: string, asOfMonth: number) => {
    const line = item.line;
    const targetAllocation = item.alloc;
    const targetObligationDate = line.obligationMonth || line.obligationDate;
    const targetDisbursementDate = line.disbursementMonth || line.disbursementDate;
    const monthlyDisbursementTotal = monthlyTargetDisbursementTotal(line);
    const hasMonthlyDisbursementSchedule = monthlyDisbursementTotal > 0;
    const targetObligationDue = isDateDue(targetObligationDate, selectedYear, asOfMonth) ? targetAllocation : 0;
    const targetDisbursementDue = hasMonthlyDisbursementSchedule
        ? monthlyTargetDisbursementDue(line, asOfMonth)
        : isDateDue(targetDisbursementDate, selectedYear, asOfMonth) ? targetAllocation : 0;

    return {
        targetAllocation,
        targetObligationDate,
        targetDisbursementDate,
        hasMonthlyDisbursementSchedule,
        monthlyDisbursementTotal,
        targetObligationDue,
        targetDisbursementDue,
    };
};

export const buildFinancialAudit = (
    data: FinancialAggregationInput,
    filters: FinancialAggregationFilters,
    options: { auditAsOfMonth: number; budgetCeilings?: FinancialAuditBudgetCeiling[] }
): FinancialAuditResult => {
    const lineItems = collectFinancialLineItems(data, { ...filters, includeTaggedExclusions: true });
    const selectedYear = String(filters.year);
    const issues: FinancialAuditIssue[] = [];
    const ceilingGroups = new Map<string, { operatingUnit: string; year: string; allocation: number; ceiling: number }>();
    let totalTargetAllocation = 0;
    let totalExcludedTaggedAmount = 0;
    let totalTargetObligationDue = 0;
    let totalTargetDisbursementDue = 0;

    const getBudgetCeiling = (operatingUnit: string, year: string) => {
        const ceiling = (options.budgetCeilings || []).find(item =>
            item.operating_unit === operatingUnit && item.year?.toString() === year
        );
        return ceiling?.amount || 0;
    };

    const addCeilingGroup = (operatingUnit: string, year: string, allocation: number) => {
        if (!operatingUnit || operatingUnit === 'Unspecified' || !year || year === 'Unspecified') return;
        const key = `${operatingUnit}::${year}`;
        const existing = ceilingGroups.get(key) || {
            operatingUnit,
            year,
            allocation: 0,
            ceiling: getBudgetCeiling(operatingUnit, year),
        };
        existing.allocation += allocation;
        ceilingGroups.set(key, existing);
    };

    const addIssue = (
        item: FinancialLineItem,
        issueType: FinancialAuditIssueType,
        severity: FinancialAuditSeverity,
        affectedAmount: number,
        affectedReports: string[],
        suggestedAction: string,
        metrics: {
            targetAllocation: number;
            targetObligationDue: number;
            targetDisbursementDue: number;
            actualObligation: number;
            actualDisbursement: number;
            budgetCeiling?: number;
            ceilingVariance?: number;
            excludedTaggedAmount?: number;
            navigationTarget?: FinancialAuditNavigationTarget;
        }
    ) => {
        issues.push({
            id: `${item.sourceType}-${item.recordId ?? item.activityName}-${lineItemLabel(item)}-${issueType}-${issues.length}`,
            severity,
            issueType,
            source: sourceLabel(item),
            recordName: item.activityName || 'Untitled record',
            lineItem: lineItemLabel(item),
            operatingUnit: item.operatingUnit || 'Unspecified',
            year: formatYear(item.recordYear),
            fundType: item.fundType || 'Unspecified',
            tier: item.tier || 'Unspecified',
            targetAllocation: metrics.targetAllocation,
            targetObligationDue: metrics.targetObligationDue,
            targetDisbursementDue: metrics.targetDisbursementDue,
            actualObligation: metrics.actualObligation,
            actualDisbursement: metrics.actualDisbursement,
            budgetCeiling: metrics.budgetCeiling || 0,
            ceilingVariance: metrics.ceilingVariance || 0,
            excludedTaggedAmount: metrics.excludedTaggedAmount || 0,
            affectedAmount: Math.max(0, Math.ceil(affectedAmount)),
            affectedReports: unique(affectedReports),
            suggestedAction,
            navigationTarget: metrics.navigationTarget,
        });
    };

    lineItems.forEach(item => {
        const schedule = getTargetSchedule(item, selectedYear, options.auditAsOfMonth);
        const targetAllocation = schedule.targetAllocation;
        totalExcludedTaggedAmount += item.excludedTargetAllocation || 0;

        const actualObligation = getActualObligationTotal(item);
        const actualDisbursement = getActualDisbursementTotal(item);
        const hasObligationRecords = hasActualObligationRecords(item.line);
        const negativeObligationAdjustment = item.line.obligations?.length
            ? item.line.obligations.reduce((sum, entry) => Math.min(toNumber(entry.amount), 0) + sum, 0)
            : Math.min(toNumber(item.line.actualObligationAmount), 0);
        const recordYear = formatYear(item.recordYear);
        const metrics = {
            targetAllocation,
            targetObligationDue: schedule.targetObligationDue,
            targetDisbursementDue: schedule.targetDisbursementDue,
            actualObligation,
            actualDisbursement,
            budgetCeiling: 0,
            ceilingVariance: 0,
            excludedTaggedAmount: item.excludedTargetAllocation || 0,
            navigationTarget: navigationTarget(item),
        };

        totalTargetAllocation += targetAllocation;
        totalTargetObligationDue += schedule.targetObligationDue;
        totalTargetDisbursementDue += schedule.targetDisbursementDue;
        addCeilingGroup(item.operatingUnit || 'Unspecified', recordYear, targetAllocation);

        if ((item.excludedTargetAllocation || 0) > 0) {
            addIssue(
                item,
                'Excluded line with target amount',
                'Info',
                item.excludedTargetAllocation || 0,
                ['Financial Accomplishment', 'WFP', 'BEDS 1', 'BEDS 3', 'Budget Utilization'],
                'This cancelled/realignment/savings line keeps its encoded target for reference, but target reports exclude it from totals.',
                metrics
            );
        }

        if (item.lineTag === 'Cancelled' && (hasObligationRecords || actualDisbursement > 0)) {
            addIssue(
                item,
                'Cancelled line with actuals',
                'Warning',
                Math.max(Math.abs(actualObligation), actualDisbursement),
                ['Financial Accomplishment', 'Budget Utilization', 'Monthly Matrix'],
                'Review whether actual accomplishment should remain encoded on a cancelled budget line.',
                metrics
            );
        }

        if (negativeObligationAdjustment < 0) {
            addIssue(
                item,
                'Negative actual obligation adjustment',
                'Info',
                Math.abs(negativeObligationAdjustment),
                ['Financial Accomplishment', 'Financial Dashboard', 'Budget Utilization', 'Monthly Matrix'],
                'Verify the recorded adjustment reason and supporting obligation reversal documentation.',
                metrics
            );
        }

        if ((item.lineTag === 'Realignment' || item.lineTag === 'Savings') && !item.line.adjustmentReason) {
            addIssue(
                item,
                'Realignment/savings line missing reason',
                'Warning',
                item.excludedTargetAllocation || targetAllocation,
                ['Financial Accomplishment', 'Financial Audit'],
                'Add an adjustment reason so reviewers can trace why this line is excluded from target totals.',
                metrics
            );
        }

        if ((item.line.isCancelled || item.line.isRealignment || item.line.isSavings) && !item.line.originalCapturedAt) {
            addIssue(
                item,
                'Line missing original budget snapshot',
                'Warning',
                item.excludedTargetAllocation || targetAllocation,
                ['Financial Accomplishment', 'Financial Audit'],
                'Open and save the source record so the original planned amount is captured for audit reference.',
                metrics
            );
        }

        if (targetAllocation <= 0) {
            if (actualDisbursement > actualObligation && (hasObligationRecords || actualDisbursement > 0)) {
                addIssue(
                    item,
                    'Disbursement greater than obligation',
                    'High',
                    actualDisbursement - actualObligation,
                    ['Financial Dashboard', 'Budget Utilization', 'Monthly Matrix'],
                    'Review actual obligation and disbursement amounts; disbursement should not exceed obligation.',
                    metrics
                );
            }

            if (!item.excludedTargetAllocation && (actualObligation > 0 || actualDisbursement > 0)) {
                addIssue(
                    item,
                    'Actual greater than allocation',
                    'High',
                    Math.max(Math.abs(actualObligation), actualDisbursement),
                    ['Financial Dashboard', 'Budget Utilization', 'Monthly Matrix'],
                    'Review actual financial entries because actual totals exceed the target allocation.',
                    metrics
                );
            }
            return;
        }

        if (!schedule.targetObligationDate && selectedYear !== 'All') {
            addIssue(
                item,
                'Missing due target obligation date',
                'High',
                targetAllocation,
                ['WFP', 'BEDS 1'],
                'Add target obligation month/date so this allocation can be scheduled in WFP and BEDS 1.',
                metrics
            );
        } else if (isOutsideSelectedYear(schedule.targetObligationDate, selectedYear)) {
            addIssue(
                item,
                'Target obligation outside selected year',
                'Warning',
                targetAllocation,
                ['WFP', 'BEDS 1'],
                'Review the target obligation date or change the report year filter.',
                metrics
            );
        }

        if (!schedule.targetDisbursementDate && !schedule.hasMonthlyDisbursementSchedule && selectedYear !== 'All') {
            addIssue(
                item,
                'Missing due target disbursement date',
                'High',
                targetAllocation,
                ['BEDS 3'],
                'Add target disbursement month/date or monthly target disbursement schedule so BEDS 3 can include this item.',
                metrics
            );
        } else if (schedule.targetDisbursementDate && isOutsideSelectedYear(schedule.targetDisbursementDate, selectedYear)) {
            addIssue(
                item,
                'Target disbursement outside selected year',
                'Warning',
                targetAllocation,
                ['BEDS 3'],
                'Review the target disbursement date or change the report year filter.',
                metrics
            );
        }

        if (schedule.hasMonthlyDisbursementSchedule && Math.abs(schedule.monthlyDisbursementTotal - targetAllocation) > EPSILON) {
            addIssue(
                item,
                'Target disbursement schedule mismatch',
                'High',
                Math.abs(targetAllocation - schedule.monthlyDisbursementTotal),
                ['BEDS 3'],
                'Review monthly target disbursement schedule because its total should match the target allocation.',
                metrics
            );
        }

        if (schedule.targetObligationDue > 0 && Math.abs(schedule.targetObligationDue - targetAllocation) > EPSILON) {
            addIssue(
                item,
                'Target obligation due mismatch',
                'High',
                Math.abs(targetAllocation - schedule.targetObligationDue),
                ['WFP', 'BEDS 1'],
                'Review target obligation schedule amount against the item allocation.',
                metrics
            );
        }

        if (schedule.targetDisbursementDue > 0 && Math.abs(schedule.targetDisbursementDue - schedule.targetObligationDue) > EPSILON) {
            addIssue(
                item,
                'Target disbursement due mismatch',
                'High',
                Math.abs(schedule.targetObligationDue - schedule.targetDisbursementDue),
                ['BEDS 3'],
                'Review target disbursement schedule against target obligation due amount.',
                metrics
            );
        }

        if (schedule.targetObligationDue > 0 && !hasObligationRecords) {
            addIssue(
                item,
                'Missing due actual obligation',
                'Warning',
                schedule.targetObligationDue,
                ['Financial Dashboard', 'Budget Utilization', 'Monthly Matrix'],
                'Record actual obligation because the target obligation month is already due.',
                metrics
            );
        }

        if (schedule.targetDisbursementDue > 0 && actualDisbursement <= 0) {
            addIssue(
                item,
                'Missing due actual disbursement',
                'Warning',
                schedule.targetDisbursementDue,
                ['Financial Dashboard', 'Budget Utilization', 'Monthly Matrix'],
                'Record actual disbursement because the target disbursement month is already due.',
                metrics
            );
        }

        if (actualDisbursement > actualObligation && (hasObligationRecords || actualDisbursement > 0)) {
            addIssue(
                item,
                'Disbursement greater than obligation',
                'High',
                actualDisbursement - actualObligation,
                ['Financial Dashboard', 'Budget Utilization', 'Monthly Matrix'],
                'Review actual obligation and disbursement amounts; disbursement should not exceed obligation.',
                metrics
            );
        }

        if (actualObligation > targetAllocation || actualDisbursement > targetAllocation) {
            addIssue(
                item,
                'Actual greater than allocation',
                'High',
                Math.max(actualObligation, actualDisbursement) - targetAllocation,
                ['Financial Dashboard', 'Budget Utilization', 'Monthly Matrix'],
                'Review actual financial entries because actual totals exceed the target allocation.',
                metrics
            );
        }
    });

    let totalBudgetCeiling = 0;
    ceilingGroups.forEach(group => {
        totalBudgetCeiling += group.ceiling;
        const ceilingVariance = group.ceiling - group.allocation;
        const metrics = {
            targetAllocation: group.allocation,
            targetObligationDue: 0,
            targetDisbursementDue: 0,
            actualObligation: 0,
            actualDisbursement: 0,
            budgetCeiling: group.ceiling,
            ceilingVariance,
            excludedTaggedAmount: 0,
        };

        if (group.ceiling <= 0 && group.allocation > 0) {
            addIssue(
                {
                    sourceType: 'programManagement',
                    component: 'Program Management',
                    packageType: 'Budget Ceiling',
                    activityName: `${group.operatingUnit} ${group.year}`,
                    recordYear: Number(group.year),
                    operatingUnit: group.operatingUnit,
                    line: { particulars: 'Budget ceiling' },
                    alloc: group.allocation,
                    obli: 0,
                    disb: 0,
                    obligationByMonth: [],
                    disbursementByMonth: [],
                },
                'Missing budget ceiling',
                'Warning',
                group.allocation,
                ['Financial Dashboard', 'WFP', 'BEDS 1', 'BEDS 3'],
                'Set the OU/year budget ceiling in User Settings > DCF Management > Budget Ceilings.',
                metrics
            );
        } else if (group.allocation > group.ceiling) {
            addIssue(
                {
                    sourceType: 'programManagement',
                    component: 'Program Management',
                    packageType: 'Budget Ceiling',
                    activityName: `${group.operatingUnit} ${group.year}`,
                    recordYear: Number(group.year),
                    operatingUnit: group.operatingUnit,
                    line: { particulars: 'Budget ceiling' },
                    alloc: group.allocation,
                    obli: 0,
                    disb: 0,
                    obligationByMonth: [],
                    disbursementByMonth: [],
                },
                'Budget ceiling exceeded',
                'High',
                group.allocation - group.ceiling,
                ['Financial Dashboard', 'WFP', 'BEDS 1', 'BEDS 3'],
                'Review allocation entries or update the approved budget ceiling for this OU/year.',
                metrics
            );
        }
    });

    const severityCounts: Record<FinancialAuditSeverity, number> = { High: 0, Warning: 0, Info: 0 };
    const affectedAmountByIssue: Record<string, number> = {};
    issues.forEach(issue => {
        severityCounts[issue.severity] += 1;
        affectedAmountByIssue[issue.issueType] = (affectedAmountByIssue[issue.issueType] || 0) + issue.affectedAmount;
    });

    return {
        lineItemCount: lineItems.length,
        issues,
        summary: {
            totalBudgetCeiling: Math.ceil(totalBudgetCeiling),
            totalTargetAllocation: Math.ceil(totalTargetAllocation),
            totalExcludedTaggedAmount: Math.ceil(totalExcludedTaggedAmount),
            totalTargetObligationDue: Math.ceil(totalTargetObligationDue),
            totalTargetDisbursementDue: Math.ceil(totalTargetDisbursementDue),
            totalDiscrepancyDue: Math.ceil(Math.abs(totalTargetAllocation - totalTargetObligationDue) + Math.abs(totalTargetObligationDue - totalTargetDisbursementDue) + Math.max(0, totalTargetAllocation - totalBudgetCeiling)),
            totalIssues: issues.length,
            severityCounts,
            affectedAmountByIssue,
        },
    };
};
