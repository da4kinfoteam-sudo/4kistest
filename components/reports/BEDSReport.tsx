// Author: 4K
import React, { useMemo, useState } from 'react';
import { AlertTriangle, Download, Printer } from 'lucide-react';
import { Activity, OfficeRequirement, OtherProgramExpense, StaffingRequirement, Subproject } from '../../constants';
import {
    collectFinancialLineItems,
    FinancialAggregationFilters,
    FinancialLineItem,
} from '../../lib/financialAggregation';
import { buildFinancialAudit, FinancialAuditNavigationTarget } from '../../lib/financialAudit';
import { ReportExcelRequest, ReportPrintRequest, getReportingMonthIndex, isParentRealignmentOrSavings, withReportYearLabel } from './ReportUtils';

interface BEDSReportProps {
    data: {
        subprojects: Subproject[];
        trainings: Activity[];
        otherActivities: Activity[];
        officeReqs: OfficeRequirement[];
        staffingReqs: StaffingRequirement[];
        otherProgramExpenses: OtherProgramExpense[];
    };
    selectedYear: string;
    selectedReportingYear: string;
    selectedOu: string;
    selectedFundType: string;
    selectedTier: string;
    onSelectSubproject: (subproject: Subproject) => void;
    onSelectActivity: (activity: Activity) => void;
    onSelectOfficeReq: (req: OfficeRequirement) => void;
    onSelectStaffingReq: (req: StaffingRequirement) => void;
    onSelectOtherExpense: (req: OtherProgramExpense) => void;
    onPrintReport: (request: ReportPrintRequest) => void;
    onExportReport: (request: ReportExcelRequest) => void;
}

type MonthlyRow = {
    indicator: string;
    key: string;
    navigationTarget?: FinancialAuditNavigationTarget;
    m1: number; m2: number; m3: number; q1: number;
    m4: number; m5: number; m6: number; q2: number;
    m7: number; m8: number; m9: number; q3: number;
    m10: number; m11: number; m12: number; q4: number;
    total: number;
};

type Bed1Row = MonthlyRow & {
    janSeptActual: number;
    octDecEstimate: number;
    prevTotal: number;
    currTotal: number;
    compQ1: number; compQ2: number; compQ3: number; compQ4: number; compSubtotal: number;
    laterQ1: number; laterQ2: number; laterQ3: number; laterQ4: number; laterSubtotal: number;
};

type BedsSectionMap<T> = {
    'Social Preparation': T[];
    'Production and Livelihood': { isNestedExpandable: true; packages: Record<string, { items: T[] }> };
    'Marketing and Enterprise': T[];
    'Program Management': { isNestedExpandable: true; packages: Record<string, { items: T[] }> };
};

const MONTH_KEYS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const MONTH_FIELD_KEYS = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11', 'm12'] as const;
const DISBURSEMENT_SCHEDULE_ISSUES = new Set([
    'Missing due target disbursement date',
    'Target disbursement outside selected year',
    'Target disbursement schedule mismatch',
    'Target disbursement due mismatch',
]);

const formatCurrencyWhole = (amount: number) =>
    new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(Math.ceil(amount || 0));

const formatNumberWhole = (num: number) => Math.ceil(num || 0).toLocaleString('en-US');

const createMonthlyRow = (indicator: string, key: string, navigationTarget?: FinancialAuditNavigationTarget): MonthlyRow => ({
    indicator,
    key,
    navigationTarget,
    m1: 0, m2: 0, m3: 0, q1: 0,
    m4: 0, m5: 0, m6: 0, q2: 0,
    m7: 0, m8: 0, m9: 0, q3: 0,
    m10: 0, m11: 0, m12: 0, q4: 0,
    total: 0,
});

const createBed1Row = (indicator: string, key: string, navigationTarget?: FinancialAuditNavigationTarget): Bed1Row => ({
    ...createMonthlyRow(indicator, key, navigationTarget),
    janSeptActual: 0,
    octDecEstimate: 0,
    prevTotal: 0,
    currTotal: 0,
    compQ1: 0, compQ2: 0, compQ3: 0, compQ4: 0, compSubtotal: 0,
    laterQ1: 0, laterQ2: 0, laterQ3: 0, laterQ4: 0, laterSubtotal: 0,
});

const createSectionMap = <T,>(): BedsSectionMap<T> => ({
    'Social Preparation': [],
    'Production and Livelihood': { isNestedExpandable: true, packages: {} },
    'Marketing and Enterprise': [],
    'Program Management': {
        isNestedExpandable: true,
        packages: {
            'Staff Requirements': { items: [] },
            'Office Requirements': { items: [] },
            'Other Expenses': { items: [] },
            Activities: { items: [] },
        },
    },
});

const addToMonthlyRow = (row: MonthlyRow, monthIndex: number | undefined, amount: number) => {
    if (monthIndex === undefined || monthIndex < 0 || monthIndex > 11 || amount <= 0) return;
    const monthKey = MONTH_FIELD_KEYS[monthIndex];
    row[monthKey] += amount;
    if (monthIndex < 3) row.q1 += amount;
    else if (monthIndex < 6) row.q2 += amount;
    else if (monthIndex < 9) row.q3 += amount;
    else row.q4 += amount;
    row.total += amount;
};

const addToBed1Row = (row: Bed1Row, monthIndex: number | undefined, amount: number) => {
    addToMonthlyRow(row, monthIndex, amount);
    if (monthIndex === undefined || monthIndex < 0 || monthIndex > 11 || amount <= 0) return;
    row.currTotal += amount;
    if (monthIndex < 3) row.compQ1 += amount;
    else if (monthIndex < 6) row.compQ2 += amount;
    else if (monthIndex < 9) row.compQ3 += amount;
    else row.compQ4 += amount;
    row.compSubtotal = row.compQ1 + row.compQ2 + row.compQ3 + row.compQ4;
};

const mergeMonthlyRows = <T extends MonthlyRow>(target: T, source: T) => {
    for (let index = 1; index <= 12; index += 1) {
        const key = `m${index}` as keyof T;
        target[key] = ((target[key] as number) + (source[key] as number)) as T[keyof T];
    }
    target.q1 += source.q1;
    target.q2 += source.q2;
    target.q3 += source.q3;
    target.q4 += source.q4;
    target.total += source.total;
};

const mergeBed1Rows = (target: Bed1Row, source: Bed1Row) => {
    mergeMonthlyRows(target, source);
    target.janSeptActual += source.janSeptActual;
    target.octDecEstimate += source.octDecEstimate;
    target.prevTotal += source.prevTotal;
    target.currTotal += source.currTotal;
    target.compQ1 += source.compQ1;
    target.compQ2 += source.compQ2;
    target.compQ3 += source.compQ3;
    target.compQ4 += source.compQ4;
    target.compSubtotal += source.compSubtotal;
    target.laterQ1 += source.laterQ1;
    target.laterQ2 += source.laterQ2;
    target.laterQ3 += source.laterQ3;
    target.laterQ4 += source.laterQ4;
    target.laterSubtotal += source.laterSubtotal;
};

const addOrMergeRow = <T extends MonthlyRow>(list: T[], row: T, merge: (target: T, source: T) => void) => {
    const existing = list.find(item => item.key === row.key);
    if (existing) {
        merge(existing, row);
        return;
    }
    list.push(row);
};

const navigationTarget = (item: FinancialLineItem): FinancialAuditNavigationTarget | undefined => {
    if (item.recordId === undefined || item.recordId === null) return undefined;
    if (item.sourceType === 'subproject') return { type: 'subproject', recordId: item.recordId };
    if (item.sourceType === 'training' || item.sourceType === 'activity') return { type: 'activity', recordId: item.recordId };
    if (item.packageType === 'Staff Requirements') return { type: 'staffingRequirement', recordId: item.recordId };
    if (item.packageType === 'Other Expenses') return { type: 'otherProgramExpense', recordId: item.recordId };
    return { type: 'officeRequirement', recordId: item.recordId };
};

const lineItemLabel = (item: FinancialLineItem) =>
    item.line.expenseParticular ||
    item.line.particulars ||
    item.line.equipment ||
    item.line.personnelPosition ||
    item.activityName ||
    'Budget item';

const rowKey = (item: FinancialLineItem) => [
    item.sourceType,
    item.recordId ?? item.activityName,
    item.packageType,
    lineItemLabel(item),
    item.objectType,
    item.uacsCode,
].filter(Boolean).join('::');

const getTargetList = <T,>(sections: BedsSectionMap<T>, item: FinancialLineItem): T[] => {
    if (item.component === 'Production and Livelihood') {
        const packageName = item.packageType || (item.sourceType === 'training' ? 'Trainings' : 'Other');
        if (!sections['Production and Livelihood'].packages[packageName]) {
            sections['Production and Livelihood'].packages[packageName] = { items: [] };
        }
        return sections['Production and Livelihood'].packages[packageName].items;
    }

    if (item.component === 'Program Management') {
        const packageName = item.packageType || 'Office Requirements';
        if (!sections['Program Management'].packages[packageName]) {
            sections['Program Management'].packages[packageName] = { items: [] };
        }
        return sections['Program Management'].packages[packageName].items;
    }

    return sections[item.component] as T[];
};

const getMonthlyTargetDisbursementTotal = (item: FinancialLineItem) =>
    MONTH_KEYS.reduce((sum, month) => sum + (Number(item.line[`disbursement${month}`]) || 0), 0);

const addTargetDisbursementSchedule = (row: MonthlyRow, item: FinancialLineItem, reportingYear: string) => {
    const monthlyScheduleTotal = getMonthlyTargetDisbursementTotal(item);
    if (monthlyScheduleTotal > 0) {
        const fallbackYear = item.recordYear?.toString();
        if (reportingYear === 'All' || fallbackYear === reportingYear) {
            MONTH_KEYS.forEach((month, index) => addToMonthlyRow(row, index, Number(item.line[`disbursement${month}`]) || 0));
        }
        return;
    }
    addToMonthlyRow(row, getReportingMonthIndex(item.line.disbursementMonth || item.line.disbursementDate, reportingYear, item.recordYear), item.alloc);
};

const getGrandTotals = <T extends MonthlyRow>(dataSet: BedsSectionMap<T>) => Object.values(dataSet).flatMap(component => {
    if (Array.isArray(component)) return component;
    return Object.values(component.packages).flatMap(pkg => pkg.items);
});

const getMonthlyTotals = <T extends MonthlyRow>(items: T[]): MonthlyRow => {
    const totals = createMonthlyRow('TOTAL', 'total');
    items.forEach(item => mergeMonthlyRows(totals, item));
    return totals;
};

const getBed1Totals = (items: Bed1Row[]): Bed1Row => {
    const totals = createBed1Row('TOTAL', 'total');
    items.forEach(item => mergeBed1Rows(totals, item));
    return totals;
};

const BEDSReport: React.FC<BEDSReportProps> = ({
    data,
    selectedYear,
    selectedReportingYear,
    selectedOu,
    selectedFundType,
    selectedTier,
    onSelectSubproject,
    onSelectActivity,
    onSelectOfficeReq,
    onSelectStaffingReq,
    onSelectOtherExpense,
    onPrintReport,
    onExportReport,
}) => {
    const [expandedRows, setExpandedRows] = useState(new Set<string>());

    const dataCellClass = 'beds-report__cell';
    const indentClasses: Record<number, string> = { 0: '', 1: 'beds-report__indent--1', 2: 'beds-report__indent--2', 3: 'beds-report__indent--3' };
    const isYearSelected = selectedYear !== 'All';

    const financialInput = useMemo(() => ({
        subprojects: data.subprojects,
        activities: [...data.trainings, ...data.otherActivities],
        officeReqs: data.officeReqs,
        staffingReqs: data.staffingReqs,
        otherProgramExpenses: data.otherProgramExpenses,
    }), [data]);

    const financialFilters = useMemo<FinancialAggregationFilters>(() => ({
        year: selectedYear,
        actualYear: selectedReportingYear,
        operatingUnit: selectedOu,
        tier: selectedTier,
        fundType: selectedFundType,
    }), [selectedYear, selectedReportingYear, selectedOu, selectedTier, selectedFundType]);

    const financialLineItems = useMemo(
        () => collectFinancialLineItems(financialInput, financialFilters).filter(item => item.alloc > 0),
        [financialInput, financialFilters]
    );

    const bed1Data = useMemo(() => {
        const sections = createSectionMap<Bed1Row>();
        financialLineItems.forEach(item => {
            const row = createBed1Row(item.activityName, rowKey(item), navigationTarget(item));
            addToBed1Row(row, getReportingMonthIndex(item.line.obligationMonth || item.line.obligationDate, selectedReportingYear, item.recordYear), item.alloc);
            addOrMergeRow(getTargetList(sections, item), row, mergeBed1Rows);
        });
        return sections;
    }, [financialLineItems, selectedReportingYear]);

    const bed3Data = useMemo(() => {
        const sections = createSectionMap<MonthlyRow>();
        financialLineItems.forEach(item => {
            const row = createMonthlyRow(item.activityName, rowKey(item), navigationTarget(item));
            addTargetDisbursementSchedule(row, item, selectedReportingYear);
            addOrMergeRow(getTargetList(sections, item), row, mergeMonthlyRows);
        });
        return sections;
    }, [financialLineItems, selectedReportingYear]);

    const bed2Data = useMemo(() => {
        const sections = createSectionMap<MonthlyRow>();
        const addPhysicalItem = (component: string, packageName: string | undefined, indicator: string, key: string, date: string | undefined, amount: number, nav?: FinancialAuditNavigationTarget) => {
            const itemLike: FinancialLineItem = {
                sourceType: nav?.type === 'activity' ? 'activity' : nav?.type === 'subproject' ? 'subproject' : 'programManagement',
                component: component as FinancialLineItem['component'],
                packageType: packageName,
                activityName: indicator,
                line: {},
                alloc: 1,
                obli: 0,
                disb: 0,
                obligationByMonth: [],
                disbursementByMonth: [],
            };
            const row = createMonthlyRow(indicator, key, nav);
            addToMonthlyRow(row, getReportingMonthIndex(date, selectedReportingYear), amount);
            addOrMergeRow(getTargetList(sections, itemLike), row, mergeMonthlyRows);
        };

        data.subprojects
            .filter(item => !isParentRealignmentOrSavings(item) && item.status !== 'Cancelled')
            .forEach(item => addPhysicalItem(
                'Production and Livelihood',
                item.packageType || 'Other',
                item.name,
                `subproject::${item.id}`,
                item.estimatedCompletionDate,
                1,
                { type: 'subproject', recordId: item.id }
            ));

        [...data.trainings, ...data.otherActivities]
            .filter(item => !isParentRealignmentOrSavings(item) && item.status !== 'Cancelled')
            .forEach(item => addPhysicalItem(
                item.component,
                item.component === 'Production and Livelihood' && item.type === 'Training' ? 'Trainings' : item.component === 'Program Management' ? 'Activities' : undefined,
                item.name,
                `activity::${item.id}`,
                item.endDate || item.date,
                1,
                { type: 'activity', recordId: item.id }
            ));

        data.officeReqs
            .filter(item => !isParentRealignmentOrSavings(item) && item.status !== 'Cancelled')
            .forEach(item => addPhysicalItem(
                'Program Management',
                'Office Requirements',
                item.equipment,
                `office::${item.id}`,
                item.physicalDeliveryDate || item.obligationDate,
                Number(item.numberOfUnits) || 1,
                { type: 'officeRequirement', recordId: item.id }
            ));

        data.staffingReqs
            .filter(item => !isParentRealignmentOrSavings(item))
            .forEach(item => addPhysicalItem(
                item.component || 'Program Management',
                'Staff Requirements',
                item.personnelPosition,
                `staffing::${item.id}`,
                item.obligationDate,
                1,
                { type: 'staffingRequirement', recordId: item.id }
            ));

        return sections;
    }, [data, selectedReportingYear]);

    const beds3Warnings = useMemo(() => {
        const audit = buildFinancialAudit(financialInput, financialFilters, {
            auditAsOfMonth: 11,
            budgetCeilings: [],
        });
        return audit.issues.filter(issue =>
            issue.affectedReports.includes('BEDS 3') && DISBURSEMENT_SCHEDULE_ISSUES.has(issue.issueType)
        );
    }, [financialInput, financialFilters]);

    const bed3AffectedAmount = beds3Warnings.reduce((sum, issue) => sum + issue.affectedAmount, 0);

    const toggleRow = (key: string) => {
        setExpandedRows(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const openNavigationTarget = (target?: FinancialAuditNavigationTarget) => {
        if (!target) return;
        const findById = <T extends { id?: string | number }>(items: T[], id: string | number) =>
            items.find(item => item.id?.toString() === id.toString());

        if (target.type === 'subproject') {
            const record = findById(data.subprojects, target.recordId);
            if (record) onSelectSubproject(record);
        } else if (target.type === 'activity') {
            const record = findById([...data.trainings, ...data.otherActivities], target.recordId);
            if (record) onSelectActivity(record);
        } else if (target.type === 'officeRequirement') {
            const record = findById(data.officeReqs, target.recordId);
            if (record) onSelectOfficeReq(record);
        } else if (target.type === 'staffingRequirement') {
            const record = findById(data.staffingReqs, target.recordId);
            if (record) onSelectStaffingReq(record);
        } else if (target.type === 'otherProgramExpense') {
            const record = findById(data.otherProgramExpenses, target.recordId);
            if (record) onSelectOtherExpense(record);
        }
    };

    const renderItemLabel = (item: MonthlyRow) => {
        if (!item.navigationTarget) return item.indicator;
        return (
            <button
                type="button"
                className="table-link beds-report-item-link"
                onClick={() => openNavigationTarget(item.navigationTarget)}
                title="Open source record"
            >
                {item.indicator}
            </button>
        );
    };

    const renderBed1Totals = (items: Bed1Row[], label: string) => {
        const totals = getBed1Totals(items);
        return (
            <tr className="beds-report__row beds-report__row--total">
                <td className={`${dataCellClass} beds-report__cell--sticky`}>{label}</td>
                <td className={`${dataCellClass} text-center`}></td>
                <td className={`${dataCellClass} text-right`}></td>
                <td className={`${dataCellClass} text-right`}></td>
                <td className={`${dataCellClass} text-right`}></td>
                <td className={`${dataCellClass} text-right beds-report__cell--highlight`}>{totals.currTotal > 0 ? formatCurrencyWhole(totals.currTotal) : ''}</td>
                <td className={`${dataCellClass} text-right`}>{totals.compQ1 > 0 ? formatCurrencyWhole(totals.compQ1) : ''}</td>
                <td className={`${dataCellClass} text-right`}>{totals.compQ2 > 0 ? formatCurrencyWhole(totals.compQ2) : ''}</td>
                <td className={`${dataCellClass} text-right`}>{totals.compQ3 > 0 ? formatCurrencyWhole(totals.compQ3) : ''}</td>
                <td className={`${dataCellClass} text-right`}>{totals.compQ4 > 0 ? formatCurrencyWhole(totals.compQ4) : ''}</td>
                <td className={`${dataCellClass} text-right beds-report__cell--emphasis`}>{totals.compSubtotal > 0 ? formatCurrencyWhole(totals.compSubtotal) : ''}</td>
                <td colSpan={5} className={dataCellClass}></td>
            </tr>
        );
    };

    const renderMonthlyTotals = (items: MonthlyRow[], label: string, bedType: 'BED2' | 'BED3') => {
        const totals = getMonthlyTotals(items);
        const fmt = (val: number) => bedType === 'BED2' ? (val > 0 ? formatNumberWhole(val) : '') : (val > 0 ? formatCurrencyWhole(val) : '');
        return (
            <tr className="beds-report__row beds-report__row--total">
                <td className={`${dataCellClass} beds-report__cell--sticky`}>{label}</td>
                {Array.from({ length: 12 }, (_, index) => (
                    <React.Fragment key={index}>
                        <td className={`${dataCellClass} text-right`}>{fmt(totals[`m${index + 1}` as keyof MonthlyRow] as number)}</td>
                        {[2, 5, 8, 11].includes(index) && (
                            <td className={`${dataCellClass} text-right beds-report__cell--quarter`}>
                                {fmt(index === 2 ? totals.q1 : index === 5 ? totals.q2 : index === 8 ? totals.q3 : totals.q4)}
                            </td>
                        )}
                    </React.Fragment>
                ))}
                <td className={`${dataCellClass} text-right beds-report__cell--grand`}>{fmt(totals.total)}</td>
            </tr>
        );
    };

    const renderData = (rowsData: BedsSectionMap<Bed1Row> | BedsSectionMap<MonthlyRow>, bedType: 'BED1' | 'BED2' | 'BED3') => {
        const renderRow = (item: Bed1Row | MonthlyRow, key: string, level: number) => {
            if (bedType === 'BED1') {
                const row = item as Bed1Row;
                return (
                    <tr key={key}>
                        <td className={`${dataCellClass} ${indentClasses[level]} beds-report__cell--sticky`}>{renderItemLabel(row)}</td>
                        <td className={`${dataCellClass} text-center`}></td>
                        <td colSpan={3} className={dataCellClass}></td>
                        <td className={`${dataCellClass} text-right beds-report__cell--highlight`}>{row.currTotal > 0 ? formatCurrencyWhole(row.currTotal) : ''}</td>
                        <td className={`${dataCellClass} text-right`}>{row.compQ1 > 0 ? formatCurrencyWhole(row.compQ1) : ''}</td>
                        <td className={`${dataCellClass} text-right`}>{row.compQ2 > 0 ? formatCurrencyWhole(row.compQ2) : ''}</td>
                        <td className={`${dataCellClass} text-right`}>{row.compQ3 > 0 ? formatCurrencyWhole(row.compQ3) : ''}</td>
                        <td className={`${dataCellClass} text-right`}>{row.compQ4 > 0 ? formatCurrencyWhole(row.compQ4) : ''}</td>
                        <td className={`${dataCellClass} text-right beds-report__cell--emphasis`}>{row.compSubtotal > 0 ? formatCurrencyWhole(row.compSubtotal) : ''}</td>
                        <td colSpan={5} className={dataCellClass}></td>
                    </tr>
                );
            }

            const row = item as MonthlyRow;
            const fmt = (val: number) => bedType === 'BED2' ? (val > 0 ? formatNumberWhole(val) : '') : (val > 0 ? formatCurrencyWhole(val) : '');
            return (
                <tr key={key}>
                    <td className={`${dataCellClass} ${indentClasses[level]} beds-report__cell--sticky`}>{renderItemLabel(row)}</td>
                    {Array.from({ length: 12 }, (_, index) => (
                        <React.Fragment key={index}>
                            <td className={`${dataCellClass} text-right`}>{fmt(row[`m${index + 1}` as keyof MonthlyRow] as number)}</td>
                            {[2, 5, 8, 11].includes(index) && (
                                <td className={`${dataCellClass} text-right beds-report__cell--quarter`}>
                                    {fmt(index === 2 ? row.q1 : index === 5 ? row.q2 : index === 8 ? row.q3 : row.q4)}
                                </td>
                            )}
                        </React.Fragment>
                    ))}
                    <td className={`${dataCellClass} text-right beds-report__cell--emphasis`}>{fmt(row.total)}</td>
                </tr>
            );
        };

        const renderSummary = (items: Array<Bed1Row | MonthlyRow>, label: string, rowKeyValue: string, level: number) => {
            const isExpanded = expandedRows.has(rowKeyValue);
            if (bedType === 'BED1') {
                const totals = getBed1Totals(items as Bed1Row[]);
                return (
                    <tr onClick={() => toggleRow(rowKeyValue)} className="beds-report__row beds-report__row--summary">
                        <td className={`${dataCellClass} ${indentClasses[level]} beds-report__cell--sticky`}>
                            <span className="beds-report__expand" aria-hidden="true">{isExpanded ? '−' : '+'}</span> {label}
                        </td>
                        <td className={dataCellClass}></td>
                        <td colSpan={3} className={dataCellClass}></td>
                        <td className={`${dataCellClass} text-right beds-report__cell--highlight`}>{totals.currTotal > 0 ? formatCurrencyWhole(totals.currTotal) : ''}</td>
                        <td className={`${dataCellClass} text-right`}>{totals.compQ1 > 0 ? formatCurrencyWhole(totals.compQ1) : ''}</td>
                        <td className={`${dataCellClass} text-right`}>{totals.compQ2 > 0 ? formatCurrencyWhole(totals.compQ2) : ''}</td>
                        <td className={`${dataCellClass} text-right`}>{totals.compQ3 > 0 ? formatCurrencyWhole(totals.compQ3) : ''}</td>
                        <td className={`${dataCellClass} text-right`}>{totals.compQ4 > 0 ? formatCurrencyWhole(totals.compQ4) : ''}</td>
                        <td className={`${dataCellClass} text-right`}>{totals.compSubtotal > 0 ? formatCurrencyWhole(totals.compSubtotal) : ''}</td>
                        <td colSpan={5} className={dataCellClass}></td>
                    </tr>
                );
            }

            const totals = getMonthlyTotals(items as MonthlyRow[]);
            const fmt = (val: number) => bedType === 'BED2' ? (val > 0 ? formatNumberWhole(val) : '') : (val > 0 ? formatCurrencyWhole(val) : '');
            return (
                <tr onClick={() => toggleRow(rowKeyValue)} className="beds-report__row beds-report__row--summary">
                    <td className={`${dataCellClass} ${indentClasses[level]} beds-report__cell--sticky`}>
                        <span className="beds-report__expand" aria-hidden="true">{isExpanded ? '−' : '+'}</span> {label}
                    </td>
                    {Array.from({ length: 12 }, (_, index) => (
                        <React.Fragment key={index}>
                            <td className={`${dataCellClass} text-right`}>{fmt(totals[`m${index + 1}` as keyof MonthlyRow] as number)}</td>
                            {[2, 5, 8, 11].includes(index) && (
                                <td className={`${dataCellClass} text-right beds-report__cell--quarter`}>
                                    {fmt(index === 2 ? totals.q1 : index === 5 ? totals.q2 : index === 8 ? totals.q3 : totals.q4)}
                                </td>
                            )}
                        </React.Fragment>
                    ))}
                    <td className={`${dataCellClass} text-right beds-report__cell--emphasis`}>{fmt(totals.total)}</td>
                </tr>
            );
        };

        return Object.entries(rowsData).map(([key, componentData]) => {
            if (Array.isArray(componentData)) {
                return (
                    <React.Fragment key={key}>
                        {renderSummary(componentData, key, `${bedType}-${key}`, 0)}
                        {expandedRows.has(`${bedType}-${key}`) && componentData.map((item, index) => renderRow(item, `${key}-${index}`, 1))}
                    </React.Fragment>
                );
            }

            const allPackageItems = Object.values(componentData.packages).flatMap(pkg => pkg.items);
            return (
                <React.Fragment key={key}>
                    {renderSummary(allPackageItems, key, `${bedType}-${key}`, 0)}
                    {expandedRows.has(`${bedType}-${key}`) && Object.entries(componentData.packages).map(([packageName, packageData]) => (
                        packageData.items.length > 0 && (
                            <React.Fragment key={packageName}>
                                {renderSummary(packageData.items, packageName, `${bedType}-${key}-${packageName}`, 1)}
                                {expandedRows.has(`${bedType}-${key}-${packageName}`) && packageData.items.map((item, index) => renderRow(item, `${packageName}-${index}`, 2))}
                            </React.Fragment>
                        )
                    ))}
                </React.Fragment>
            );
        });
    };

    const handleDownloadBEDSXlsx = () => {
        const sheets: ReportExcelRequest['sheets'] = [];

        const addBed1Sheet = () => {
            const rows: any[][] = [
                ['Program/Activity/Project', 'Performance Indicator', 'Current Year Obligation', null, null, 'Comprehensive Release', null, null, null, null, 'For Later Release', null, null, null, null],
                [null, null, 'Actual (Jan-Sept)', 'Estimate (Oct-Dec)', 'Total Target', 'Q1', 'Q2', 'Q3', 'Q4', 'Subtotal', 'Q1', 'Q2', 'Q3', 'Q4', 'Subtotal'],
            ];
            const pushItems = (items: Bed1Row[], indent: string) => items.forEach(item => rows.push([
                indent + item.indicator, '', Math.ceil(item.janSeptActual), Math.ceil(item.octDecEstimate), Math.ceil(item.currTotal),
                Math.ceil(item.compQ1), Math.ceil(item.compQ2), Math.ceil(item.compQ3), Math.ceil(item.compQ4), Math.ceil(item.compSubtotal),
                Math.ceil(item.laterQ1), Math.ceil(item.laterQ2), Math.ceil(item.laterQ3), Math.ceil(item.laterQ4), Math.ceil(item.laterSubtotal),
            ]));
            const pushSummary = (label: string, items: Bed1Row[]) => {
                const totals = getBed1Totals(items);
                rows.push([
                    label, 'Total', Math.ceil(totals.janSeptActual), Math.ceil(totals.octDecEstimate), Math.ceil(totals.currTotal),
                    Math.ceil(totals.compQ1), Math.ceil(totals.compQ2), Math.ceil(totals.compQ3), Math.ceil(totals.compQ4), Math.ceil(totals.compSubtotal),
                    Math.ceil(totals.laterQ1), Math.ceil(totals.laterQ2), Math.ceil(totals.laterQ3), Math.ceil(totals.laterQ4), Math.ceil(totals.laterSubtotal),
                ]);
            };

            Object.entries(bed1Data).forEach(([key, component]) => {
                if (Array.isArray(component)) {
                    pushSummary(key, component);
                    pushItems(component, '  ');
                } else {
                    const nestedComponent = component as BedsSectionMap<Bed1Row>['Production and Livelihood'];
                    const items = Object.values(nestedComponent.packages).flatMap(pkg => pkg.items);
                    pushSummary(key, items);
                    Object.entries(nestedComponent.packages).forEach(([packageName, packageData]) => {
                        if (packageData.items.length > 0) {
                            pushSummary(`  ${packageName}`, packageData.items);
                            pushItems(packageData.items, '    ');
                        }
                    });
                }
            });
            pushSummary('GRAND TOTAL', getGrandTotals(bed1Data));

            sheets.push({
                sheetName: 'BED 1',
                rows,
                headerRowCount: 2,
                merges: [
                    { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } },
                    { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } },
                    { s: { r: 0, c: 2 }, e: { r: 0, c: 4 } },
                    { s: { r: 0, c: 5 }, e: { r: 0, c: 9 } },
                    { s: { r: 0, c: 10 }, e: { r: 0, c: 14 } },
                ],
                columnWidths: [34, 24, ...Array(13).fill(14)],
                columnFormats: Object.fromEntries(Array.from({ length: 13 }, (_, index) => [index + 2, 'money'])),
            });
        };

        const addMonthlySheet = (dataMap: BedsSectionMap<MonthlyRow>, sheetName: string) => {
            const rows: any[][] = [
                ['Program/Activity/Project', 'Quarter 1', null, null, null, 'Quarter 2', null, null, null, 'Quarter 3', null, null, null, 'Quarter 4', null, null, null, 'Grand Total'],
                [null, 'Jan', 'Feb', 'Mar', 'Total', 'Apr', 'May', 'Jun', 'Total', 'Jul', 'Aug', 'Sep', 'Total', 'Oct', 'Nov', 'Dec', 'Total', null],
            ];
            const pushItems = (items: MonthlyRow[], indent: string) => items.forEach(item => rows.push([
                indent + item.indicator,
                Math.ceil(item.m1), Math.ceil(item.m2), Math.ceil(item.m3), Math.ceil(item.q1),
                Math.ceil(item.m4), Math.ceil(item.m5), Math.ceil(item.m6), Math.ceil(item.q2),
                Math.ceil(item.m7), Math.ceil(item.m8), Math.ceil(item.m9), Math.ceil(item.q3),
                Math.ceil(item.m10), Math.ceil(item.m11), Math.ceil(item.m12), Math.ceil(item.q4),
                Math.ceil(item.total),
            ]));
            const pushSummary = (label: string, items: MonthlyRow[]) => {
                const totals = getMonthlyTotals(items);
                rows.push([
                    label,
                    Math.ceil(totals.m1), Math.ceil(totals.m2), Math.ceil(totals.m3), Math.ceil(totals.q1),
                    Math.ceil(totals.m4), Math.ceil(totals.m5), Math.ceil(totals.m6), Math.ceil(totals.q2),
                    Math.ceil(totals.m7), Math.ceil(totals.m8), Math.ceil(totals.m9), Math.ceil(totals.q3),
                    Math.ceil(totals.m10), Math.ceil(totals.m11), Math.ceil(totals.m12), Math.ceil(totals.q4),
                    Math.ceil(totals.total),
                ]);
            };

            Object.entries(dataMap).forEach(([key, component]) => {
                if (Array.isArray(component)) {
                    pushSummary(key, component);
                    pushItems(component, '  ');
                } else {
                    const items = Object.values(component.packages).flatMap(pkg => pkg.items);
                    pushSummary(key, items);
                    Object.entries(component.packages).forEach(([packageName, packageData]) => {
                        if (packageData.items.length > 0) {
                            pushSummary(`  ${packageName}`, packageData.items);
                            pushItems(packageData.items, '    ');
                        }
                    });
                }
            });
            pushSummary('GRAND TOTAL', getGrandTotals(dataMap));

            sheets.push({
                sheetName,
                rows,
                headerRowCount: 2,
                merges: [
                    { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } },
                    { s: { r: 0, c: 1 }, e: { r: 0, c: 4 } },
                    { s: { r: 0, c: 5 }, e: { r: 0, c: 8 } },
                    { s: { r: 0, c: 9 }, e: { r: 0, c: 12 } },
                    { s: { r: 0, c: 13 }, e: { r: 0, c: 16 } },
                    { s: { r: 0, c: 17 }, e: { r: 1, c: 17 } },
                ],
                columnWidths: [34, ...Array(17).fill(12)],
                columnFormats: Object.fromEntries(Array.from({ length: 17 }, (_, index) => [index + 1, 'money'])),
            });
        };

        addBed1Sheet();
        addMonthlySheet(bed2Data, 'BED 2');
        addMonthlySheet(bed3Data, 'BED 3');
        onExportReport({
            reportName: withReportYearLabel('Budget Execution Documents (BEDS)', selectedYear, selectedReportingYear),
            ouName: selectedOu === 'All' ? 'All OUs' : selectedOu,
            fileName: `BEDS_Report_FY${selectedYear}_RY${selectedReportingYear}_${selectedOu}.xlsx`,
            sheets,
        });
    };

    const renderMonthlyHeader = () => (
        <>
            <tr>
                <th rowSpan={2} className="beds-report__header-cell beds-report__header-cell--sticky beds-report__header-cell--label">Program/Activity/Project</th>
                <th colSpan={4} className="beds-report__header-cell beds-report__header-cell--quarter">Quarter 1</th>
                <th colSpan={4} className="beds-report__header-cell beds-report__header-cell--quarter">Quarter 2</th>
                <th colSpan={4} className="beds-report__header-cell beds-report__header-cell--quarter">Quarter 3</th>
                <th colSpan={4} className="beds-report__header-cell beds-report__header-cell--quarter">Quarter 4</th>
                <th rowSpan={2} className="beds-report__header-cell beds-report__header-cell--grand">Grand Total</th>
            </tr>
            <tr>
                {['Jan', 'Feb', 'Mar', 'Total', 'Apr', 'May', 'Jun', 'Total', 'Jul', 'Aug', 'Sep', 'Total', 'Oct', 'Nov', 'Dec', 'Total'].map((label, index) => (
                    <th key={`${label}-${index}`} className={`beds-report__header-cell beds-report__header-cell--month${label === 'Total' ? ' beds-report__header-cell--subtotal' : ''}`}>{label}</th>
                ))}
            </tr>
        </>
    );

    return (
        <div className="report-card beds-report-card">
            <div className="report-card__header print-hidden">
                <h3 className="report-card__title">Budget Execution Documents (BEDS)</h3>
                <div className="report-card__actions">
                    <button type="button" onClick={handleDownloadBEDSXlsx} className="btn btn-primary btn-responsive" aria-label="Download XLSX">
                        <Download className="btn-symbol" aria-hidden="true" />
                        <span className="btn-text">Download XLSX</span>
                    </button>
                </div>
            </div>

            <div id="beds-report" className="beds-report-stack">
                {!isYearSelected && (
                    <div className="beds-report-alert">
                        Please select a specific Year to view BED 2 and BED 3 data properly.
                    </div>
                )}

                <div id="bed1-table-container" className="beds-report-section">
                    <div className="beds-report-section__header">
                        <h4 className="beds-report-section__title">BED 1: Financial Plan (Obligation)</h4>
                        <button
                            type="button"
                            onClick={() => onPrintReport({
                                reportName: withReportYearLabel('BEDS 1: Financial Plan (Obligation)', selectedYear, selectedReportingYear),
                                ouName: selectedOu === 'All' ? 'All OUs' : selectedOu,
                                tableElementId: 'bed1-report-table',
                                sectionName: 'BED 1: Financial Plan (Obligation)',
                            })}
                            className="btn btn-secondary btn-responsive"
                        >
                            <Printer className="btn-symbol" aria-hidden="true" />
                            <span className="btn-text">Print Table</span>
                        </button>
                    </div>
                    <div id="bed1-report-table" className="report-table-scroll beds-report-scroll">
                        <table className="beds-report-table">
                            <thead className="beds-report__head">
                                <tr>
                                    <th rowSpan={2} className="beds-report__header-cell beds-report__header-cell--sticky beds-report__header-cell--label">Program/Activity/Project</th>
                                    <th rowSpan={2} className="beds-report__header-cell beds-report__header-cell--indicator">Performance Indicator</th>
                                    <th colSpan={3} className="beds-report__header-cell beds-report__header-cell--subtotal">Current Year Obligation</th>
                                    <th rowSpan={2} className="beds-report__header-cell beds-report__header-cell--grand beds-report__header-cell--target">Total Target</th>
                                    <th colSpan={5} className="beds-report__header-cell beds-report__header-cell--quarter">Comprehensive Release</th>
                                    <th colSpan={5} className="beds-report__header-cell beds-report__header-cell--quarter">For Later Release</th>
                                </tr>
                                <tr>
                                    {['Actual (Jan-Sept)', 'Estimate (Oct-Dec)', 'Total', 'Q1', 'Q2', 'Q3', 'Q4', 'Subtotal', 'Q1', 'Q2', 'Q3', 'Q4', 'Subtotal'].map((label, index) => (
                                        <th key={`${label}-${index}`} className="beds-report__header-cell beds-report__header-cell--detail">{label}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>{renderData(bed1Data, 'BED1')}</tbody>
                            <tfoot>{renderBed1Totals(getGrandTotals(bed1Data), 'GRAND TOTAL')}</tfoot>
                        </table>
                    </div>
                </div>

                <div id="bed2-table-container" className="beds-report-section">
                    <div className="beds-report-section__header">
                        <h4 className="beds-report-section__title">BED 2: Physical Plan</h4>
                        <button
                            type="button"
                            onClick={() => onPrintReport({
                                reportName: withReportYearLabel('BEDS 2: Physical Plan', selectedYear, selectedReportingYear),
                                ouName: selectedOu === 'All' ? 'All OUs' : selectedOu,
                                tableElementId: 'bed2-report-table',
                                sectionName: 'BED 2: Physical Plan',
                            })}
                            className="btn btn-secondary btn-responsive"
                        >
                            <Printer className="btn-symbol" aria-hidden="true" />
                            <span className="btn-text">Print Table</span>
                        </button>
                    </div>
                    <div id="bed2-report-table" className="report-table-scroll beds-report-scroll">
                        <table className="beds-report-table">
                            <thead className="beds-report__head">{renderMonthlyHeader()}</thead>
                            <tbody>{renderData(bed2Data, 'BED2')}</tbody>
                            <tfoot>{renderMonthlyTotals(getGrandTotals(bed2Data), 'GRAND TOTAL', 'BED2')}</tfoot>
                        </table>
                    </div>
                </div>

                <div id="bed3-table-container" className="beds-report-section">
                    <div className="beds-report-section__header">
                        <h4 className="beds-report-section__title">BED 3: Monthly Disbursement Program</h4>
                        <button
                            type="button"
                            onClick={() => onPrintReport({
                                reportName: withReportYearLabel('BEDS 3: Monthly Disbursement Program', selectedYear, selectedReportingYear),
                                ouName: selectedOu === 'All' ? 'All OUs' : selectedOu,
                                tableElementId: 'bed3-report-table',
                                sectionName: 'BED 3: Monthly Disbursement Program',
                            })}
                            className="btn btn-secondary btn-responsive"
                        >
                            <Printer className="btn-symbol" aria-hidden="true" />
                            <span className="btn-text">Print Table</span>
                        </button>
                    </div>
                    {beds3Warnings.length > 0 && (
                        <div className="beds-report-alert beds-report-alert--warning print-hidden">
                            <AlertTriangle aria-hidden="true" />
                            <span>
                                {beds3Warnings.length.toLocaleString()} BEDS 3 target schedule issue{beds3Warnings.length === 1 ? '' : 's'} affecting {formatCurrencyWhole(bed3AffectedAmount)}.
                                Review Financial Audit filtered by BEDS 3 before finalizing this report.
                            </span>
                        </div>
                    )}
                    <div id="bed3-report-table" className="report-table-scroll beds-report-scroll">
                        <table className="beds-report-table">
                            <thead className="beds-report__head">{renderMonthlyHeader()}</thead>
                            <tbody>{renderData(bed3Data, 'BED3')}</tbody>
                            <tfoot>{renderMonthlyTotals(getGrandTotals(bed3Data), 'GRAND TOTAL', 'BED3')}</tfoot>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BEDSReport;
